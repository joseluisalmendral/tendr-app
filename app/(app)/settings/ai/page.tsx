import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  aiFeatureModelMapping,
  aiModelManifest,
  aiProviderConfigs,
  aiUsageLedger,
  workspaces,
} from "@/db/schema";
import { getCurrentWorkspace } from "@/lib/auth/get-current-workspace";

import { FeatureModelRow, type ManifestModel } from "./feature-model-row";
import { ProviderCard, type ProviderId } from "./provider-card";

/**
 * /settings/ai — single vertical view (no tabs) with three sections:
 *   1. Providers (5 BYO-key cards).
 *   2. Modelo por feature (4 rows of model Selects).
 *   3. Uso del mes (month cost vs budget).
 *
 * Server Component. Provider reads use ONLY allowlisted, non-secret columns
 * (the encrypted_* columns are never selected here — they are REVOKEd from user
 * roles and only ever touched via serviceDb in getProviderClient). Every read
 * carries an explicit workspaceId tenancy gate.
 *
 * NOTE (PR1b): the "Uso del mes" card sums ai_usage_ledger directly against the
 * UTC month bucket. PR3 introduces lib/ai/cost-budget.ts (getBudgetStatus) and
 * the 80% warning flag; this card is refactored onto it then. With no ledger
 * rows yet it renders the 0 EUR empty state correctly.
 */

export const dynamic = "force-dynamic";

const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "google", label: "Google Gemini" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "moonshot", label: "Kimi (Moonshot)" },
];

const FEATURES: {
  id: "adapt_template" | "summarize" | "suggest" | "extract_document";
  label: string;
}[] = [
  { id: "adapt_template", label: "Adaptar plantilla" },
  { id: "summarize", label: "Resumir relación" },
  { id: "suggest", label: "Sugerir acción" },
  { id: "extract_document", label: "Extraer documento" },
];

function formatEur(cents: number): string {
  return (cents / 100).toFixed(2);
}

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

  // Manifest is public-read; only non-deprecated models are selectable.
  const manifest: ManifestModel[] = await db
    .select({
      provider: aiModelManifest.provider,
      modelId: aiModelManifest.modelId,
      displayName: aiModelManifest.displayName,
      supportsPdf: aiModelManifest.supportsPdf,
      supportsStreaming: aiModelManifest.supportsStreaming,
    })
    .from(aiModelManifest)
    .where(sql`${aiModelManifest.deprecatedAt} is null`);

  // Month usage (UTC bucket — matches the ledger rollup index expression).
  const [usageRow] = await db
    .select({
      usedCents: sql<number>`coalesce(sum(${aiUsageLedger.costCents}), 0)`,
    })
    .from(aiUsageLedger)
    .where(
      and(
        eq(aiUsageLedger.workspaceId, workspaceId),
        sql`${aiUsageLedger.createdAt} >= date_trunc('month', timezone('UTC', now()))`,
      ),
    );

  const [budgetRow] = await db
    .select({ budgetCents: workspaces.aiMonthlyBudgetCents })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));

  const usedCents = Number(usageRow?.usedCents ?? 0);
  const budgetCents = budgetRow?.budgetCents ?? 5000;
  const percentUsed =
    budgetCents > 0 ? Math.round((usedCents / budgetCents) * 100) : 0;
  const warning = percentUsed >= 80;
  const configuredProviders = configs.map((c) => c.provider as ProviderId);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-12 p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Configuración de IA</h1>
        <p className="text-muted-foreground">
          Tu key se cifra con AES-256-GCM antes de guardarse. Nunca la mandamos
          a logs ni a Langfuse. Puedes revocarla cuando quieras.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Providers</h2>
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
        <h2 className="text-lg font-medium">Modelo por feature</h2>
        <div className="divide-y rounded-lg border">
          {FEATURES.map((f) => {
            const mapping = mappings.find((m) => m.feature === f.id);
            return (
              <FeatureModelRow
                key={f.id}
                feature={f.id}
                label={f.label}
                manifest={manifest}
                configuredProviders={configuredProviders}
                currentProvider={mapping?.provider ?? null}
                currentModelId={mapping?.modelId ?? null}
              />
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Uso del mes</h2>
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <p className="text-sm">
            Has usado {formatEur(usedCents)} EUR de {formatEur(budgetCents)} EUR
            este mes
          </p>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={percentUsed}
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
