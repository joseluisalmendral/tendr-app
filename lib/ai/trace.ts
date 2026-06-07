/**
 * Langfuse v5 tracing port for the F7 AI features (adaptTemplate / summarize /
 * suggest).
 *
 * The repo traces via `@langfuse/tracing`'s `startObservation(name, { model,
 * metadata }, { asType: 'generation' })` then `generation.update({ output,
 * usageDetails })`, `generation.end()`, and a final
 * `langfuseSpanProcessor.forceFlush()` (see inngest/extract-document.ts). The
 * three F7 Server-Action features follow the SAME pattern.
 *
 * This module defines a narrow, INJECTABLE port so:
 *   1. PII redaction stays in ONE place under our control (metadata-only,
 *      output carries only a length + usage — NEVER the generated text, the
 *      template body, or client notes).
 *   2. Tests capture every traced arg via a fake port WITHOUT vi.mock — matching
 *      the repo's seam-injection convention. The fake records args so the
 *      PII-redaction assertions can prove no note/template text was traced.
 *
 * SECRETS HARD-STOP (binding): a caller MUST only ever pass redacted metadata
 * (ids + counts + lengths) and an output of `{ length }`. The plaintext key,
 * template body, client notes, summary text, and suggestion text NEVER cross
 * this port.
 */

/**
 * Token usage attached to a generation observation (Langfuse `usageDetails`).
 * The index signature keeps it assignable to Langfuse's `{ [key: string]:
 * number }` usageDetails shape.
 */
export interface TraceUsage {
  input: number;
  output: number;
  total: number;
  [key: string]: number;
}

/** A live generation observation: update with redacted output + usage, then end. */
export interface TraceGeneration {
  update(args: {
    output?: Record<string, unknown>;
    usageDetails?: TraceUsage;
  }): void;
  end(): void;
}

/**
 * The injectable tracing port. `startGeneration` opens a metadata-only
 * generation; `flush` force-flushes the span processor (short-lived serverless
 * runtimes can be torn down before buffered spans export).
 */
export interface TracePort {
  startGeneration(
    name: string,
    model: string,
    metadata: Record<string, unknown>,
  ): TraceGeneration;
  flush(): Promise<void>;
}

/**
 * Production port — wraps the real Langfuse v5 surface. Imported only by the
 * `"use server"` wrappers / route handler (NOT by the import-tested seams), so
 * `server-only` coupling never leaks into the seam tests.
 */
export async function createLangfuseTracePort(): Promise<TracePort> {
  const { startObservation } = await import("@langfuse/tracing");
  const { langfuseSpanProcessor } = await import(
    "@/lib/observability/instrumentation"
  );

  return {
    startGeneration(name, model, metadata) {
      const generation = startObservation(
        name,
        { model, metadata },
        { asType: "generation" },
      );
      return {
        update(args) {
          generation.update(args);
        },
        end() {
          generation.end();
        },
      };
    },
    async flush() {
      await langfuseSpanProcessor.forceFlush();
    },
  };
}

/** A no-op port (e.g. when tracing is intentionally disabled). */
export const noopTracePort: TracePort = {
  startGeneration() {
    return { update() {}, end() {} };
  },
  async flush() {},
};
