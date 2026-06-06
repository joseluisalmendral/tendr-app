import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { aiModelManifest } from "../schema/ai";

/**
 * Seeds the curated ai_model_manifest with the active models Tendr ships with.
 *
 * Pricing and capabilities verified June 2026 against official provider docs
 * and current pricing aggregators (NOT model training data):
 * - OpenAI: GPT-5.5 $5/$30 per 1M (1.05M ctx); GPT-5.4 mini $0.75/$4.50 (400K ctx).
 * - Anthropic: Opus 4.8 $5/$25 (1M ctx); Haiku 4.5 $1/$5 (200K ctx).
 * - Google: Gemini 3.1 Pro $2/$12 <=200K prompt tier (2M ctx, $4/$18 above 200K);
 *   Gemini 3.5 Flash $1.50/$9 flat; Gemini 3.1 Flash-Lite $0.25/$1.50 flat;
 *   Gemini 2.5 Flash $0.30/$2.50; 2.5 Flash-Lite $0.10/$0.40
 *   (2.0 family was shut down 2026-06-01).
 * - DeepSeek: V4 Pro $1.74/$3.48; V4 Flash $0.14/$0.28 (both 1M ctx, text-only).
 * - Moonshot: Kimi K2.6 $0.95/$4.00 cache-miss (256K ctx, multimodal).
 *
 * Runs with a PRIVILEGED connection (DATABASE_URL): the manifest is
 * RLS-public-read but write-only via service_role; seeding bypasses RLS.
 * default_for_features marks the model new workspaces inherit per feature (G2).
 *
 * Idempotent: onConflictDoUpdate on the (provider, model_id) PK so re-running
 * refreshes rows instead of failing.
 */
const MODELS: (typeof aiModelManifest.$inferInsert)[] = [
  // ── OpenAI ────────────────────────────────────────────────────────────────
  {
    provider: "openai",
    modelId: "gpt-5.4-mini",
    displayName: "GPT-5.4 mini",
    status: "active",
    // Cheap default for the three text features; new workspaces inherit it.
    defaultForFeatures: ["adapt_template", "summarize", "suggest"],
    supportsMultimodal: true,
    supportsPdf: false, // image input confirmed; native PDF input not confirmed
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 400000,
    costPer1kInput: "0.000750",
    costPer1kOutput: "0.004500",
  },
  {
    provider: "openai",
    modelId: "gpt-5.5",
    displayName: "GPT-5.5",
    status: "active",
    // Document extraction needs native PDF input; same provider as the text
    // defaults so a new workspace only needs one API key.
    defaultForFeatures: ["extract_document"],
    supportsMultimodal: true,
    supportsPdf: true,
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 1050000,
    costPer1kInput: "0.005000",
    costPer1kOutput: "0.030000",
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
    modelId: "gemini-3.1-pro",
    displayName: "Gemini 3.1 Pro",
    status: "active",
    defaultForFeatures: [],
    supportsMultimodal: true,
    supportsPdf: true,
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 2000000,
    // <=200K prompt tier; prompts above 200K are billed $4/$18 per 1M.
    costPer1kInput: "0.002000",
    costPer1kOutput: "0.012000",
  },
  {
    provider: "google",
    modelId: "gemini-3.5-flash",
    displayName: "Gemini 3.5 Flash",
    status: "active",
    defaultForFeatures: [],
    supportsMultimodal: true,
    supportsPdf: true,
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 1048576,
    costPer1kInput: "0.001500",
    costPer1kOutput: "0.009000",
  },
  {
    provider: "google",
    modelId: "gemini-3.1-flash-lite",
    displayName: "Gemini 3.1 Flash-Lite",
    status: "active",
    defaultForFeatures: [],
    supportsMultimodal: true,
    supportsPdf: true,
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 1048576,
    costPer1kInput: "0.000250",
    costPer1kOutput: "0.001500",
  },
  {
    provider: "google",
    modelId: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    status: "active",
    defaultForFeatures: [],
    supportsMultimodal: true,
    supportsPdf: true,
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 1048576,
    costPer1kInput: "0.000300",
    costPer1kOutput: "0.002500",
  },
  {
    provider: "google",
    modelId: "gemini-2.5-flash-lite",
    displayName: "Gemini 2.5 Flash-Lite",
    status: "active",
    defaultForFeatures: [],
    supportsMultimodal: true,
    supportsPdf: true,
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 1048576,
    costPer1kInput: "0.000100",
    costPer1kOutput: "0.000400",
  },
  // ── DeepSeek ──────────────────────────────────────────────────────────────
  {
    provider: "deepseek",
    modelId: "deepseek-v4-pro",
    displayName: "DeepSeek V4 Pro",
    status: "active",
    defaultForFeatures: [],
    supportsMultimodal: false,
    supportsPdf: false,
    supportsImage: false,
    supportsStreaming: true,
    maxInputTokens: 1000000,
    costPer1kInput: "0.001740",
    costPer1kOutput: "0.003480",
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
    supportsPdf: false, // image/video input confirmed; native PDF not confirmed
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
        updatedAt: sql`now()`,
      },
    });

  await client.end();
}

main()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log(`Seeded ${MODELS.length} manifest models.`);
    process.exit(0);
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Seed failed:", error);
    process.exit(1);
  });
