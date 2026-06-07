/**
 * Next.js instrumentation hook (App Router).
 *
 * Next calls `register()` once at server startup. We start the OTEL NodeSDK
 * (Langfuse span processor) only in the Node.js runtime — the OpenTelemetry
 * Node SDK and `@langfuse/otel` are not compatible with the Edge runtime, so
 * importing them there would break the build.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startObservability } = await import(
      "@/lib/observability/instrumentation"
    );
    startObservability();
  }
}
