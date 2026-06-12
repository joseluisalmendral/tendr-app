/**
 * Sentry client (browser) configuration.
 *
 * Next 16 loads `instrumentation-client.ts` automatically on the client. The
 * DSN must be public (NEXT_PUBLIC_SENTRY_DSN) to reach the browser bundle.
 * `onRouterTransitionStart` wires App Router navigation into Sentry tracing.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
