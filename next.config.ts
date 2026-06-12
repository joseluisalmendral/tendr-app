import type { NextConfig } from "next";

import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Next dev blocks cross-origin requests to its dev resources by default.
  // The local Supabase auth flow redirects through 127.0.0.1 (site_url), so
  // allow it in development to keep hydration working on that origin.
  allowedDevOrigins: ["127.0.0.1"],
};

/**
 * Wrap with Sentry for source-map upload at build time.
 *
 * Source maps are only uploaded when SENTRY_AUTH_TOKEN is present (set in
 * Vercel prod). Locally and in PR CI the token is absent: `silent` keeps the
 * build quiet and the plugin skips the upload WITHOUT failing the build, so
 * `pnpm build` works with no Sentry secrets.
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Upload source maps only when an auth token is available.
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  // Tunnel browser requests through the app to dodge ad-blockers (optional,
  // safe default). Route handled by the Sentry webpack/turbopack plugin.
  tunnelRoute: "/monitoring",
});
