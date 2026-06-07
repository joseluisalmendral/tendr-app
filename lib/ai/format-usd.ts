/**
 * Formats a USD micro-cents amount (USD * 10000) as a localized USD string.
 *
 * F7c finding 1: the ledger/usage UI must show REAL USD (the manifest prices and
 * Langfuse are USD) instead of mislabelling cents as EUR. A 0.013303 USD
 * generation is stored as 13303 micro-cents and MUST display as "$0.0133" (not
 * "$0.03"), so we render 2-4 fraction digits — enough to surface sub-cent spend
 * without trailing-zero noise on whole-cent amounts.
 *
 *   formatUsd(13303)  -> "$0.0133"
 *   formatUsd(70000)  -> "$0.07"
 *   formatUsd(5_000_000) -> "$5.00"
 *
 * Uses Intl currency formatting so the symbol/locale stay consistent app-wide.
 */
export function formatUsd(microcents: number): string {
  const usd = microcents / 1_000_000;
  return usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}
