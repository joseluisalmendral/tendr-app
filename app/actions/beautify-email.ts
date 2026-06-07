import { generateObject } from "ai";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type * as schema from "@/db/schema";
import { aiUsageLedger, templateAdaptations } from "@/db/schema";
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
import {
  EMAIL_PALETTE_IDS,
  getEmailPalette,
  type EmailPalette,
} from "@/lib/email/email-palettes";
import { sanitizeEmailHtml } from "@/lib/email/sanitize-email-html";

/**
 * Pure, import-testable seam for the `beautify_email` feature (F7c PR-F7C-4a,
 * decision #777, plan-beautify #778) — a NON-streaming `generateObject` Server
 * Action that turns a stored adaptation into an email-client-safe HTML email.
 *
 * Behaviour (mirrors the summarize seam shape):
 *   1. Validate input (adaptationId uuid, paletteId in the curated set, optional tone).
 *   2. Read the adaptation (EXPLICIT workspaceId gate) -> not_found cross-tenant.
 *   3. Resolve model -> getProviderClient -> assertWithinBudget (BEFORE the call).
 *   4. generateObject with a Zod { subject, preheader, html } schema; the system
 *      prompt enforces email-client-safe HTML. The adaptation text + palette
 *      tokens go to the MODEL, never the trace.
 *   5. SANITIZE the returned html BEFORE persist/return (untrusted model output).
 *   6. UPDATE the adaptation row's beautified_* columns (id + workspaceId gate),
 *      INSERT ai_usage_ledger (feature='beautify_email', micro-cents + legacy
 *      cents), and trace metadata only (ids/lengths/palette — NEVER the HTML,
 *      subject, or preheader text).
 *   Regenerate overwrites the beautified_* columns in place.
 *
 * SECRETS/PII HARD-STOP (#748): the trace carries ids + lengths + paletteId
 * only. The adaptation text, generated HTML, subject, and preheader NEVER reach
 * a span. The generated HTML is stored in the user's own RLS-scoped adaptation
 * row (same tenancy as result_text) — acceptable PII.
 */

const FEATURE = "beautify_email" as const;

/** Structured output schema — guarantees the three fields parse deterministically. */
const beautifyOutputSchema = z.object({
  subject: z.string().describe("Línea de asunto del email, concisa y clara."),
  preheader: z
    .string()
    .describe("Texto de previsualización (preheader), 1 frase corta."),
  html: z
    .string()
    .describe("Documento HTML completo, listo para clientes de correo."),
});

const SYSTEM_PROMPT = [
  "Eres un diseñador de emails profesional. Conviertes un texto en un email HTML",
  "completo, válido y seguro para clientes de correo (Gmail, Apple Mail, Outlook).",
  "Reglas OBLIGATORIAS:",
  "- Devuelve un documento HTML completo (<!DOCTYPE html>, <html>, <head>, <body>).",
  "- CSS SIEMPRE inline en los elementos (Gmail elimina <link>). Usa <style> solo",
  "  para media queries y dark mode.",
  "- Maquetación con tablas anidadas (layout híbrido), ancho máximo 600px,",
  "  una sola columna fluida.",
  "- Tipografías web-safe: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif.",
  "- Botón CTA a prueba de balas: <table> + <a> con padding inline, color de fondo",
  "  del acento y border-radius (el padding va en el ancla, no en un <button>).",
  "- Incluye <meta name=\"color-scheme\" content=\"light dark\"> y",
  "  <meta name=\"supported-color-schemes\" content=\"light dark\"> en <head>, más un",
  "  bloque @media (prefers-color-scheme: dark) coherente con la paleta.",
  "- Incluye un preheader: un <span> oculto al inicio del <body>",
  "  (display:none; max-height:0; overflow:hidden; mso-hide:all).",
  "- NO uses imágenes remotas, NI <script>, NI recursos externos.",
  "- Usa EXACTAMENTE los colores de la paleta proporcionada (bg, surface, text,",
  "  accent, accentText).",
].join("\n");

function buildPrompt(
  adaptedText: string,
  palette: EmailPalette,
  tone?: string,
): string {
  const toneLine = tone ? `Tono deseado: ${tone}.` : "";
  return [
    `Paleta "${palette.name}" (usa estos colores exactos):`,
    `- bg: ${palette.bg}`,
    `- surface: ${palette.surface}`,
    `- text: ${palette.text}`,
    `- accent: ${palette.accent}`,
    `- accentText: ${palette.accentText}`,
    toneLine,
    "",
    "Texto a transformar en email HTML:",
    adaptedText,
  ]
    .filter(Boolean)
    .join("\n");
}

export const beautifyEmailInputSchema = z.object({
  adaptationId: z.string().uuid(),
  paletteId: z
    .string()
    .refine((v) => EMAIL_PALETTE_IDS.includes(v), "Paleta no válida."),
  tone: z.string().max(120).optional(),
});

export type BeautifyEmailInput = z.input<typeof beautifyEmailInputSchema>;

export interface BeautifyEmailDeps {
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

export type BeautifyEmailResult =
  | {
      ok: true;
      subject: string;
      preheader: string;
      html: string;
      paletteId: string;
      budgetWarning?: boolean;
    }
  | {
      ok: false;
      errorCode:
        | AiErrorCode
        | "validation_error"
        | "not_found"
        | "budget_exceeded";
      error: string;
    };

export async function beautifyEmailWith(
  deps: BeautifyEmailDeps,
  workspaceId: string,
  rawInput: BeautifyEmailInput,
): Promise<BeautifyEmailResult> {
  const parsed = beautifyEmailInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: "validation_error",
      error: "Datos inválidos.",
    };
  }
  const { adaptationId, paletteId, tone } = parsed.data;

  const palette = getEmailPalette(paletteId);
  if (!palette) {
    return { ok: false, errorCode: "validation_error", error: "Paleta no válida." };
  }

  // Read the adaptation with an EXPLICIT workspaceId gate (cross-tenant -> not_found).
  const [adaptation] = await deps.db
    .select({ id: templateAdaptations.id, resultText: templateAdaptations.resultText })
    .from(templateAdaptations)
    .where(
      and(
        eq(templateAdaptations.id, adaptationId),
        eq(templateAdaptations.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!adaptation) {
    return { ok: false, errorCode: "not_found", error: "Adaptación no encontrada." };
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

  // Metadata-only trace — adaptation text / generated HTML NEVER attached.
  const generation = deps.trace.startGeneration(FEATURE, model.modelId, {
    workspaceId,
    adaptationId,
    feature: FEATURE,
    provider: model.provider,
    model: model.modelId,
    paletteId,
    sourceChars: adaptation.resultText.length,
  });

  let result: Awaited<ReturnType<typeof generateObject<typeof beautifyOutputSchema>>>;
  try {
    result = await generateObject({
      model: providerClient(model.modelId),
      schema: beautifyOutputSchema,
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(adaptation.resultText, palette, tone),
    });
  } catch (e) {
    generation.end();
    await deps.trace.flush();
    const mapped = mapProviderError(e);
    return { ok: false, errorCode: mapped.code, error: mapped.message };
  }

  const { subject, preheader } = result.object;
  // SANITIZE the untrusted model HTML BEFORE persist/return.
  const html = sanitizeEmailHtml(result.object.html);

  const inputTokens = result.usage?.inputTokens ?? 0;
  const outputTokens = result.usage?.outputTokens ?? 0;
  const cost = await deps.getManifestCost(deps.db, model.provider, model.modelId);
  // USD micro-cents, no per-call ceil. Dual-write legacy cost_cents.
  const costMicrocents = computeCostMicrocents(
    inputTokens,
    outputTokens,
    cost?.costPer1kInput ?? 0,
    cost?.costPer1kOutput ?? 0,
  );
  const costCents = microcentsToCents(costMicrocents);

  // UPDATE the adaptation row's beautified_* columns (id + workspaceId gate);
  // regenerate overwrites in place.
  await deps.db
    .update(templateAdaptations)
    .set({
      beautifiedHtml: html,
      emailSubject: subject,
      emailPreheader: preheader,
      beautifiedPalette: paletteId,
      beautifiedAt: new Date(),
    })
    .where(
      and(
        eq(templateAdaptations.id, adaptationId),
        eq(templateAdaptations.workspaceId, workspaceId),
      ),
    );

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

  // Trace output carries ONLY lengths + usage — never the HTML/subject/preheader.
  generation.update({
    output: {
      htmlLength: html.length,
      subjectLength: subject.length,
      preheaderLength: preheader.length,
    },
    usageDetails: {
      input: inputTokens,
      output: outputTokens,
      total: result.usage?.totalTokens ?? inputTokens + outputTokens,
    },
  });
  generation.end();
  await deps.trace.flush();

  return { ok: true, subject, preheader, html, paletteId, budgetWarning };
}
