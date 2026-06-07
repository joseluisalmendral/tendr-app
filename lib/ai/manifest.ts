import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq, isNull } from "drizzle-orm";

import type * as schema from "@/db/schema";
import { aiModelManifest } from "@/db/schema";
import type { aiProvider } from "@/db/schema/enums";

/**
 * Read helper over the curated ai_model_manifest (F7 Block B).
 *
 * `getAvailableModels` lists the SELECTABLE models for a provider and reports,
 * per model, whether it is ELIGIBLE for a given feature's requirements. Models
 * that fail a requirement are NOT hidden — they are returned with
 * `eligible: false` and a human `ineligibleReason`, so the UI can render them
 * disabled with a tooltip (design §8/§9: "never hidden").
 *
 * A model is SELECTABLE only when it is non-deprecated AND `status = 'active'`.
 * The status filter is intentional: a 'pending' or 'disabled' manifest row must
 * never surface in a feature Select even if it has no deprecated_at timestamp
 * (review-pr1b WARNING #1).
 */

export type AiProviderId = (typeof aiProvider.enumValues)[number];

/**
 * Capability requirements a feature imposes on a model. All optional; an unset
 * requirement is not checked. `requiresPdfOrFallback` models the F6 pdf-parse
 * text fallback: when true, a model that lacks native PDF support is STILL
 * eligible (the fallback covers it), so PDF is treated as a soft requirement.
 */
export interface FeatureRequirements {
  requiresStreaming?: boolean;
  /**
   * The feature consumes PDFs but a text-extraction fallback exists, so native
   * PDF support is preferred, not required. Kept explicit so a future feature
   * can demand hard PDF support by NOT setting this.
   */
  requiresPdfOrFallback?: boolean;
  /** Hard requirement: the model MUST support native PDF input. */
  requiresPdf?: boolean;
  requiresImage?: boolean;
  requiresMultimodal?: boolean;
}

export interface AvailableModel {
  modelId: string;
  displayName: string;
  eligible: boolean;
  /** Null when eligible; a curated Spanish reason when not. */
  ineligibleReason: string | null;
}

interface ManifestRow {
  modelId: string;
  displayName: string;
  supportsMultimodal: boolean | null;
  supportsPdf: boolean | null;
  supportsImage: boolean | null;
  supportsStreaming: boolean | null;
}

/**
 * Computes the curated ineligibility reason for a model against the feature
 * requirements, or null when the model is eligible. The first failing
 * requirement wins so the tooltip names a single, actionable cause.
 */
function ineligibleReason(
  model: ManifestRow,
  req: FeatureRequirements,
): string | null {
  if (req.requiresStreaming && model.supportsStreaming === false) {
    return "Este modelo no soporta streaming";
  }
  if (req.requiresPdf && model.supportsPdf !== true) {
    return "Este modelo no soporta PDF";
  }
  if (req.requiresImage && model.supportsImage !== true) {
    return "Este modelo no soporta imágenes";
  }
  if (req.requiresMultimodal && model.supportsMultimodal !== true) {
    return "Este modelo no soporta entrada multimodal";
  }
  // requiresPdfOrFallback is intentionally NOT a reject: the pdf-parse fallback
  // covers non-PDF models, so it never produces an ineligibility reason.
  return null;
}

/**
 * Returns every SELECTABLE model for `provider` (non-deprecated AND active),
 * each flagged eligible/ineligible for the given feature requirements.
 *
 * The manifest is public-read; the query carries no workspace predicate (it is
 * shared, not tenant data). Pass a user-session `db` (RLS-public-read).
 */
export async function getAvailableModels(
  db: PostgresJsDatabase<typeof schema>,
  provider: AiProviderId,
  featureRequirements: FeatureRequirements = {},
): Promise<AvailableModel[]> {
  const rows = await db
    .select({
      modelId: aiModelManifest.modelId,
      displayName: aiModelManifest.displayName,
      supportsMultimodal: aiModelManifest.supportsMultimodal,
      supportsPdf: aiModelManifest.supportsPdf,
      supportsImage: aiModelManifest.supportsImage,
      supportsStreaming: aiModelManifest.supportsStreaming,
    })
    .from(aiModelManifest)
    .where(
      and(
        eq(aiModelManifest.provider, provider),
        eq(aiModelManifest.status, "active"),
        isNull(aiModelManifest.deprecatedAt),
      ),
    )
    .orderBy(aiModelManifest.modelId);

  return rows.map((row) => {
    const reason = ineligibleReason(row, featureRequirements);
    return {
      modelId: row.modelId,
      displayName: row.displayName,
      eligible: reason === null,
      ineligibleReason: reason,
    };
  });
}
