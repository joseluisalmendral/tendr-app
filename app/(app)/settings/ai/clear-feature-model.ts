import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type * as schema from "@/db/schema";
import { aiFeatureModelMapping } from "@/db/schema";
import { aiFeature } from "@/db/schema/enums";
import {
  insertAuditLog,
  type InsertAuditLogDeps,
} from "@/lib/audit/insert-audit-log";

/**
 * Pure, import-testable seam for the "Default" feature-model option (F7c
 * decision #775 finding 4a). Choosing "Default (gemini-3.5-flash)" in a feature
 * Select clears the per-workspace override by DELETING the
 * (workspace_id, feature) `ai_feature_model_mapping` row, so `getModelForFeature`
 * falls back to the manifest DEFAULT (the active, non-deprecated model whose
 * `default_for_features` array contains the feature — gemini-3.5-flash for all
 * four features in the current seed).
 *
 * No-op safe: if no mapping exists the feature is ALREADY on the default, so the
 * seam returns `{ ok: true }` without writing an audit row (nothing changed).
 *
 * Tenancy: the mapping read + DELETE run via the user-session db (RLS applies +
 * an EXPLICIT `eq(workspaceId) AND eq(feature)` predicate as the authoritative
 * tenancy gate under the privileged pooler connection); the audit insert via
 * serviceDb (audit_log has no user INSERT policy).
 *
 * Audit: action `change_feature_model` with `new: null` (the override is gone),
 * matching the save path's `old/new` shape so the audit trail reads cleanly.
 */

export const clearFeatureModelSchema = z.object({
  feature: z.enum(aiFeature.enumValues),
});

export type ClearFeatureModelInput = z.input<typeof clearFeatureModelSchema>;

export type ClearFeatureModelResult =
  | { ok: true }
  | { ok: false; error: string };

export interface ClearFeatureModelDeps extends InsertAuditLogDeps {
  /** User-session Drizzle client (RLS) for the mapping read + DELETE. */
  db: PostgresJsDatabase<typeof schema>;
  /** Service-role Drizzle client for the audit insert. */
  serviceDb: PostgresJsDatabase<typeof schema>;
}

export async function clearFeatureModelWith(
  deps: ClearFeatureModelDeps,
  workspaceId: string,
  rawInput: ClearFeatureModelInput,
  actorId?: string | null,
): Promise<ClearFeatureModelResult> {
  const parsed = clearFeatureModelSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "Selección inválida." };
  }
  const { feature } = parsed.data;

  // Read the CURRENT override (if any) so the audit row records what was cleared
  // and we can no-op when the feature is already on the default.
  const [existing] = await deps.db
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

  // No override -> already on the manifest default. Idempotent no-op, no audit.
  if (!existing) {
    return { ok: true };
  }

  // DELETE the override by the explicit (workspace_id, feature) tenancy gate.
  await deps.db
    .delete(aiFeatureModelMapping)
    .where(
      and(
        eq(aiFeatureModelMapping.workspaceId, workspaceId),
        eq(aiFeatureModelMapping.feature, feature),
      ),
    );

  // Audit: old = previous override, new = null (back to manifest default).
  await insertAuditLog(deps, {
    workspaceId,
    actorId,
    action: "change_feature_model",
    resourceType: "ai_feature_model_mapping",
    resourceId: null,
    metadata: {
      feature,
      old: { provider: existing.provider, model_id: existing.modelId },
      new: null,
    },
  });

  return { ok: true };
}
