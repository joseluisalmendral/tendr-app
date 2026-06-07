import { describe, expect, it } from "vitest";

import { formatUsd } from "@/lib/ai/format-usd";

/**
 * USD display formatting (F7c finding 1). The usage UI must show REAL USD, not
 * cents mislabelled as EUR. Sub-cent spend surfaces with up to 4 fraction
 * digits; whole-cent amounts drop the trailing zeros.
 */
describe("formatUsd", () => {
  it("renders a 0.013303 USD generation as $0.0133 (Langfuse parity)", () => {
    expect(formatUsd(13303)).toBe("$0.0133");
  });

  it("renders whole cents with 2 decimals (no sub-cent noise)", () => {
    expect(formatUsd(70000)).toBe("$0.07");
  });

  it("renders zero spend as $0.00", () => {
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("renders dollars", () => {
    expect(formatUsd(5_000_000)).toBe("$5.00");
  });

  it("rounds the 4th decimal for very small spend", () => {
    // 0.00004999 USD -> 4-decimal rounding -> $0.0000 (below display floor).
    expect(formatUsd(49.99)).toBe("$0.00");
    // 125 µ¢ = 0.000125 USD -> $0.0001 (rounds to 4 decimals).
    expect(formatUsd(125)).toBe("$0.0001");
  });
});
