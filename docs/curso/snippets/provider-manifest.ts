// Manifest seed · F7
// db/seeds/ai_model_manifest.ts
//
// Cinco providers, ~10 modelos. Costes y capabilities verificados con
// Context7 / docs oficiales en junio 2026. Cuando un modelo cambie de
// precio o capability, actualizar este seed y volver a ejecutar
// `pnpm db:seed`. Verifica siempre los IDs vigentes con Context7 antes
// de sembrar: los providers retiran modelos con frecuencia.
//
// Estructura: el alumno revisa este archivo antes de ejecutar el seed.

import { db } from '@/db'
import { aiModelManifest } from '@/db/schema'

const MANIFEST: Array<typeof aiModelManifest.$inferInsert> = [
  // OpenAI
  {
    provider: 'openai',
    modelId: 'gpt-5.5',
    displayName: 'GPT-5.5',
    supportsMultimodal: true,
    supportsPdf: true,
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 1_000_000,
    costPer1kInput: '0.005000',
    costPer1kOutput: '0.030000',
  },
  {
    provider: 'openai',
    modelId: 'gpt-5.4-mini',
    displayName: 'GPT-5.4 mini',
    supportsMultimodal: true,
    supportsPdf: true,
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 400_000,
    costPer1kInput: '0.000250',
    costPer1kOutput: '0.002000',
  },

  // Anthropic
  {
    provider: 'anthropic',
    modelId: 'claude-opus-4-8',
    displayName: 'Claude Opus 4.8',
    supportsMultimodal: true,
    supportsPdf: true,
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 1_000_000,
    costPer1kInput: '0.005000',
    costPer1kOutput: '0.025000',
  },
  {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    supportsMultimodal: true,
    supportsPdf: true,
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 200_000,
    costPer1kInput: '0.003000',
    costPer1kOutput: '0.015000',
  },
  {
    provider: 'anthropic',
    modelId: 'claude-haiku-4-5',
    displayName: 'Claude Haiku 4.5',
    supportsMultimodal: true,
    supportsPdf: false,
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 200_000,
    costPer1kInput: '0.000250',
    costPer1kOutput: '0.001250',
  },

  // Google Gemini
  {
    provider: 'google',
    modelId: 'gemini-3.1-pro',
    displayName: 'Gemini 3.1 Pro',
    supportsMultimodal: true,
    supportsPdf: true,
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 1_000_000,
    costPer1kInput: '0.002500',
    costPer1kOutput: '0.015000',
  },
  {
    provider: 'google',
    modelId: 'gemini-3.5-flash',
    displayName: 'Gemini 3.5 Flash',
    supportsMultimodal: true,
    supportsPdf: true,
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 1_000_000,
    costPer1kInput: '0.001500',
    costPer1kOutput: '0.009000',
  },

  // DeepSeek
  {
    provider: 'deepseek',
    modelId: 'deepseek-v4-pro',
    displayName: 'DeepSeek V4 Pro',
    supportsMultimodal: false,
    supportsPdf: false,
    supportsImage: false,
    supportsStreaming: true,
    maxInputTokens: 1_000_000,
    costPer1kInput: '0.000280',
    costPer1kOutput: '0.001100',
  },
  {
    provider: 'deepseek',
    modelId: 'deepseek-v4-flash',
    displayName: 'DeepSeek V4 Flash',
    supportsMultimodal: false,
    supportsPdf: false,
    supportsImage: false,
    supportsStreaming: true,
    maxInputTokens: 1_000_000,
    costPer1kInput: '0.000140',
    costPer1kOutput: '0.000550',
  },

  // Kimi (Moonshot)
  {
    provider: 'moonshot',
    modelId: 'kimi-k2.6',
    displayName: 'Kimi K2.6',
    supportsMultimodal: false,
    supportsPdf: false,
    supportsImage: false,
    supportsStreaming: true,
    maxInputTokens: 200_000,
    costPer1kInput: '0.000600',
    costPer1kOutput: '0.002400',
  },
]

export async function seedManifest() {
  await db.delete(aiModelManifest).execute()
  await db.insert(aiModelManifest).values(MANIFEST).execute()
  console.log(`Manifest poblado con ${MANIFEST.length} modelos.`)
}

// Default per-feature documentado en docs/decisions/007-default-model-assignment.md
// Las cuatro features arrancan con gpt-5.5: cubre todas las capabilities
// (PDF, streaming, multimodal) con calidad alta. El despliegue reabre el ADR 007
// y puede mover features concretas a modelos más baratos con datos reales.
export const DEFAULT_PER_FEATURE = {
  adapt_template: { provider: 'openai', modelId: 'gpt-5.5' },
  summarize: { provider: 'openai', modelId: 'gpt-5.5' },
  suggest: { provider: 'openai', modelId: 'gpt-5.5' },
  extract_document: { provider: 'openai', modelId: 'gpt-5.5' },
} as const
