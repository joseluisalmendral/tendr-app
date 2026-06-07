import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { getAvailableModels } from "@/lib/ai/manifest";

/**
 * getAvailableModels exercised against the REAL local Supabase stack and the
 * seeded ai_model_manifest. Covers SPEC R-getAvailableModels:
 *   - returns SELECTABLE models (non-deprecated AND status='active') for a provider
 *   - ineligible models are RETURNED with eligible=false + a non-null reason
 *   - deprecated/non-active models are NOT returned (status filter, review-pr1b W1)
 *
 * Requires the manifest seed to have run (`pnpm db:seed`). DATABASE_URL must be
 * exported in the shell (vitest has no env loader).
 */
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

describe("getAvailableModels", () => {
  it("returns the active Google models with no requirements all eligible", async () => {
    const models = await getAvailableModels(db, "google");

    const ids = models.map((m) => m.modelId);
    expect(ids).toContain("gemini-3.5-flash");
    expect(ids).toContain("gemini-3.1-pro-preview");
    // Every Google seed model supports streaming, so with no requirements they
    // are all eligible with a null reason.
    for (const m of models) {
      expect(m.eligible).toBe(true);
      expect(m.ineligibleReason).toBeNull();
    }
  });

  it("flags non-streaming models ineligible with a reason (never hidden)", async () => {
    // DeepSeek seeds are text-only but DO stream, so streaming alone keeps them
    // eligible. Use a PDF hard requirement: DeepSeek models lack native PDF.
    const models = await getAvailableModels(db, "deepseek", {
      requiresPdf: true,
    });

    expect(models.length).toBeGreaterThan(0);
    // Ineligible models are PRESENT (not filtered out) with a reason.
    const ineligible = models.filter((m) => !m.eligible);
    expect(ineligible.length).toBe(models.length);
    for (const m of ineligible) {
      expect(m.ineligibleReason).toBe("Este modelo no soporta PDF");
    }
  });

  it("treats requiresPdfOrFallback as a soft requirement (still eligible)", async () => {
    // Moonshot Kimi has no native PDF, but the pdf-parse fallback covers it, so
    // requiresPdfOrFallback must NOT make it ineligible.
    const models = await getAvailableModels(db, "moonshot", {
      requiresPdfOrFallback: true,
    });

    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.eligible).toBe(true);
      expect(m.ineligibleReason).toBeNull();
    }
  });

  it("only returns active, non-deprecated models (status filter)", async () => {
    // Prior seed iterations left deprecated rows (e.g. gpt-4o, deepseek-chat).
    // They MUST NOT appear in any provider's available list.
    const openai = await getAvailableModels(db, "openai");
    const ids = openai.map((m) => m.modelId);
    expect(ids).not.toContain("gpt-4o");
    expect(ids).not.toContain("gpt-4o-mini");
    // The two curated OpenAI models are present.
    expect(ids).toContain("gpt-5.5");
    expect(ids).toContain("gpt-5.4-mini");
    expect(ids.length).toBe(2);
  });
});
