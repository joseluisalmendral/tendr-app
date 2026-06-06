import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { aiModelManifest } from "./schema/ai";

/**
 * Seeds the curated ai_model_manifest with the active models Tendr ships with.
 *
 * Runs with a PRIVILEGED connection (DATABASE_URL pointing at the local/admin
 * or service_role connection): the manifest is RLS-public-read but write-only
 * via service_role, and seeding bypasses RLS. default_for_features marks each
 * model as the default for the listed features so ai_feature_model_mapping rows
 * can reference an existing (provider, model_id) via the composite FK (G5).
 *
 * Idempotent: onConflictDoUpdate on the (provider, model_id) PK so re-running
 * refreshes rows instead of failing.
 */
const MODELS: (typeof aiModelManifest.$inferInsert)[] = [
  {
    provider: "openai",
    modelId: "gpt-4o-mini",
    displayName: "GPT-4o mini",
    status: "active",
    defaultForFeatures: ["adapt_template", "summarize", "suggest"],
    supportsMultimodal: true,
    supportsPdf: false,
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 128000,
    costPer1kInput: "0.000150",
    costPer1kOutput: "0.000600",
  },
  {
    provider: "openai",
    modelId: "gpt-4o",
    displayName: "GPT-4o",
    status: "active",
    defaultForFeatures: ["extract_document"],
    supportsMultimodal: true,
    supportsPdf: true,
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 128000,
    costPer1kInput: "0.002500",
    costPer1kOutput: "0.010000",
  },
  {
    provider: "anthropic",
    modelId: "claude-3-5-sonnet-latest",
    displayName: "Claude 3.5 Sonnet",
    status: "active",
    defaultForFeatures: [],
    supportsMultimodal: true,
    supportsPdf: true,
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 200000,
    costPer1kInput: "0.003000",
    costPer1kOutput: "0.015000",
  },
  {
    provider: "anthropic",
    modelId: "claude-3-5-haiku-latest",
    displayName: "Claude 3.5 Haiku",
    status: "active",
    defaultForFeatures: [],
    supportsMultimodal: false,
    supportsPdf: false,
    supportsImage: false,
    supportsStreaming: true,
    maxInputTokens: 200000,
    costPer1kInput: "0.000800",
    costPer1kOutput: "0.004000",
  },
  {
    provider: "google",
    modelId: "gemini-2.0-flash",
    displayName: "Gemini 2.0 Flash",
    status: "active",
    defaultForFeatures: [],
    supportsMultimodal: true,
    supportsPdf: true,
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 1000000,
    costPer1kInput: "0.000100",
    costPer1kOutput: "0.000400",
  },
  {
    provider: "deepseek",
    modelId: "deepseek-chat",
    displayName: "DeepSeek Chat",
    status: "active",
    defaultForFeatures: [],
    supportsMultimodal: false,
    supportsPdf: false,
    supportsImage: false,
    supportsStreaming: true,
    maxInputTokens: 64000,
    costPer1kInput: "0.000270",
    costPer1kOutput: "0.001100",
  },
  {
    provider: "moonshot",
    modelId: "moonshot-v1-128k",
    displayName: "Moonshot v1 128k",
    status: "active",
    defaultForFeatures: [],
    supportsMultimodal: false,
    supportsPdf: false,
    supportsImage: false,
    supportsStreaming: true,
    maxInputTokens: 128000,
    costPer1kInput: "0.001700",
    costPer1kOutput: "0.001700",
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
