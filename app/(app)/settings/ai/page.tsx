import { eq } from "drizzle-orm";

import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { aiFeatureModelMapping, aiProviderConfigs } from "@/db/schema";
import { getCurrentWorkspace } from "@/lib/auth/get-current-workspace";
import {
  getAvailableModels,
  type FeatureRequirements,
} from "@/lib/ai/manifest";
import { getBudgetStatus } from "@/lib/ai/cost-budget";
import { formatUsd } from "@/lib/ai/format-usd";

import {
  FeatureModelRow,
  type FeatureId,
  type FeatureModelOption,
} from "./feature-model-row";
import { ProviderCard, type ProviderId } from "./provider-card";

/**
 * /settings/ai — single vertical view (no tabs) with three sections:
 *   1. Providers (5 BYO-key cards).
 *   2. Modelo por feature (5 rows of model Selects).
 *   3. Uso del mes (month cost vs budget).
 *
 * Server Component. Provider reads use ONLY allowlisted, non-secret columns
 * (the encrypted_* columns are never selected here — they are REVOKEd from user
 * roles and only ever touched via serviceDb in getProviderClient). Every read
 * carries an explicit workspaceId tenancy gate.
 *
 * The "Uso del mes" card reads lib/ai/cost-budget.ts (getBudgetStatus) which
 * sums ai_usage_ledger.cost_microcents against the UTC month bucket (matching
 * the ledger rollup index) and exposes the 80% warning flag. It renders REAL
 * USD (F7c finding 1 — the manifest prices and Langfuse are USD, not EUR) with
 * sub-cent precision; with no ledger rows it shows the $0.00 empty state.
 */

export const dynamic = "force-dynamic";

const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "google", label: "Google Gemini" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "moonshot", label: "Kimi (Moonshot)" },
];

/**
 * Per-feature model capability requirements (design §8/§9). adapt_template and
 * summarize stream, so non-streaming models are ineligible. extract_document
 * prefers native PDF but the F6 pdf-parse fallback covers non-PDF models, so PDF
 * is a SOFT requirement (never an ineligibility reason). suggest is plain text.
 */
const FEATURES: {
  id: FeatureId;
  label: string;
  requirements: FeatureRequirements;
}[] = [
  {
    id: "adapt_template",
    label: "Adaptar plantilla",
    requirements: { requiresStreaming: true },
  },
  {
    id: "summarize",
    label: "Resumir relación",
    requirements: { requiresStreaming: true },
  },
  { id: "suggest", label: "Sugerir acción", requirements: {} },
  {
    id: "extract_document",
    label: "Extraer documento",
    requirements: { requiresPdfOrFallback: true },
  },
  // F7c PR-F7C-4b: 5th feature. Plain text in / structured HTML out via
  // generateObject — no streaming and no PDF requirement.
  { id: "beautify_email", label: "Embellecer email", requirements: {} },
];

export default async function AiSettingsPage() {
  const ws = await getCurrentWorkspace();
  if (!ws?.workspaceId) return null;
  const workspaceId = ws.workspaceId;

  // Provider configs — ALLOWLISTED non-secret columns only.
  const configs = await db
    .select({
      provider: aiProviderConfigs.provider,
      keyValidatedAt: aiProviderConfigs.keyValidatedAt,
      lastUsedAt: aiProviderConfigs.lastUsedAt,
    })
    .from(aiProviderConfigs)
    .where(eq(aiProviderConfigs.workspaceId, workspaceId));

  const mappings = await db
    .select({
      feature: aiFeatureModelMapping.feature,
      provider: aiFeatureModelMapping.provider,
      modelId: aiFeatureModelMapping.modelId,
    })
    .from(aiFeatureModelMapping)
    .where(eq(aiFeatureModelMapping.workspaceId, workspaceId));

  const configuredProviders = configs.map((c) => c.provider as ProviderId);

  // Resolve selectable models per feature via getAvailableModels (PR2): the
  // helper filters active/non-deprecated and flags eligibility per the feature's
  // requirements. We group the options per configured provider so each row's
  // Select renders exactly what the workspace can choose, ineligible disabled.
  const featureOptions: Record<
    FeatureId,
    Record<string, FeatureModelOption[]>
  > = {
    adapt_template: {},
    summarize: {},
    suggest: {},
    extract_document: {},
    beautify_email: {},
  };

  for (const feature of FEATURES) {
    for (const provider of configuredProviders) {
      const models = await getAvailableModels(
        db,
        provider,
        feature.requirements,
      );
      featureOptions[feature.id][provider] = models.map((m) => ({
        provider,
        modelId: m.modelId,
        displayName: m.displayName,
        eligible: m.eligible,
        ineligibleReason: m.ineligibleReason,
      }));
    }
  }

  // Month usage via the budget helper (UTC bucket matches the ledger rollup
  // index expression). Drives the progress bar and the 80% warning surface.
  const budget = await getBudgetStatus(db, workspaceId);
  const { usedMicrocents, budgetCents, warningThreshold: warning } = budget;
  // Budget is stored in integer cents; render it in USD micro-cents too.
  const budgetMicrocents = budgetCents * 10000;
  const percentUsed = Math.round(budget.percentUsed);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-12 p-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Configuración de IA
          </h1>
          <Badge variant="cobalt">IA</Badge>
        </div>
        <p className="text-muted-foreground">
          Tu key se cifra con AES-256-GCM antes de guardarse. Nunca la mandamos
          a logs ni a Langfuse. Puedes revocarla cuando quieras.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-lg font-medium">Providers</h2>
        <div className="flex flex-col gap-3">
          {PROVIDERS.map((p) => {
            const config = configs.find((c) => c.provider === p.id);
            return (
              <ProviderCard
                key={p.id}
                provider={p.id}
                label={p.label}
                configured={Boolean(config)}
                keyValidatedAt={config?.keyValidatedAt?.toISOString() ?? null}
                lastUsedAt={config?.lastUsedAt?.toISOString() ?? null}
              />
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-lg font-medium">Modelo por feature</h2>
        <div className="divide-y rounded-lg border">
          {FEATURES.map((f) => {
            const mapping = mappings.find((m) => m.feature === f.id);
            return (
              <FeatureModelRow
                key={f.id}
                feature={f.id}
                label={f.label}
                options={featureOptions[f.id]}
                configuredProviders={configuredProviders}
                currentProvider={mapping?.provider ?? null}
                currentModelId={mapping?.modelId ?? null}
              />
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <h2 className="font-heading text-lg font-medium">Uso del mes</h2>
          {warning ? (
            <Badge variant="destructive" aria-label="Has superado el 80% del budget mensual">
              80% budget
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <p className="text-sm">
            Has usado {formatUsd(usedMicrocents)} de {formatUsd(budgetMicrocents)}{" "}
            este mes
          </p>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={Math.min(percentUsed, 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Porcentaje del budget mensual usado"
          >
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.min(percentUsed, 100)}%` }}
            />
          </div>
          {warning ? (
            <p className="text-sm text-muted-foreground">
              Has superado el 80% del budget del mes.
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
