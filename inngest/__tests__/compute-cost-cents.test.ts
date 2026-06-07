import { describe, expect, it } from "vitest";

import { computeCostCents } from "@/inngest/extract-document";

/**
 * Ledger cost math (pure). Manifest costs are per 1k tokens in USD; the ledger
 * stores whole cents, rounded up so non-zero usage never bills as 0.
 */
describe("computeCostCents", () => {
  it("computes cents from per-1k USD costs (rounded up)", () => {
    // 2000 in * 0.000075/1k = 0.00015 USD; 1000 out * 0.0003/1k = 0.0003 USD.
    // total 0.00045 USD = 0.045 cents -> ceil -> 1 cent.
    expect(computeCostCents(2000, 1000, 0.000075, 0.0003)).toBe(1);
  });

  it("scales with larger token counts", () => {
    // 1,000,000 in * 0.000075/1k = 0.075 USD = 7.5 cents.
    // 500,000 out * 0.0003/1k = 0.15 USD = 15 cents. total 22.5 -> ceil 23.
    expect(computeCostCents(1_000_000, 500_000, 0.000075, 0.0003)).toBe(23);
  });

  it("returns 0 when there is no usage", () => {
    expect(computeCostCents(0, 0, 0.000075, 0.0003)).toBe(0);
  });
});
