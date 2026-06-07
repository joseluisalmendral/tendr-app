/**
 * Cost in whole cents for a model call, from the manifest per-1k-token costs.
 *
 * Manifest costs are per 1k tokens in USD (numeric strings in the DB); multiply
 * by 100 to get cents and round UP so a non-zero usage never bills as 0. Pure so
 * the ledger math is unit-testable. Mirrors the F6 extractor's computeCostCents
 * (kept as a standalone module so the F7 Server Actions can reuse it without
 * importing the Inngest worker).
 */
export function computeCostCents(
  tokensIn: number,
  tokensOut: number,
  costPer1kInput: number,
  costPer1kOutput: number,
): number {
  return Math.ceil(
    (tokensIn / 1000) * costPer1kInput * 100 +
      (tokensOut / 1000) * costPer1kOutput * 100,
  );
}
