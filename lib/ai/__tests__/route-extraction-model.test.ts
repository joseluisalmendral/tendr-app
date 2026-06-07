import { describe, expect, it } from "vitest";

import type {
  AiFeatureModelMapping,
  AiModelManifest,
} from "@/db/schema/ai";
import {
  ExtractionModelNotConfiguredError,
  resolveExtractionModel,
} from "@/lib/ai/route-extraction-model";

/**
 * Verify gate (a): capability routing is a PURE decision.
 *
 * The test feeds fake `ai_feature_model_mapping` + `ai_model_manifest` rows and
 * asserts the branch (`supportsPdf`) plus the error cases. There is NO database
 * access and NO provider call — the routing logic is fully isolated.
 */

function fakeMapping(
  overrides: Partial<AiFeatureModelMapping> = {},
): AiFeatureModelMapping {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    workspaceId: "00000000-0000-0000-0000-0000000000ws",
    feature: "extract_document",
    provider: "google",
    modelId: "gemini-3.5-flash",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function fakeManifest(
  overrides: Partial<AiModelManifest> = {},
): AiModelManifest {
  return {
    provider: "google",
    modelId: "gemini-3.5-flash",
    displayName: "Gemini 3.5 Flash",
    status: "active",
    defaultForFeatures: [],
    supportsMultimodal: true,
    supportsPdf: true,
    supportsImage: true,
    supportsStreaming: true,
    maxInputTokens: 1_000_000,
    // numeric columns arrive as strings from postgres-js.
    costPer1kInput: "0.000075",
    costPer1kOutput: "0.0003",
    deprecatedAt: null,
    updatedAt: new Date(),
    ...overrides,
  } as AiModelManifest;
}

describe("resolveExtractionModel", () => {
  it("routes to the NATIVE PDF branch when supports_pdf=true", () => {
    const route = resolveExtractionModel({
      mapping: fakeMapping(),
      manifest: fakeManifest({ supportsPdf: true }),
    });

    expect(route.supportsPdf).toBe(true);
    expect(route.provider).toBe("google");
    expect(route.modelId).toBe("gemini-3.5-flash");
    expect(route.costPer1kInput).toBeCloseTo(0.000075);
    expect(route.costPer1kOutput).toBeCloseTo(0.0003);
  });

  it("routes to the pdf-parse TEXT branch when supports_pdf=false", () => {
    const route = resolveExtractionModel({
      mapping: fakeMapping(),
      manifest: fakeManifest({ supportsPdf: false }),
    });

    expect(route.supportsPdf).toBe(false);
  });

  it("throws when no mapping is configured", () => {
    expect(() =>
      resolveExtractionModel({ mapping: null, manifest: fakeManifest() }),
    ).toThrow(ExtractionModelNotConfiguredError);
  });

  it("throws when the mapping feature is not extract_document", () => {
    expect(() =>
      resolveExtractionModel({
        mapping: fakeMapping({ feature: "summarize" }),
        manifest: fakeManifest(),
      }),
    ).toThrow(ExtractionModelNotConfiguredError);
  });

  it("throws when no manifest row matches the mapping (composite miss)", () => {
    expect(() =>
      resolveExtractionModel({ mapping: fakeMapping(), manifest: null }),
    ).toThrow(ExtractionModelNotConfiguredError);
  });

  it("throws when the manifest row does not match the mapping composite key", () => {
    // Same model_id under a DIFFERENT provider must NOT route — the PK is
    // composite (provider, model_id).
    expect(() =>
      resolveExtractionModel({
        mapping: fakeMapping({ provider: "google" }),
        manifest: fakeManifest({ provider: "openai" }),
      }),
    ).toThrow(ExtractionModelNotConfiguredError);
  });
});
