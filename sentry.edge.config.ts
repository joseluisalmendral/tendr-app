/**
 * Sentry edge-runtime configuration.
 *
 * Imported from `instrumentation.ts` only in the Edge runtime (middleware and
 * edge route handlers). Keep this lean: the Edge runtime forbids Node APIs.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? "development",
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});
