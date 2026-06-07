import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type * as schema from "@/db/schema";
import {
  aiFeatureModelMapping,
  aiModelManifest,
  aiProviderConfigs,
} from "@/db/schema";
import { aiFeature, aiProvider } from "@/db/schema/enums";
import {
  insertAuditLog,
  type InsertAuditLogDeps,
} from "@/lib/audit/insert-audit-log";

/**
 * Pure, import-testable seam for the `setFeatureModel` Server Action.
 *
 * Verifies (in order) that:
 *   1. the workspace has a CONFIGURED key for the chosen provider,
 *   2. the model EXISTS in ai_model_manifest and is NOT deprecated,
 *   3. the model's capability fits the feature.
 *
 * CAPABILITY RULE (design §8 + decision #757): only `extract_document` needs PDF
 * support — and because the F6 `pdf-parse` text-extraction fallback IS active,
 * a non-PDF model is ACCEPTED for extract_document too. The other three features
 * (adapt_template, summarize, suggest) impose no manifest-capability gate here
 * (they are text generation; streaming eligibility is surfaced in the UI Select,
 * not enforced as a hard write-time reject). So the only hard capability reject
 * this seam can produce today is reserved for a future feature that strictly
 * requires a capability the model lacks; the structure is in place via
 * `capabilityError`.
 *
 * On a capability reject (or any precondition failure) NO DB row is written.
 *
 * Tenancy: the mapping UPSERT runs via the user-session db (RLS applies +
 * explicit workspaceId), the audit insert via serviceDb. Both carry an explicit
 * workspaceId tenancy gate.
 */

export const setFeatureModelSchema = z.object({
  feature: z.enum(aiFeature.enumValues),
  provider: z.enum(aiProvider.enumValues),
  modelId: z.string().min(1).max(200),
});

export type SetFeatureModelInput = z.input<typeof setFeatureModelSchema>;

export type SetFeatureModelResult =
  | { ok: true }
  | { ok: false; error: string };

export interface SetFeatureModelDeps extends InsertAuditLogDeps {
  /** User-session Drizzle client (RLS) for the mapping UPSERT + reads. */
  db: PostgresJsDatabase<typeof schema>;
  /** Service-role Drizzle client for the audit insert. */
  serviceDb: PostgresJsDatabase<typeof schema>;
}

type Feature = (typeof aiFeature.enumValues)[number];

/**
 * Returns a curated capability error when the model cannot serve the feature,
 * or null when it is eligible. extract_document accepts any model because the
 * F6 pdf-parse fallback covers non-PDF models.
 */
function capabilityError(
  feature: Feature,
  model: { supportsPdf: boolean | null; supportsStreaming: boolean | null },
): string | null {
  void feature;
  void model;
  // No hard write-time capability reject in F7's four features: extract_document
  // is covered by the pdf-parse fallback, the other three are text generation.
  // The eligibility/disabled state is surfaced in the UI Select instead.
  return null;
}

export async function setFeatureModelWith(
  deps: SetFeatureModelDeps,
  workspaceId: string,
  rawInput: SetFeatureModelInput,
  actorId?: string | null,
): Promise<SetFeatureModelResult> {
  const parsed = setFeatureModelSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "Selección inválida." };
  }
  const { feature, provider, modelId } = parsed.data;

  // 1. The provider must have a configured key (explicit workspaceId gate).
  const [configRow] = await deps.db
    .select({ id: aiProviderConfigs.id })
    .from(aiProviderConfigs)
    .where(
      and(
        eq(aiProviderConfigs.workspaceId, workspaceId),
        eq(aiProviderConfigs.provider, provider),
      ),
    )
    .limit(1);

  if (!configRow) {
    return {
      ok: false,
      error: `No hay key de ${provider}. Configúrala en /settings/ai`,
    };
  }

  // 2. The model must exist in the manifest and not be deprecated.
  const [modelRow] = await deps.db
    .select({
      provider: aiModelManifest.provider,
      modelId: aiModelManifest.modelId,
      supportsPdf: aiModelManifest.supportsPdf,
      supportsStreaming: aiModelManifest.supportsStreaming,
    })
    .from(aiModelManifest)
    .where(
      and(
        eq(aiModelManifest.provider, provider),
        eq(aiModelManifest.modelId, modelId),
        isNull(aiModelManifest.deprecatedAt),
      ),
    )
    .limit(1);

  if (!modelRow) {
    return {
      ok: false,
      error: "Ese modelo no está disponible.",
    };
  }

  // 3. Capability gate (NO DB change on reject).
  const capError = capabilityError(feature, modelRow);
  if (capError) {
    return { ok: false, error: capError };
  }

  // Read the CURRENT mapping (if any) so the audit row records old AND new.
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

  const previous = existing
    ? { provider: existing.provider, model_id: existing.modelId }
    : null;

  // 4. UPSERT the mapping by (workspace_id, feature) — explicit tenancy gate.
  await deps.db
    .insert(aiFeatureModelMapping)
    .values({ workspaceId, feature, provider, modelId })
    .onConflictDoUpdate({
      target: [aiFeatureModelMapping.workspaceId, aiFeatureModelMapping.feature],
      set: {
        provider: sql`excluded.provider`,
        modelId: sql`excluded.model_id`,
        updatedAt: sql`now()`,
      },
    });

  // Resolve the mapping row id for the audit resource_id (explicit gate).
  const [mappingRow] = await deps.db
    .select({ id: aiFeatureModelMapping.id })
    .from(aiFeatureModelMapping)
    .where(
      and(
        eq(aiFeatureModelMapping.workspaceId, workspaceId),
        eq(aiFeatureModelMapping.feature, feature),
      ),
    )
    .limit(1);

  // 5. Audit with BOTH old and new (no secret material — ids only).
  await insertAuditLog(deps, {
    workspaceId,
    actorId,
    action: "change_feature_model",
    resourceType: "ai_feature_model_mapping",
    resourceId: mappingRow?.id ?? null,
    metadata: {
      feature,
      old: previous,
      new: { provider, model_id: modelId },
    },
  });

  return { ok: true };
}
