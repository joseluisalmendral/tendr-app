/**
 * Cost in USD micro-cents (USD * 10000, $0.0001 granularity) for a model call,
 * from the manifest per-1k-token USD costs.
 *
 * F7c finding 1: the legacy `computeCostCents` rounded UP per call (Math.ceil),
 * so a real $0.013303 generation billed as $0.03. This helper rounds to the
 * NEAREST micro-cent with NO per-call ceil, so the recorded figure matches
 * Langfuse within 4-decimal display rounding ($0.013303 -> 13303 microcents ->
 * "$0.0133"). Money stays integer (no float drift in SUM).
 *
 *   microcents = round( (tokensIn/1000 * per1kIn + tokensOut/1000 * per1kOut)
 *                       * 1_000_000 )
 *
 * The * 1_000_000 converts USD to micro-cents (USD * 100 cents * 10000). Pure so
 * the ledger math is unit-testable. Manifest costs are per 1k tokens in USD.
 */
export function computeCostMicrocents(
  tokensIn: number,
  tokensOut: number,
  costPer1kInput: number,
  costPer1kOutput: number,
): number {
  return Math.round(
    ((tokensIn / 1000) * costPer1kInput +
      (tokensOut / 1000) * costPer1kOutput) *
      1_000_000,
  );
}

/**
 * Legacy whole-cents value derived from micro-cents, for the dual-written
 * `cost_cents` column during the F7c transition. Rounds to the nearest cent
 * (NOT up) so it stays consistent with the no-ceil micro-cents figure.
 */
export function microcentsToCents(microcents: number): number {
  return Math.round(microcents / 10000);
}
