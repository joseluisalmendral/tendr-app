import type {
  AiFeatureModelMapping,
  AiModelManifest,
} from "@/db/schema/ai";

/**
 * Pure capability-routing resolver for the F6 document extractor (verify gate a).
 *
 * The Inngest `lookup-model` step performs the two DB reads (mapping +
 * manifest) and then hands the plain rows to this function. Keeping the routing
 * decision in a pure module — no DB handle, no provider client — is what makes
 * the branch (native PDF vs. pdf-parse text) unit-testable: a test feeds fake
 * mapping/manifest rows and asserts `supportsPdf` without touching Supabase or
 * a model provider.
 *
 * The manifest lookup MUST be keyed by the composite (provider, model_id), not
 * by model_id alone: `ai_model_manifest`'s primary key is (provider, model_id)
 * and the same model_id can exist under different providers. The DB read that
 * produces `manifest` is the caller's responsibility; here we only validate
 * that the mapping points at the extraction feature and that a matching
 * manifest row was found.
 */

/** Numeric model costs, parsed from the manifest's `numeric` (string) columns. */
export interface ExtractionModelRoute {
  provider: AiModelManifest["provider"];
  modelId: string;
  supportsPdf: boolean;
  /** Cost per 1k input tokens, in the manifest currency unit (USD). */
  costPer1kInput: number;
  /** Cost per 1k output tokens, in the manifest currency unit (USD). */
  costPer1kOutput: number;
}

export interface ResolveExtractionModelInput {
  /** The `ai_feature_model_mapping` row for the workspace, or null/undefined. */
  mapping: AiFeatureModelMapping | null | undefined;
  /**
   * The `ai_model_manifest` row matched by the composite (provider, model_id)
   * from `mapping`, or null/undefined when no such row exists.
   */
  manifest: AiModelManifest | null | undefined;
}

/**
 * Thrown when extraction cannot be routed: the workspace has no mapping, the
 * mapping is for a different feature, or no manifest row matches the mapping's
 * (provider, model_id). The worker maps this to a `provider_error` failure.
 */
export class ExtractionModelNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionModelNotConfiguredError";
  }
}

/**
 * Resolves the model + capability route for document extraction from already
 * fetched rows. Throws `ExtractionModelNotConfiguredError` on any miss; never
 * performs IO.
 */
export function resolveExtractionModel(
  input: ResolveExtractionModelInput,
): ExtractionModelRoute {
  const { mapping, manifest } = input;

  if (!mapping) {
    throw new ExtractionModelNotConfiguredError(
      "No model mapping configured for this workspace.",
    );
  }

  if (mapping.feature !== "extract_document") {
    throw new ExtractionModelNotConfiguredError(
      `Mapping feature is "${mapping.feature}", expected "extract_document".`,
    );
  }

  if (!manifest) {
    throw new ExtractionModelNotConfiguredError(
      `No manifest entry for (${mapping.provider}, ${mapping.modelId}).`,
    );
  }

  // Defense in depth: the caller looks up the manifest by the composite key,
  // but assert the row actually matches so a mis-joined row cannot route the
  // wrong model.
  if (manifest.provider !== mapping.provider || manifest.modelId !== mapping.modelId) {
    throw new ExtractionModelNotConfiguredError(
      `Manifest (${manifest.provider}, ${manifest.modelId}) does not match mapping (${mapping.provider}, ${mapping.modelId}).`,
    );
  }

  return {
    provider: mapping.provider,
    modelId: mapping.modelId,
    supportsPdf: manifest.supportsPdf ?? false,
    // `numeric` columns come back as strings from postgres-js; coerce to number
    // for the cost math in the persist step.
    costPer1kInput: Number(manifest.costPer1kInput),
    costPer1kOutput: Number(manifest.costPer1kOutput),
  };
}
