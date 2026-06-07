import { messageForCode, type AiErrorCode } from "@/lib/ai/provider-errors";

/**
 * Pure, headless-testable consumer for the POST /api/ai/adapt-template response
 * (F7 Block C / PR4b). Extracted from the dialog so the error semantics — the
 * crux of review-pr4a WARNING-1 — are unit-tested without a real DOM/stream.
 *
 * Two error surfaces, both mapped to a CURATED message (never a raw provider
 * body, never a silently truncated adaptation):
 *
 *   1. PRE-STREAM error: the Route Handler returns a non-2xx JSON body
 *      `{ error, code }` BEFORE any stream starts (validation_error 400 /
 *      not_found 404 / NO_KEY_CONFIGURED / INVALID_KEY 401 / budget_exceeded 429
 *      / INSUFFICIENT_CREDITS 402 / MODEL_NOT_AVAILABLE 404 / unauthorized 401).
 *      We parse it and surface its curated `error` message + `code`.
 *
 *   2. MID-STREAM error (WARNING-1): the response is 200 and the byte stream
 *      starts, then the provider errors mid-flight (revoked key / rate limit hit
 *      during streaming). `toTextStreamResponse()` carries no onError mask, so
 *      the underlying ReadableStream reader REJECTS on `.read()`. We catch that
 *      rejection and, INSTEAD of leaving a truncated adaptation on screen,
 *      finish with a curated error so the dialog renders the taxonomy message.
 *      A user abort (dialog closed) surfaces as `aborted`, not an error.
 */

export type ConsumeErrorCode =
  | AiErrorCode
  | "validation_error"
  | "not_found"
  | "budget_exceeded"
  | "unauthorized"
  | "unknown";

export type ConsumeAdaptResult =
  | { status: "done"; text: string }
  | { status: "aborted"; text: string }
  | {
      status: "error";
      code: ConsumeErrorCode;
      message: string;
      /** Partial text received before a mid-stream failure (UI discards it). */
      partialText: string;
    };

const GENERIC_ERROR = "No se pudo completar la adaptación. Inténtalo de nuevo.";

const MID_STREAM_ERROR =
  "Se interrumpió la generación. Puede ser un problema con tu key o un límite del provider. Revísalo en /settings/ai.";

const AI_CODES: readonly string[] = [
  "NO_KEY_CONFIGURED",
  "INVALID_KEY",
  "RATE_LIMIT",
  "INSUFFICIENT_CREDITS",
  "MODEL_NOT_AVAILABLE",
  "UNKNOWN",
];

const KNOWN_CODES: ReadonlySet<string> = new Set([
  ...AI_CODES,
  "validation_error",
  "not_found",
  "budget_exceeded",
  "unauthorized",
]);

function normalizeCode(raw: unknown): ConsumeErrorCode {
  return typeof raw === "string" && KNOWN_CODES.has(raw)
    ? (raw as ConsumeErrorCode)
    : "unknown";
}

/** Curated message for a code, preferring the AI taxonomy when applicable. */
function curatedMessage(code: ConsumeErrorCode, fallback?: string): string {
  if (AI_CODES.includes(code)) return messageForCode(code as AiErrorCode);
  if (fallback && fallback.length > 0) return fallback;
  return GENERIC_ERROR;
}

/**
 * Consumes the adapt-template Response. `onChunk` receives the accumulated text
 * on each delta so the caller renders the live markdown preview. `signal` lets
 * the caller abort; an aborted read resolves as `aborted`.
 */
export async function consumeAdaptStream(
  response: Response,
  onChunk: (accumulated: string) => void,
  signal?: AbortSignal,
): Promise<ConsumeAdaptResult> {
  // 1. PRE-STREAM error: non-2xx → curated JSON body { error, code }.
  if (!response.ok) {
    let body: { error?: unknown; code?: unknown } = {};
    try {
      body = (await response.json()) as { error?: unknown; code?: unknown };
    } catch {
      body = {};
    }
    const code = normalizeCode(body.code);
    const routeMessage =
      typeof body.error === "string" ? body.error : undefined;
    return {
      status: "error",
      code,
      message: routeMessage ?? curatedMessage(code),
      partialText: "",
    };
  }

  if (!response.body) {
    return {
      status: "error",
      code: "unknown",
      message: GENERIC_ERROR,
      partialText: "",
    };
  }

  // 2. Read the byte stream. A mid-stream provider error rejects `.read()`
  //    (WARNING-1) — caught below and turned into a curated error.
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";

  try {
    for (;;) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => {});
        return { status: "aborted", text: accumulated };
      }
      const { done, value } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value, { stream: true });
      onChunk(accumulated);
    }
    const tail = decoder.decode();
    if (tail.length > 0) {
      accumulated += tail;
      onChunk(accumulated);
    }
    return { status: "done", text: accumulated };
  } catch (e) {
    if (signal?.aborted || (e instanceof Error && e.name === "AbortError")) {
      return { status: "aborted", text: accumulated };
    }
    return {
      status: "error",
      code: "unknown",
      message: MID_STREAM_ERROR,
      partialText: accumulated,
    };
  }
}
