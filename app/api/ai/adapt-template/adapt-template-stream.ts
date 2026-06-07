import type { LanguageModel, StreamTextResult, ToolSet } from "ai";
import { streamText } from "ai";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import type * as schema from "@/db/schema";
import {
  aiUsageLedger,
  cases,
  clients,
  templateAdaptations,
  templates,
} from "@/db/schema";
import { assertWithinBudget, isBudgetExceededError } from "@/lib/ai/cost-budget";
import {
  computeCostMicrocents,
  microcentsToCents,
} from "@/lib/ai/compute-cost-microcents";
import {
  getModelForFeature,
  type ModelForFeature,
} from "@/lib/ai/get-model-for-feature";
import { type ManifestCost } from "@/lib/ai/manifest-cost";
import {
  AiProviderError,
  mapProviderError,
  type AiErrorCode,
} from "@/lib/ai/provider-errors";
import type { ProviderClient } from "@/lib/ai/get-provider-client";
import type { TracePort } from "@/lib/ai/trace";

/**
 * Pure, import-testable seam for the `adaptTemplate` STREAMING feature (F7 Block
 * C / PR4a). The streaming Route Handler is the thin wrapper; this seam holds
 * all business logic and is driven directly in tests with an injected mock model
 * + fake trace port (no network, no real Langfuse).
 *
 * Order of operations (design §4):
 *   1. Resolve the workspace template + client (explicit workspaceId tenancy
 *      gate; RLS via the user-session db handle).
 *   2. getModelForFeature(workspaceId, 'adapt_template') -> { provider, modelId }.
 *   3. getProviderClient(workspaceId, provider) -> client closure (the plaintext
 *      key lives only inside the closure — never traced/logged).
 *   4. assertWithinBudget BEFORE the model call (BudgetExceededError -> 429).
 *   5. startGeneration('adapt_template', model, metadata) — METADATA ONLY.
 *   6. streamText with system + the template body + client notes (these go to
 *      the MODEL, never to the trace).
 *   7. onFinish: compute cost from the manifest, INSERT ai_usage_ledger (real
 *      usage), generation.update({ output:{length}, usageDetails }) + end +
 *      flush. The generated text is NEVER traced.
 *
 * On a thrown error the seam returns a typed failure ({ ok:false, errorCode })
 * so the route handler maps it to the right HTTP status; on success it returns
 * the StreamTextResult so the handler calls `.toTextStreamResponse()`.
 *
 * SECRETS HARD-STOP: the trace carries only { workspaceId, templateId, clientId,
 * feature, provider, model, templateLength, clientName } — never body_markdown,
 * never client notes, never the streamed text.
 */

const FEATURE = "adapt_template" as const;

/** Max free-text steering the user may add. Bounded so it cannot blow up the
 *  prompt (or the persisted row). 2000 chars is generous for a few sentences. */
export const EXTRA_INSTRUCTIONS_MAX = 2000;

/** Cases considered "active" for personalization context — the open pipeline
 *  stages, NOT closed_won / closed_lost. */
const ACTIVE_CASE_STATUSES = ["prospect", "proposal", "active"] as const;

export const adaptTemplateInputSchema = z.object({
  templateId: z.string().uuid(),
  clientId: z.string().uuid(),
  // Optional free-text the user typed in the adapt dialog. Trimmed + bounded;
  // empty/whitespace normalizes to undefined so it never adds a blank section.
  extraInstructions: z
    .string()
    .trim()
    .max(EXTRA_INSTRUCTIONS_MAX, "Las instrucciones extra son demasiado largas.")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

export type AdaptTemplateInput = z.input<typeof adaptTemplateInputSchema>;

export interface AdaptTemplateDeps {
  /** User-session Drizzle client (RLS applies); reads template + client + ledger. */
  db: PostgresJsDatabase<typeof schema>;
  /** Resolves the provider client (decrypts the BYO key inside its closure). */
  getProviderClient: (
    workspaceId: string,
    provider: ModelForFeature["provider"],
  ) => Promise<ProviderClient>;
  /** Reads the manifest cost row for (provider, modelId). Injected for tests. */
  getManifestCost: (
    db: PostgresJsDatabase<typeof schema>,
    provider: string,
    modelId: string,
  ) => Promise<ManifestCost | null>;
  /** Langfuse tracing port (metadata-only). */
  trace: TracePort;
}

export type AdaptTemplateStreamResult =
  | { ok: true; stream: StreamTextResult<ToolSet, never> }
  | { ok: false; errorCode: AiErrorCode | "validation_error" | "not_found" | "budget_exceeded"; error: string };

const SYSTEM_PROMPT =
  "Adapta la plantilla para el cliente indicado. Mantén el formato markdown, " +
  "personaliza el tono y las referencias al cliente, y conserva las variables " +
  "que no apliquen. Usa el resumen de notas y los casos activos del cliente " +
  "para personalizar el contenido de forma relevante y profesional. Mantén un " +
  "tono cercano pero profesional, adecuado a una relación comercial B2B. Si el " +
  "usuario incluye instrucciones adicionales, respétalas con prioridad. " +
  "Devuelve solo el markdown adaptado, sin explicaciones.";

/**
 * Runs the adaptTemplate streaming feature. Returns the StreamTextResult on
 * success (the handler streams it); a typed failure otherwise.
 */
export async function adaptTemplateStreamWith(
  deps: AdaptTemplateDeps,
  workspaceId: string,
  rawInput: AdaptTemplateInput,
): Promise<AdaptTemplateStreamResult> {
  const parsed = adaptTemplateInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: "validation_error",
      error: "Datos inválidos.",
    };
  }
  const { templateId, clientId, extraInstructions } = parsed.data;

  // 1. Template + client lookup — explicit workspaceId tenancy gate on BOTH.
  const [template] = await deps.db
    .select({ bodyMarkdown: templates.bodyMarkdown, name: templates.name })
    .from(templates)
    .where(
      and(eq(templates.id, templateId), eq(templates.workspaceId, workspaceId)),
    )
    .limit(1);

  const [client] = await deps.db
    .select({ name: clients.name, notes: clients.notesSummary })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)))
    .limit(1);

  if (!template || !client) {
    return {
      ok: false,
      errorCode: "not_found",
      error: "No se encontró la plantilla o el cliente.",
    };
  }

  // 1b. Active cases for this client (workspace-scoped) — title + status feed
  //     the personalized prompt. Closed cases are excluded as not "active".
  const activeCases = await deps.db
    .select({ title: cases.title, status: cases.status })
    .from(cases)
    .where(
      and(
        eq(cases.clientId, clientId),
        eq(cases.workspaceId, workspaceId),
        inArray(cases.status, ACTIVE_CASE_STATUSES),
      ),
    );

  // 2. Resolve the model for the feature.
  let model: ModelForFeature;
  try {
    model = await getModelForFeature(deps.db, workspaceId, FEATURE);
  } catch (e) {
    return {
      ok: false,
      errorCode: "NO_KEY_CONFIGURED",
      error: e instanceof Error ? e.message : "No hay modelo configurado.",
    };
  }

  // 3. Budget gate BEFORE building the client or the model call — we do not
  //    even decrypt the BYO key when the workspace is already over budget.
  try {
    await assertWithinBudget(deps.db, workspaceId);
  } catch (e) {
    if (isBudgetExceededError(e)) {
      return { ok: false, errorCode: "budget_exceeded", error: e.message };
    }
    throw e;
  }

  // 4. Build the provider client (plaintext key lives only in the closure).
  let providerClient: ProviderClient;
  try {
    providerClient = await deps.getProviderClient(workspaceId, model.provider);
  } catch (e) {
    const mapped =
      e instanceof Error && e.name === "ProviderNotConfiguredError"
        ? new AiProviderError("NO_KEY_CONFIGURED")
        : mapProviderError(e);
    return { ok: false, errorCode: mapped.code, error: mapped.message };
  }

  // 5. Metadata-only trace. NEVER the body, notes, cases text, or extra
  //    instructions — only LENGTHS + COUNTS + ids (PII HARD-STOP, #748).
  const generation = deps.trace.startGeneration(FEATURE, model.modelId, {
    workspaceId,
    templateId,
    clientId,
    feature: FEATURE,
    provider: model.provider,
    model: model.modelId,
    templateLength: template.bodyMarkdown.length,
    clientName: client.name,
    notesSummaryLength: client.notes?.length ?? 0,
    activeCasesCount: activeCases.length,
    extraInstructionsLength: extraInstructions?.length ?? 0,
  });

  // The body + notes + active cases + extra instructions go to the MODEL
  // (prompt), NEVER to the trace.
  const casesBlock =
    activeCases.length > 0
      ? "Casos activos del cliente:\n" +
        activeCases
          .map((c) => `- ${c.title} (estado: ${c.status ?? "sin estado"})`)
          .join("\n") +
        "\n\n"
      : "";

  const userPrompt =
    `Cliente: ${client.name}\n` +
    (client.notes ? `Resumen de notas del cliente: ${client.notes}\n\n` : "\n") +
    casesBlock +
    (extraInstructions
      ? `Instrucciones adicionales del usuario: ${extraInstructions}\n\n`
      : "") +
    `Plantilla (markdown):\n${template.bodyMarkdown}`;

  let languageModel: LanguageModel;
  try {
    languageModel = providerClient(model.modelId);
  } catch (e) {
    generation.end();
    await deps.trace.flush();
    const mapped = mapProviderError(e);
    return { ok: false, errorCode: mapped.code, error: mapped.message };
  }

  // 6. Stream. onFinish does the ledger insert + closes the trace.
  const stream = streamText({
    model: languageModel,
    system: SYSTEM_PROMPT,
    prompt: userPrompt,
    onFinish: async ({ text, usage, totalUsage }) => {
      const u = totalUsage ?? usage;
      const inputTokens = u?.inputTokens ?? 0;
      const outputTokens = u?.outputTokens ?? 0;

      const cost = await deps.getManifestCost(
        deps.db,
        model.provider,
        model.modelId,
      );
      // F7c: bill in USD micro-cents with NO per-call ceil (Langfuse parity).
      // Dual-write the legacy cost_cents (nearest cent) during the transition.
      const costMicrocents = computeCostMicrocents(
        inputTokens,
        outputTokens,
        cost?.costPer1kInput ?? 0,
        cost?.costPer1kOutput ?? 0,
      );
      const costCents = microcentsToCents(costMicrocents);

      // Ledger insert only when we have REAL usage (a cancelled stream with no
      // usable token counts must not write a phantom row).
      if (inputTokens > 0 || outputTokens > 0) {
        await deps.db.insert(aiUsageLedger).values({
          workspaceId,
          feature: FEATURE,
          provider: model.provider,
          modelId: model.modelId,
          tokensIn: inputTokens,
          tokensOut: outputTokens,
          costCents,
          costMicrocents,
        });
      }

      // AUTOMATIC PERSIST (F7c finding 3): once the adaptation completes, store
      // the full streamed result linked to (workspace, template, client) so the
      // dialog history + copy button can read it (PR-F7C-3b). Only persist a
      // non-empty result. The user-session db is RLS-bound; the explicit
      // workspaceId is the same gate used for the lookups above. The result
      // text is client PII living under the workspace's own RLS — acceptable,
      // and NEVER traced.
      if (text.length > 0) {
        await deps.db.insert(templateAdaptations).values({
          workspaceId,
          templateId,
          clientId,
          resultText: text,
          extraInstructions: extraInstructions ?? null,
          provider: model.provider,
          modelId: model.modelId,
        });
      }

      // Trace output carries ONLY a length + usage — never the generated text.
      generation.update({
        output: { length: text.length },
        usageDetails: {
          input: inputTokens,
          output: outputTokens,
          total: u?.totalTokens ?? inputTokens + outputTokens,
        },
      });
      generation.end();
      await deps.trace.flush();
    },
    onError: async () => {
      // The stream errored mid-flight: close the trace without a phantom ledger
      // row (no real usage available).
      generation.end();
      await deps.trace.flush();
    },
    onAbort: async () => {
      // Client aborted mid-stream: AI SDK v6 fires onAbort INSTEAD of
      // onFinish/onError, so close the trace here too or the generation
      // observation dangles in Langfuse. No ledger row (no real usage).
      generation.end();
      await deps.trace.flush();
    },
  });

  return { ok: true, stream };
}
