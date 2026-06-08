import "server-only";

import Stripe from "stripe";

/**
 * Server-only Stripe client (F8).
 *
 * The `import "server-only"` on the first line makes this module a build-time
 * tripwire: if any Client Component (or any file reachable from client code)
 * imports it, the Next.js build FAILS. The secret key therefore can never be
 * bundled into the browser. Webhook handlers and Server Actions are the only
 * legitimate callers.
 *
 * `apiVersion` is PINNED to the version the installed SDK ships
 * (stripe@22.2.0 → '2026-05-27.dahlia', read from
 * node_modules/stripe/cjs/apiVersion.d.ts). Pinning decouples our request
 * shape from Stripe's account-level default so upgrading the account API
 * version never silently changes the payloads this code sends/receives.
 *
 * The client is LAZY: it is built on first access, not at module import.
 * Importing this module (e.g. by the import-tested subscriptions seam, which
 * never touches the real client) must not throw just because
 * STRIPE_SECRET_KEY is unset in that context.
 */
let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  cached = new Stripe(apiKey, { apiVersion: "2026-05-27.dahlia" });
  return cached;
}
