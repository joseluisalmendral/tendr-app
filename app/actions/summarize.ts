import { generateText, type LanguageModel } from "ai";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import type * as schema from "@/db/schema";
import { aiUsageLedger, clients, notes } from "@/db/schema";
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
 * Pure, import-testable seam for the `summarize(clientId)` feature (F7 Block C /
 * PR4a) — a NON-streaming `generateText` Server Action.
 *
 * Behaviour (spec R-summarize):
 *   1. Validate clientId (uuid).
 *   2. Read the client's notes ordered by created_at (explicit workspaceId gate).
 *   3. NO notes -> return { ok:true, summary:"" } WITHOUT a model call or a
 *      ledger insert (no phantom usage).
 *   4. Resolve model -> getProviderClient -> assertWithinBudget (BEFORE the call).
 *   5. Metadata-only trace: { workspaceId, clientId, feature, provider, model,
 *      noteCount, totalChars } — NEVER the note text.
 *   6. generateText (system: "Resume la relación con el cliente en 4-6 frases
 *      accionables") — the notes go to the MODEL, not the trace.
 *   7. UPDATE clients.notes_summary, INSERT ai_usage_ledger, return { summary }.
 *
 * SECRETS HARD-STOP: the trace carries counts/lengths only; the note text and
 * the produced summary text NEVER reach a span.
 */

const FEATURE = "summarize" as const;

const SYSTEM_PROMPT =
  "Resume la relación con el cliente en 4-6 frases accionables";

export const summarizeInputSchema = z.object({
  clientId: z.string().uuid(),
});

export type SummarizeInput = z.input<typeof summarizeInputSchema>;

export interface SummarizeDeps {
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

export type SummarizeResult =
  | { ok: true; summary: string; budgetWarning?: boolean }
  | {
      ok: false;
      errorCode: AiErrorCode | "validation_error" | "not_found" | "budget_exceeded";
      error: string;
    };

export async function summarizeWith(
  deps: SummarizeDeps,
  workspaceId: string,
  rawInput: SummarizeInput,
): Promise<SummarizeResult> {
  const parsed = summarizeInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, errorCode: "validation_error", error: "Datos inválidos." };
  }
  const { clientId } = parsed.data;

  // Confirm the client belongs to the workspace (explicit tenancy gate).
  const [client] = await deps.db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)))
    .limit(1);
  if (!client) {
    return { ok: false, errorCode: "not_found", error: "Cliente no encontrado." };
  }

  // Notes ordered by created_at (explicit workspaceId gate).
  const clientNotes = await deps.db
    .select({ body: notes.body })
    .from(notes)
    .where(and(eq(notes.clientId, clientId), eq(notes.workspaceId, workspaceId)))
    .orderBy(asc(notes.createdAt));

  // No notes -> empty summary WITHOUT a model call or a ledger insert.
  if (clientNotes.length === 0) {
    return { ok: true, summary: "" };
  }

  const joined = clientNotes.map((n) => n.body).join("\n");

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

  // Metadata-only trace — note text NEVER attached.
  const generation = deps.trace.startGeneration(FEATURE, model.modelId, {
    workspaceId,
    clientId,
    feature: FEATURE,
    provider: model.provider,
    model: model.modelId,
    noteCount: clientNotes.length,
    totalChars: joined.length,
  });

  let result: Awaited<ReturnType<typeof generateText>>;
  let languageModel: LanguageModel;
  try {
    languageModel = providerClient(model.modelId);
    result = await generateText({
      model: languageModel,
      system: SYSTEM_PROMPT,
      prompt: `Notas del cliente:\n${joined}`,
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

  const summary = result.text;

  // UPDATE clients.notes_summary + INSERT ledger.
  await deps.db
    .update(clients)
    .set({ notesSummary: summary })
    .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)));

  await deps.db.insert(aiUsageLedger).values({
    workspaceId,
    feature: FEATURE,
    provider: model.provider,
    modelId: model.modelId,
    tokensIn: inputTokens,
    tokensOut: outputTokens,
    costCents,
  });

  // Trace output carries ONLY a length + usage — never the summary text.
  generation.update({
    output: { length: summary.length },
    usageDetails: {
      input: inputTokens,
      output: outputTokens,
      total: result.usage?.totalTokens ?? inputTokens + outputTokens,
    },
  });
  generation.end();
  await deps.trace.flush();

  return { ok: true, summary, budgetWarning };
}
