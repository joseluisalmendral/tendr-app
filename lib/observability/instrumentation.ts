import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeSDK } from "@opentelemetry/sdk-node";

/**
 * Langfuse v5 observability bootstrap (OpenTelemetry-based).
 *
 * Langfuse v5 ships an OTEL `SpanProcessor`. A single `NodeSDK` registers it
 * once for the process; `startObservation` (from `@langfuse/tracing`) then
 * emits spans into it. The processor is EXPORTED so worker steps can call
 * `forceFlush()` before they return: an Inngest step runs in a short-lived
 * serverless runtime that can be torn down immediately after the step
 * resolves, and any spans still buffered would be lost without an explicit
 * flush.
 *
 * Credentials and host come from the environment (names verified against the
 * deployed config): `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and
 * `LANGFUSE_BASE_URL` (underscore form — this is the v5 variable name).
 *
 * PRIVACY: traces carry METADATA ONLY (workspace id, document id, feature,
 * provider, input kind/length, token usage). PDF bytes and extracted text are
 * NEVER attached to any span — see `inngest/extract-document.ts`.
 */
export const langfuseSpanProcessor = new LangfuseSpanProcessor({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL,
});

const sdk = new NodeSDK({
  spanProcessors: [langfuseSpanProcessor],
});

let started = false;

/** Starts the OTEL NodeSDK exactly once. Safe to call repeatedly. */
export function startObservability(): void {
  if (started) return;
  started = true;
  sdk.start();
}
