/**
 * Sentry server-runtime configuration (Node.js).
 *
 * Imported from `instrumentation.ts` only in the Node.js runtime. The DSN is
 * read from SENTRY_DSN (server) or NEXT_PUBLIC_SENTRY_DSN (shared). When no DSN
 * is set Sentry.init is a no-op, so local/dev runs without the env stay silent.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? "development",
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: 0.1,
  // Send default PII off; this is a B2B CRM with tenant data under RLS.
  sendDefaultPii: false,
});
