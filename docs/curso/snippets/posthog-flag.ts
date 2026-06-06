// PostHog feature flag helper · F10
// lib/feature-flags/client.ts

import { PostHog } from 'posthog-node'

let _client: PostHog | null = null

function getClient(): PostHog {
  if (!_client) {
    _client = new PostHog(process.env.POSTHOG_PERSONAL_API_KEY!, {
      host: process.env.POSTHOG_API_HOST ?? 'https://eu.i.posthog.com',
      flushAt: 1,
      flushInterval: 0,
    })
  }
  return _client
}

/**
 * Resuelve el default model para una feature consultando feature flags.
 *
 * Los workspaces con override manual (entrada en ai_feature_model_mapping)
 * ignoran este resolver; se usa solo cuando el workspace usa el default.
 */
export async function resolveDefaultModel(
  workspaceId: string,
  feature: 'adapt_template' | 'summarize' | 'suggest' | 'extract_document',
): Promise<{ provider: string; modelId: string }> {
  // Defaults fijos para features que no están en rollout activo.
  const FIXED_DEFAULTS = {
    adapt_template: { provider: 'openai', modelId: 'gpt-5.5' },
    summarize: { provider: 'openai', modelId: 'gpt-5.5' },
    extract_document: { provider: 'openai', modelId: 'gpt-5.5' },
  } as const

  if (feature !== 'suggest') {
    return FIXED_DEFAULTS[feature]
  }

  // 'suggest' está en rollout (ver ADR-008).
  const client = getClient()
  const flagEnabled = await client.isFeatureEnabled(
    'ai_default_model_suggest_v2',
    workspaceId,
  )

  if (flagEnabled) {
    // Nuevo default tras la revisión 1 del ADR-007.
    return { provider: 'anthropic', modelId: 'claude-haiku-4-5' }
  }

  // Default original (workspaces en cohorte v1).
  return { provider: 'openai', modelId: 'gpt-5.5' }
}

/**
 * Server cleanup; llamar en shutdown del proceso si aplica (no en Vercel
 * serverless, donde cada request es efímera).
 */
export async function shutdownPostHog() {
  if (_client) {
    await _client.shutdown()
    _client = null
  }
}

// ============================================================================
// Uso en lib/ai/get-model-for-feature.ts
// ============================================================================
//
// export async function getModelForFeature(
//   workspaceId: string,
//   feature: AiFeature,
// ): Promise<{ provider: string; modelId: string }> {
//   // 1. ¿El workspace tiene override manual?
//   const mapping = await db
//     .select()
//     .from(aiFeatureModelMapping)
//     .where(and(
//       eq(aiFeatureModelMapping.workspaceId, workspaceId),
//       eq(aiFeatureModelMapping.feature, feature),
//     ))
//     .limit(1)
//
//   if (mapping.length > 0) {
//     return {
//       provider: mapping[0].provider,
//       modelId: mapping[0].modelId,
//     }
//   }
//
//   // 2. Si no, usar default resuelto por feature flag (rollout).
//   return resolveDefaultModel(workspaceId, feature)
// }

// ============================================================================
// Tests sugeridos
// ============================================================================
//
// Mock PostHog SDK con vi.mock:
//
// vi.mock('posthog-node', () => ({
//   PostHog: vi.fn().mockImplementation(() => ({
//     isFeatureEnabled: vi.fn(),
//     shutdown: vi.fn(),
//   })),
// }))
//
// it('workspace con flag activo recibe nuevo default', async () => {
//   mockIsFeatureEnabled.mockResolvedValue(true)
//   const result = await resolveDefaultModel('ws-1', 'suggest')
//   expect(result).toEqual({ provider: 'anthropic', modelId: 'claude-haiku-4-5' })
// })
//
// it('workspace con flag inactivo recibe default v1', async () => {
//   mockIsFeatureEnabled.mockResolvedValue(false)
//   const result = await resolveDefaultModel('ws-2', 'suggest')
//   expect(result).toEqual({ provider: 'openai', modelId: 'gpt-5.5' })
// })
//
// it('feature distinta a suggest ignora flag', async () => {
//   const result = await resolveDefaultModel('ws-3', 'adapt_template')
//   expect(result).toEqual({ provider: 'openai', modelId: 'gpt-5.5' })
//   expect(mockIsFeatureEnabled).not.toHaveBeenCalled()
// })
