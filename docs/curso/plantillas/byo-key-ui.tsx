// UI plantilla de /settings/ai · F7
// Server Component con tres secciones en una sola vista.
// El alumno NO copia literal; sirve como referencia visual del layout.

import { getCurrentWorkspace } from '@/lib/auth/get-current-workspace'
import { getBudgetStatus } from '@/lib/ai/cost-budget'
import { db } from '@/db'
import { aiProviderConfigs, aiFeatureModelMapping, aiModelManifest } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { ProviderCard } from './provider-card'
import { FeatureModelRow } from './feature-model-row'

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'google', label: 'Google Gemini' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'moonshot', label: 'Kimi (Moonshot)' },
] as const

const FEATURES = [
  { id: 'adapt_template', label: 'Adaptar plantilla', requires: { streaming: true } },
  { id: 'summarize', label: 'Resumir relación', requires: { streaming: true } },
  { id: 'suggest', label: 'Sugerir acción', requires: {} },
  { id: 'extract_document', label: 'Extraer documento', requires: { pdfOrFallback: true } },
] as const

export default async function AiSettingsPage() {
  const ws = await getCurrentWorkspace()
  if (!ws?.workspaceId) return null

  const configs = await db
    .select({
      provider: aiProviderConfigs.provider,
      validatedAt: aiProviderConfigs.keyValidatedAt,
      lastUsedAt: aiProviderConfigs.lastUsedAt,
    })
    .from(aiProviderConfigs)
    .where(eq(aiProviderConfigs.workspaceId, ws.workspaceId))

  const mappings = await db
    .select()
    .from(aiFeatureModelMapping)
    .where(eq(aiFeatureModelMapping.workspaceId, ws.workspaceId))

  const manifest = await db.select().from(aiModelManifest)

  const budget = await getBudgetStatus(ws.workspaceId)
  const usedEur = (budget.usedCents / 100).toFixed(2)
  const budgetEur = (budget.budgetCents / 100).toFixed(2)

  return (
    <main className="max-w-3xl mx-auto p-8 space-y-12">
      <header>
        <h1 className="text-2xl font-semibold">Configuración de IA</h1>
        <p className="text-muted-foreground mt-2">
          Tus API keys se cifran con AES-256-GCM. Nunca se mandan a logs ni a
          Langfuse. Puedes revocarlas cuando quieras.
        </p>
      </header>

      {/* Sección Providers */}
      <section>
        <h2 className="font-medium mb-4">Providers</h2>
        <div className="space-y-2">
          {PROVIDERS.map((p) => {
            const config = configs.find((c) => c.provider === p.id)
            return (
              <ProviderCard
                key={p.id}
                provider={p.id}
                label={p.label}
                configured={Boolean(config)}
                validatedAt={config?.validatedAt}
                lastUsedAt={config?.lastUsedAt}
              />
            )
          })}
        </div>
      </section>

      {/* Sección Models per feature */}
      <section>
        <h2 className="font-medium mb-4">Modelo por feature</h2>
        <div className="border rounded-lg divide-y">
          {FEATURES.map((f) => {
            const mapping = mappings.find((m) => m.feature === f.id)
            return (
              <FeatureModelRow
                key={f.id}
                feature={f.id}
                label={f.label}
                requires={f.requires}
                currentProvider={mapping?.provider ?? null}
                currentModelId={mapping?.modelId ?? null}
                manifest={manifest}
                configuredProviders={configs.map((c) => c.provider)}
              />
            )
          })}
        </div>
      </section>

      {/* Sección Uso del mes */}
      <section>
        <h2 className="font-medium mb-4">Uso del mes en curso</h2>
        <div className="border rounded-lg p-4">
          <p className="text-2xl font-semibold">
            {usedEur} EUR <span className="text-muted-foreground text-base"> / {budgetEur} EUR</span>
          </p>
          <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full ${
                budget.percentUsed >= 100
                  ? 'bg-destructive'
                  : budget.percentUsed >= 80
                    ? 'bg-orange-500'
                    : 'bg-primary'
              }`}
              style={{ width: `${Math.min(budget.percentUsed, 100)}%` }}
              aria-label={`${budget.percentUsed.toFixed(0)}% del budget usado`}
            />
          </div>
          {budget.warningThreshold && (
            <p className="text-orange-700 text-sm mt-3">
              Has superado el 80% del budget del mes. Al llegar al 100%, las
              features IA se bloquearán hasta el próximo mes o hasta que subas
              el budget.
            </p>
          )}
          <p className="text-muted-foreground text-xs mt-3">
            El budget se calcula con tarifas del manifest y los tokens reales
            de cada llamada. Reset implícito el día 1 de cada mes.
          </p>
        </div>
      </section>
    </main>
  )
}
