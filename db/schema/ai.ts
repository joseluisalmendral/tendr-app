import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { aiFeature, aiProvider, manifestStatus } from "./enums";
import { workspaces } from "./workspaces";

/**
 * AI tables (F6 + F7): BYO key, multi-provider, curated manifest, cost ledger.
 */

/**
 * ai_model_manifest — curated, shared catalog of available models.
 *
 * PK (provider, model_id) (kept). status (G1) tracks lifecycle; the manifest
 * is publicly readable but only service_role curates it. default_for_features
 * (G2) lists the features for which this model is a default (empty by default).
 */
export const aiModelManifest = pgTable(
  "ai_model_manifest",
  {
    provider: aiProvider("provider").notNull(),
    modelId: text("model_id").notNull(),
    displayName: text("display_name").notNull(),
    status: manifestStatus("status").notNull().default("pending"),
    defaultForFeatures: text("default_for_features")
      .array()
      .notNull()
      .default(sql`'{}'`),
    supportsMultimodal: boolean("supports_multimodal").default(false),
    supportsPdf: boolean("supports_pdf").default(false),
    supportsImage: boolean("supports_image").default(false),
    supportsStreaming: boolean("supports_streaming").default(true),
    maxInputTokens: integer("max_input_tokens").notNull(),
    costPer1kInput: numeric("cost_per_1k_input", {
      precision: 10,
      scale: 6,
    }).notNull(),
    costPer1kOutput: numeric("cost_per_1k_output", {
      precision: 10,
      scale: 6,
    }).notNull(),
    deprecatedAt: timestamp("deprecated_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.modelId] }),
  ],
);

/**
 * ai_provider_configs — per-workspace, per-provider encrypted API keys
 * (envelope AES-256-GCM). The encrypted_* columns are REVOKEd from user roles
 * in the 0001 migration (M6) so secret material never reaches the client.
 */
export const aiProviderConfigs = pgTable(
  "ai_provider_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: aiProvider("provider").notNull(),
    encryptedKey: text("encrypted_key").notNull(),
    keyIv: text("key_iv").notNull(),
    keyTag: text("key_tag").notNull(),
    encryptedDek: text("encrypted_dek").notNull(),
    keyValidatedAt: timestamp("key_validated_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ai_provider_configs_workspace_id_idx").on(table.workspaceId),
    unique("ai_provider_configs_workspace_provider_unique").on(
      table.workspaceId,
      table.provider,
    ),
  ],
);

/**
 * ai_feature_model_mapping — which model each feature uses per workspace.
 *
 * Composite FK (provider, model_id) -> ai_model_manifest(provider, model_id)
 * (G5): a mapping can only point at a model that exists in the manifest.
 */
export const aiFeatureModelMapping = pgTable(
  "ai_feature_model_mapping",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    feature: aiFeature("feature").notNull(),
    provider: aiProvider("provider").notNull(),
    modelId: text("model_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("ai_feature_model_mapping_workspace_id_idx").on(table.workspaceId),
    unique("ai_feature_model_mapping_workspace_feature_unique").on(
      table.workspaceId,
      table.feature,
    ),
    foreignKey({
      columns: [table.provider, table.modelId],
      foreignColumns: [aiModelManifest.provider, aiModelManifest.modelId],
      name: "ai_feature_model_mapping_manifest_fk",
    }),
  ],
);

/**
 * ai_usage_ledger — immutable per-workspace cost tracking (F7 budget).
 *
 * Users may INSERT (sync Server Actions) and SELECT; no UPDATE/DELETE. The
 * monthly rollup index serves budget queries under the workspace predicate.
 */
export const aiUsageLedger = pgTable(
  "ai_usage_ledger",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    feature: text("feature").notNull(),
    provider: text("provider").notNull(),
    modelId: text("model_id").notNull(),
    tokensIn: integer("tokens_in").notNull(),
    tokensOut: integer("tokens_out").notNull(),
    costCents: integer("cost_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Pin the timezone so date_trunc is IMMUTABLE and indexable: on a
    // timestamptz column, date_trunc('month', created_at) depends on the
    // session TimeZone (not immutable) and Postgres rejects it in an index.
    // `created_at at time zone 'UTC'` yields a fixed timestamp the planner can
    // index; the monthly budget rollup is computed against the same UTC bucket.
    index("ai_usage_ledger_workspace_month_idx").on(
      table.workspaceId,
      sql`date_trunc('month', ${table.createdAt} at time zone 'UTC')`,
    ),
  ],
);

export type AiModelManifest = typeof aiModelManifest.$inferSelect;
export type NewAiModelManifest = typeof aiModelManifest.$inferInsert;
export type AiProviderConfig = typeof aiProviderConfigs.$inferSelect;
export type NewAiProviderConfig = typeof aiProviderConfigs.$inferInsert;
export type AiFeatureModelMapping = typeof aiFeatureModelMapping.$inferSelect;
export type NewAiFeatureModelMapping =
  typeof aiFeatureModelMapping.$inferInsert;
export type AiUsageLedger = typeof aiUsageLedger.$inferSelect;
export type NewAiUsageLedger = typeof aiUsageLedger.$inferInsert;
