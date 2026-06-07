import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, arrayContains, eq, isNull } from "drizzle-orm";

import type * as schema from "@/db/schema";
import { aiFeatureModelMapping, aiModelManifest } from "@/db/schema";
import type { aiFeature, aiProvider } from "@/db/schema/enums";

/**
 * Resolves which model a workspace uses for a given AI feature (F7 Block B).
 *
 * Resolution order (design §8):
 *   1. MANUAL OVERRIDE — an ai_feature_model_mapping row for (workspaceId,
 *      feature) wins.
 *   2. MANIFEST DEFAULT — else the active, non-deprecated manifest model whose
 *      `default_for_features` array contains the feature (ADR-007 seeds
 *      gemini-3.5-flash as the default for all four features).
 *   3. NONE — else throw a clear, user-facing error.
 *
 * Tenancy: the mapping read carries an EXPLICIT `eq(workspaceId)` predicate as
 * the authoritative tenancy gate (the session pooler can bypass RLS). The
 * manifest is shared public-read, so the default lookup carries no workspace
 * predicate.
 */

export type AiFeatureId = (typeof aiFeature.enumValues)[number];
export type AiProviderId = (typeof aiProvider.enumValues)[number];

export interface ModelForFeature {
  provider: AiProviderId;
  modelId: string;
}

/**
 * Thrown when a feature has neither a workspace mapping nor a manifest default.
 * The message is the curated, user-facing Spanish string from the spec.
 */
export class NoModelConfiguredError extends Error {
  constructor(feature: string) {
    super(`No hay modelo configurado para la feature ${feature}`);
    this.name = "NoModelConfiguredError";
  }
}

export async function getModelForFeature(
  db: PostgresJsDatabase<typeof schema>,
  workspaceId: string,
  feature: AiFeatureId,
): Promise<ModelForFeature> {
  // 1. Manual override (explicit workspaceId tenancy gate).
  const [mapping] = await db
    .select({
      provider: aiFeatureModelMapping.provider,
      modelId: aiFeatureModelMapping.modelId,
    })
    .from(aiFeatureModelMapping)
    .where(
      and(
        eq(aiFeatureModelMapping.workspaceId, workspaceId),
        eq(aiFeatureModelMapping.feature, feature),
      ),
    )
    .limit(1);

  if (mapping) {
    return { provider: mapping.provider as AiProviderId, modelId: mapping.modelId };
  }

  // 2. Manifest default — active, non-deprecated, feature in default_for_features.
  const [defaultRow] = await db
    .select({
      provider: aiModelManifest.provider,
      modelId: aiModelManifest.modelId,
    })
    .from(aiModelManifest)
    .where(
      and(
        arrayContains(aiModelManifest.defaultForFeatures, [feature]),
        eq(aiModelManifest.status, "active"),
        isNull(aiModelManifest.deprecatedAt),
      ),
    )
    .limit(1);

  if (defaultRow) {
    return {
      provider: defaultRow.provider as AiProviderId,
      modelId: defaultRow.modelId,
    };
  }

  // 3. Neither configured.
  throw new NoModelConfiguredError(feature);
}
