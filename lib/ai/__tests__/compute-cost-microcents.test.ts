import { describe, expect, it } from "vitest";

import {
  computeCostMicrocents,
  microcentsToCents,
} from "@/lib/ai/compute-cost-microcents";

/**
 * Ledger cost math (pure) — F7c finding 1. Manifest costs are per 1k tokens in
 * USD; the ledger stores USD micro-cents (USD * 10000) with NO per-call ceil so
 * the figure matches Langfuse. Replaces the legacy ceil-per-call computeCostCents
 * (the over-billing the user saw: $0.0133 charged as $0.03).
 */
describe("computeCostMicrocents", () => {
  it("computes micro-cents from per-1k USD costs WITHOUT rounding up (no ceil)", () => {
    // 2000 in * 0.000075/1k = 0.00015 USD; 1000 out * 0.0003/1k = 0.0003 USD.
    // total 0.00045 USD = 4.5 micro-cents-of-a-cent -> 0.00045 * 1e6 = 450 µ¢.
    // Legacy ceil would have billed 1 whole cent (10000 µ¢) for the same call.
    expect(computeCostMicrocents(2000, 1000, 0.000075, 0.0003)).toBe(450);
  });

  it("matches Langfuse for a 0.013303 USD generation (the reported case)", () => {
    // gemini-3.5-flash $1.50/1M in, $9.00/1M out (per-1k 0.0015 / 0.009).
    // Choose tokens that bill exactly 0.013303 USD:
    //   in/1000 * 0.0015 + out/1000 * 0.009 = 0.013303 USD.
    // 2000 in -> 0.003; remaining 0.010303 / 0.009 * 1000 = 1144.78 out tokens.
    // Use the closed value directly: round(0.013303 * 1e6) = 13303 µ¢ -> $0.0133.
    const microcents = computeCostMicrocents(2000, 1144.7778, 0.0015, 0.009);
    expect(microcents).toBe(13303);
  });

  it("scales with large token counts (no precision loss to integers)", () => {
    // 1,000,000 in * 0.000075/1k = 0.075 USD; 500,000 out * 0.0003/1k = 0.15 USD.
    // total 0.225 USD * 1e6 = 225000 µ¢.
    expect(computeCostMicrocents(1_000_000, 500_000, 0.000075, 0.0003)).toBe(
      225000,
    );
  });

  it("returns 0 when there is no usage", () => {
    expect(computeCostMicrocents(0, 0, 0.000075, 0.0003)).toBe(0);
  });
});

describe("microcentsToCents", () => {
  it("rounds micro-cents to the nearest whole cent (NOT up) for the dual-write", () => {
    // 13303 µ¢ = 1.3303 cents -> nearest cent = 1.
    expect(microcentsToCents(13303)).toBe(1);
    // 70000 µ¢ = 7 cents exactly.
    expect(microcentsToCents(70000)).toBe(7);
    // 450 µ¢ = 0.045 cents -> nearest cent = 0 (legacy ceil billed 1).
    expect(microcentsToCents(450)).toBe(0);
  });
});
