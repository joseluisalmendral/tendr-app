import { generateText, type LanguageModel } from "ai";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import type * as schema from "@/db/schema";
import { aiUsageLedger, cases, clients, notes } from "@/db/schema";
import { assertWithinBudget, isBudgetExceededError } from "@/lib/ai/cost-budget";
import { computeCostCents } from "@/lib/ai/compute-cost-cents";
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
 * Pure, import-testable seam for the `suggest(caseId)` feature (F7 Block C /
 * PR4a) — a NON-streaming `generateText` Server Action.
 *
 * Behaviour (spec R-suggest):
 *   1. Validate caseId (uuid).
 *   2. Read the case + its client (explicit workspaceId gate). Context =
 *      clients.notes_summary if present, else the raw notes joined.
 *   3. Resolve model -> getProviderClient -> assertWithinBudget (BEFORE the call).
 *   4. Metadata-only trace: { workspaceId, caseId, clientId, feature, provider,
 *      model, contextChars } — NEVER the note/summary text.
 *   5. generateText (system: "Sugiere el siguiente paso o contenido para avanzar
 *      este caso").
 *   6. INSERT ai_usage_ledger, return { suggestion }. ZERO writes to
 *      clients/cases (ephemeral).
 *
 * SECRETS HARD-STOP: counts/lengths only in the trace; note/summary/suggestion
 * text NEVER reaches a span.
 */

const FEATURE = "suggest" as const;

const SYSTEM_PROMPT =
  "Sugiere el siguiente paso o contenido para avanzar este caso";

export const suggestInputSchema = z.object({
  caseId: z.string().uuid(),
});

export type SuggestInput = z.input<typeof suggestInputSchema>;

export interface SuggestDeps {
  db: PostgresJsDatabase<typeof schema>;
  getProviderClient: (
    workspaceId: string,
    provider: ModelForFeature["provider"],
  ) => Promise<ProviderClient>;
  getManifestCost: (
    db: PostgresJsDatabase<typeof schema>,
    provider: string,
    modelId: string,
  ) => Promise<ManifestCost | null>;
  trace: TracePort;
}

export type SuggestResult =
  | { ok: true; suggestion: string; budgetWarning?: boolean }
  | {
      ok: false;
      errorCode: AiErrorCode | "validation_error" | "not_found" | "budget_exceeded";
      error: string;
    };

export async function suggestWith(
  deps: SuggestDeps,
  workspaceId: string,
  rawInput: SuggestInput,
): Promise<SuggestResult> {
  const parsed = suggestInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, errorCode: "validation_error", error: "Datos inválidos." };
  }
  const { caseId } = parsed.data;

  // Case + client (explicit workspaceId gate on both).
  const [caseRow] = await deps.db
    .select({
      id: cases.id,
      title: cases.title,
      clientId: cases.clientId,
      clientName: clients.name,
      notesSummary: clients.notesSummary,
    })
    .from(cases)
    .innerJoin(clients, eq(cases.clientId, clients.id))
    .where(and(eq(cases.id, caseId), eq(cases.workspaceId, workspaceId)))
    .limit(1);

  if (!caseRow) {
    return { ok: false, errorCode: "not_found", error: "Caso no encontrado." };
  }

  // Context: notes_summary if present, else the raw notes joined.
  let context = caseRow.notesSummary ?? "";
  if (!context) {
    const clientNotes = await deps.db
      .select({ body: notes.body })
      .from(notes)
      .where(
        and(
          eq(notes.clientId, caseRow.clientId),
          eq(notes.workspaceId, workspaceId),
        ),
      )
      .orderBy(asc(notes.createdAt));
    context = clientNotes.map((n) => n.body).join("\n");
  }

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

  // Budget gate BEFORE building the client or the model call — we do not even
  // decrypt the BYO key when the workspace is already over budget.
  let budgetWarning = false;
  try {
    const status = await assertWithinBudget(deps.db, workspaceId);
    budgetWarning = status.warningThreshold;
  } catch (e) {
    if (isBudgetExceededError(e)) {
      return { ok: false, errorCode: "budget_exceeded", error: e.message };
    }
    throw e;
  }

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

  // Metadata-only trace — context text NEVER attached.
  const generation = deps.trace.startGeneration(FEATURE, model.modelId, {
    workspaceId,
    caseId,
    clientId: caseRow.clientId,
    feature: FEATURE,
    provider: model.provider,
    model: model.modelId,
    contextChars: context.length,
  });

  const userPrompt =
    `Caso: ${caseRow.title}\n` +
    `Cliente: ${caseRow.clientName}\n` +
    (context ? `Contexto:\n${context}` : "Sin contexto previo del cliente.");

  let result: Awaited<ReturnType<typeof generateText>>;
  let languageModel: LanguageModel;
  try {
    languageModel = providerClient(model.modelId);
    result = await generateText({
      model: languageModel,
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
    });
  } catch (e) {
    generation.end();
    await deps.trace.flush();
    const mapped = mapProviderError(e);
    return { ok: false, errorCode: mapped.code, error: mapped.message };
  }

  const inputTokens = result.usage?.inputTokens ?? 0;
  const outputTokens = result.usage?.outputTokens ?? 0;
  const cost = await deps.getManifestCost(deps.db, model.provider, model.modelId);
  const costCents = computeCostCents(
    inputTokens,
    outputTokens,
    cost?.costPer1kInput ?? 0,
    cost?.costPer1kOutput ?? 0,
  );

  const suggestion = result.text;

  // INSERT ledger ONLY — ZERO writes to clients/cases (ephemeral feature).
  await deps.db.insert(aiUsageLedger).values({
    workspaceId,
    feature: FEATURE,
    provider: model.provider,
    modelId: model.modelId,
    tokensIn: inputTokens,
    tokensOut: outputTokens,
    costCents,
  });

  generation.update({
    output: { length: suggestion.length },
    usageDetails: {
      input: inputTokens,
      output: outputTokens,
      total: result.usage?.totalTokens ?? inputTokens + outputTokens,
    },
  });
  generation.end();
  await deps.trace.flush();

  return { ok: true, suggestion, budgetWarning };
}
