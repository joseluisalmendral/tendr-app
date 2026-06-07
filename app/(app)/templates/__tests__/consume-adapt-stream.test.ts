import { describe, expect, it, vi } from "vitest";

import { consumeAdaptStream } from "../consume-adapt-stream";

/**
 * Headless tests for `consumeAdaptStream` — the crux of review-pr4a WARNING-1.
 *
 * The streaming adapt dialog must NEVER show a silently truncated adaptation:
 *   - pre-stream non-2xx → curated taxonomy message + code (no stream).
 *   - mid-stream provider failure (reader rejects) → curated error, partial
 *     text NOT surfaced as a successful adaptation.
 *   - user abort → 'aborted' (not an error), partial text preserved for the
 *     caller to discard.
 *
 * Runs in the `node` vitest environment using the global Response/ReadableStream
 * (Web Streams) — no DOM, no real network. This is the honest, deterministic
 * coverage; the LIVE browser stream walk is flagged MANUAL VERIFICATION NEEDED.
 */

const encoder = new TextEncoder();

/** A 200 Response whose body streams `chunks`, then optionally errors. */
function streamingResponse(
  chunks: string[],
  opts: { errorAfter?: boolean } = {},
): Response {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    // `pull` is invoked once per consumer read, so the enqueued chunks are
    // delivered to the reader BEFORE the error fires on a later pull — exactly
    // how a mid-stream provider failure arrives after some text has streamed.
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index += 1;
        return;
      }
      if (opts.errorAfter) {
        controller.error(new Error("mid-stream provider failure"));
      } else {
        controller.close();
      }
    },
  });
  return new Response(body, { status: 200 });
}

describe("consumeAdaptStream", () => {
  it("happy path: accumulates chunks and resolves done", async () => {
    const response = streamingResponse(["Hola ", "mundo ", "adaptado."]);
    const chunks: string[] = [];

    const result = await consumeAdaptStream(response, (acc) => chunks.push(acc));

    expect(result.status).toBe("done");
    if (result.status !== "done") return;
    expect(result.text).toBe("Hola mundo adaptado.");
    // onChunk receives the ACCUMULATED text each time (live preview).
    expect(chunks.at(-1)).toBe("Hola mundo adaptado.");
    expect(chunks.length).toBeGreaterThanOrEqual(3);
  });

  it("pre-stream 401 INVALID_KEY: curated message + code, no stream consumed", async () => {
    const response = new Response(
      JSON.stringify({
        error: "Tu key del provider fue rechazada. Revísala en /settings/ai.",
        code: "INVALID_KEY",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
    const onChunk = vi.fn();

    const result = await consumeAdaptStream(response, onChunk);

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.code).toBe("INVALID_KEY");
    expect(result.message).toContain("rechazada");
    expect(onChunk).not.toHaveBeenCalled();
  });

  it("pre-stream 429 budget_exceeded: curated message + code", async () => {
    const response = new Response(
      JSON.stringify({
        error: "Budget mensual superado. Súbelo en /settings/ai.",
        code: "budget_exceeded",
      }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );

    const result = await consumeAdaptStream(response, vi.fn());

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.code).toBe("budget_exceeded");
    expect(result.message).toContain("Budget");
  });

  it("pre-stream unknown code falls back to a generic curated message", async () => {
    const response = new Response(JSON.stringify({ code: "weird" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });

    const result = await consumeAdaptStream(response, vi.fn());

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.code).toBe("unknown");
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("WARNING-1: mid-stream error → curated error, partial text NOT a success", async () => {
    const response = streamingResponse(["Adaptación parcial…"], {
      errorAfter: true,
    });

    const result = await consumeAdaptStream(response, vi.fn());

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    // Curated message, never a raw provider body.
    expect(result.message).toContain("/settings/ai");
    // The partial text is captured for the caller to DISCARD — it is not
    // returned as a completed adaptation.
    expect(result.partialText).toContain("Adaptación parcial");
  });

  it("user abort mid-stream resolves as aborted (not an error)", async () => {
    const controller = new AbortController();
    // An endless body: each pull yields a chunk so the consumer keeps looping
    // until the abort signal is observed at the top of the next iteration.
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(encoder.encode("chunk "));
      },
    });
    const response = new Response(body, { status: 200 });

    // The first onChunk aborts; the loop observes it before the next read.
    const result = await consumeAdaptStream(
      response,
      () => controller.abort(),
      controller.signal,
    );

    expect(result.status).toBe("aborted");
  });
});
