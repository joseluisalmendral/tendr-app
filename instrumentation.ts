/**
 * Next.js instrumentation hook (App Router).
 *
 * Next calls `register()` once at server startup. We start the OTEL NodeSDK
 * (Langfuse span processor) only in the Node.js runtime — the OpenTelemetry
 * Node SDK and `@langfuse/otel` are not compatible with the Edge runtime, so
 * importing them there would break the build.
 *
 * Sentry (v10, Next 16) is initialised here too via per-runtime config modules
 * so server and edge errors are captured. `onRequestError` is re-exported from
 * @sentry/nextjs so Next forwards uncaught request errors (RSC, route handlers,
 * server actions) to Sentry automatically.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startObservability } = await import(
      "@/lib/observability/instrumentation"
    );
    startObservability();

    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export { captureRequestError as onRequestError } from "@sentry/nextjs";
