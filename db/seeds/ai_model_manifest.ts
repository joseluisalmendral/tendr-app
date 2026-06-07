import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { aiModelManifest } from "../schema/ai";

/**
 * Seeds the curated ai_model_manifest with the 10 active models Tendr ships
 * with across the 5 supported providers (F7 Block B).
 *
 * Pricing, model ids and capabilities VERIFIED June 2026 against official
 * provider docs + current pricing aggregators (NOT model training data) and
 * captured in the F7 manifest-research artifact. Per-1K = per-1M / 1000.
 *
 * - OpenAI: GPT-5.5 $5/$30 per 1M (1.05M ctx); GPT-5.4 mini $0.75/$4.50 (1.1M ctx).
 * - Anthropic: Opus 4.8 $5/$25 (1M ctx); Sonnet 4.6 $3/$15 (1M ctx);
 *   Haiku 4.5 $1/$5 (200K ctx).
 * - Google: Gemini 3.1 Pro (preview) $2/$12 <=200K prompt tier (1M ctx);
 *   Gemini 3.5 Flash $1.50/$9 (~1M ctx) — the free-tier-first DEFAULT per ADR-007.
 * - DeepSeek: V4 Pro $0.435/$0.87; V4 Flash $0.14/$0.28 (both 1M ctx, text-only).
 * - Moonshot: Kimi K2.6 $0.95/$4.00 cache-miss (262K ctx, multimodal, no PDF).
 *
 * DEFAULTS (ADR-007, closed 2026-06-07): all four features
 * (adapt_template, summarize, suggest, extract_document) default to
 * `google/gemini-3.5-flash` — free-tier-first, one Google key covers the whole
 * product. extract_document relies on the F6 pdf-parse text fallback (Flash has
 * no native PDF input — accepted tradeoff). Defaults live in the per-row
 * `default_for_features` column, queried by getModelForFeature.
 *
 * Capabilities flagged [UNVERIFIED] in research are recorded CONSERVATIVELY as
 * false (GPT-5.4 mini native PDF; DeepSeek multimodal/PDF; Kimi native PDF).
 *
 * Runs with a PRIVILEGED connection (DATABASE_URL): the manifest is
 * RLS-public-read but write-only via service_role; seeding bypasses RLS.
 *
 * Idempotent: onConflictDoUpdate on the (provider, model_id) PK so re-running
 * refreshes rows in place instead of failing or duplicating. Models no longer
 * in this list are DEPRECATED (status='deprecated' + deprecated_at) rather than
 * deleted, preserving the ai_feature_model_mapping composite FK.
 */
const GEMINI_FLASH = "gemini-3.5-flash";
const ALL_FEATURES = [
  "adapt_template",
  "summarize",
  "suggest",
  "extract_document",
];

const MODELS: (typeof aiModelManifest.$inferInsert)[] = [
  // ── OpenAI ────────────────────────────────────────────────────────────────
  {
    provider: "openai",
    modelId: "gpt-5.5",
    displayName: "GPT-5.5",
    status: "active",
    defaultForFeatures: [],
    supportsMultimodal: true,
    supportsPdf: true, // native file/PDF input (file search) confirmed
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 1050000,
    costPer1kInput: "0.005000",
    costPer1kOutput: "0.030000",
  },
  {
    provider: "openai",
    modelId: "gpt-5.4-mini",
    displayName: "GPT-5.4 mini",
    status: "active",
    defaultForFeatures: [],
    supportsMultimodal: true,
    supportsPdf: false, // vision confirmed; native PDF input UNVERIFIED -> false
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 1100000,
    costPer1kInput: "0.000750",
    costPer1kOutput: "0.004500",
  },
  // ── Anthropic ─────────────────────────────────────────────────────────────
  {
    provider: "anthropic",
    modelId: "claude-opus-4-8",
    displayName: "Claude Opus 4.8",
    status: "active",
    defaultForFeatures: [],
    supportsMultimodal: true,
    supportsPdf: true,
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 1000000,
    costPer1kInput: "0.005000",
    costPer1kOutput: "0.025000",
  },
  {
    provider: "anthropic",
    modelId: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    status: "active",
    defaultForFeatures: [],
    supportsMultimodal: true,
    supportsPdf: true,
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 1000000,
    costPer1kInput: "0.003000",
    costPer1kOutput: "0.015000",
  },
  {
    provider: "anthropic",
    modelId: "claude-haiku-4-5",
    displayName: "Claude Haiku 4.5",
    status: "active",
    defaultForFeatures: [],
    supportsMultimodal: true,
    supportsPdf: true,
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 200000,
    costPer1kInput: "0.001000",
    costPer1kOutput: "0.005000",
  },
  // ── Google ────────────────────────────────────────────────────────────────
  {
    provider: "google",
    modelId: "gemini-3.1-pro-preview",
    displayName: "Gemini 3.1 Pro",
    status: "active",
    defaultForFeatures: [],
    supportsMultimodal: true,
    supportsPdf: true,
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 1000000,
    // <=200K prompt tier; prompts above 200K are billed $4/$18 per 1M.
    costPer1kInput: "0.002000",
    costPer1kOutput: "0.012000",
  },
  {
    provider: "google",
    modelId: GEMINI_FLASH,
    displayName: "Gemini 3.5 Flash",
    status: "active",
    // ADR-007: the free-tier-first default for ALL FOUR features.
    defaultForFeatures: ALL_FEATURES,
    supportsMultimodal: true,
    supportsPdf: true, // PDF via document/image tokens
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 1048576,
    costPer1kInput: "0.001500",
    costPer1kOutput: "0.009000",
  },
  // ── DeepSeek ──────────────────────────────────────────────────────────────
  {
    provider: "deepseek",
    modelId: "deepseek-v4-pro",
    displayName: "DeepSeek V4 Pro",
    status: "active",
    defaultForFeatures: [],
    supportsMultimodal: false, // docs silent -> treat as text-only (UNVERIFIED)
    supportsPdf: false,
    supportsImage: false,
    supportsStreaming: true,
    maxInputTokens: 1000000,
    // Official 75% rate after 2026-05-31: $0.435/M cache-miss in, $0.87/M out.
    costPer1kInput: "0.000435",
    costPer1kOutput: "0.000870",
  },
  {
    provider: "deepseek",
    modelId: "deepseek-v4-flash",
    displayName: "DeepSeek V4 Flash",
    status: "active",
    defaultForFeatures: [],
    supportsMultimodal: false,
    supportsPdf: false,
    supportsImage: false,
    supportsStreaming: true,
    maxInputTokens: 1000000,
    costPer1kInput: "0.000140",
    costPer1kOutput: "0.000280",
  },
  // ── Moonshot ──────────────────────────────────────────────────────────────
  {
    provider: "moonshot",
    modelId: "kimi-k2.6",
    displayName: "Kimi K2.6",
    status: "active",
    defaultForFeatures: [],
    supportsMultimodal: true,
    supportsPdf: false, // image/video input confirmed; native PDF UNVERIFIED -> false
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 262144,
    // Cache-miss rate; cached input is ~$0.16 per 1M on the official platform.
    costPer1kInput: "0.000950",
    costPer1kOutput: "0.004000",
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  await db
    .insert(aiModelManifest)
    .values(MODELS)
    .onConflictDoUpdate({
      target: [aiModelManifest.provider, aiModelManifest.modelId],
      // Refresh mutable fields from the incoming row (EXCLUDED) on conflict.
      // Re-activate a previously deprecated model that returns to the list.
      set: {
        displayName: sql`excluded.display_name`,
        status: sql`excluded.status`,
        defaultForFeatures: sql`excluded.default_for_features`,
        maxInputTokens: sql`excluded.max_input_tokens`,
        costPer1kInput: sql`excluded.cost_per_1k_input`,
        costPer1kOutput: sql`excluded.cost_per_1k_output`,
        supportsMultimodal: sql`excluded.supports_multimodal`,
        supportsPdf: sql`excluded.supports_pdf`,
        supportsImage: sql`excluded.supports_image`,
        supportsStreaming: sql`excluded.supports_streaming`,
        deprecatedAt: sql`null`,
        updatedAt: sql`now()`,
      },
    });

  // Deprecate any active row NOT in the curated list (stale prior-seed models).
  // We deprecate rather than delete so the ai_feature_model_mapping composite FK
  // never dangles; deprecated models are filtered out by the routing helpers.
  const keep = MODELS.map((m) => `${m.provider}:${m.modelId}`);
  const deprecated = await db
    .update(aiModelManifest)
    .set({
      status: "deprecated",
      deprecatedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        isNull(aiModelManifest.deprecatedAt),
        notInArray(
          sql`${aiModelManifest.provider} || ':' || ${aiModelManifest.modelId}`,
          keep,
        ),
      ),
    )
    .returning({
      provider: aiModelManifest.provider,
      modelId: aiModelManifest.modelId,
    });

  await client.end();
  return deprecated.length;
}

main()
  .then((deprecatedCount) => {
    // eslint-disable-next-line no-console
    console.log(
      `Seeded ${MODELS.length} active manifest models; deprecated ${deprecatedCount} stale model(s).`,
    );
    process.exit(0);
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Seed failed:", error);
    process.exit(1);
  });
