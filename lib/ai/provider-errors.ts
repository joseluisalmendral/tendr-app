import type { AiProvider } from "@/lib/ai/get-provider-client";

/**
 * AI provider error taxonomy (F7 / decision #757).
 *
 * A first-class, provider-agnostic classification of the failures an AI feature
 * call can hit, mapped from the REAL HTTP status + payload shape each provider
 * returns. The features (adaptTemplate / summarize / suggest) surface a curated,
 * actionable Spanish message per code; the raw provider body NEVER reaches the
 * client, the logs, or a Langfuse trace.
 *
 * Codes (review-pr1b W2 mandated this lands in PR4a):
 *   - NO_KEY_CONFIGURED   — the workspace has no key for the provider.
 *   - INVALID_KEY         — the key was rejected (401/403; bad/revoked key).
 *   - RATE_LIMIT          — the provider throttled the call (429, non-quota).
 *   - INSUFFICIENT_CREDITS — out of credits / quota exhausted (429 quota, 402).
 *   - MODEL_NOT_AVAILABLE — the model id is unknown/unavailable (404).
 *   - UNKNOWN             — anything we cannot classify.
 *
 * SECRETS HARD-STOP: this module reads only the status code and a coarse,
 * lowercased shape of the provider error TYPE/CODE string — never the key, never
 * a full body, and the result it returns carries ONLY the code + a curated
 * message. The provider's raw error is discarded.
 */

export type AiErrorCode =
  | "NO_KEY_CONFIGURED"
  | "INVALID_KEY"
  | "RATE_LIMIT"
  | "INSUFFICIENT_CREDITS"
  | "MODEL_NOT_AVAILABLE"
  | "UNKNOWN";

/** Curated, actionable Spanish messages per code (user-facing). */
const MESSAGES: Record<AiErrorCode, string> = {
  NO_KEY_CONFIGURED:
    "No hay key configurada para este provider. Añádela en /settings/ai.",
  INVALID_KEY:
    "Tu key del provider fue rechazada. Revísala en /settings/ai.",
  RATE_LIMIT:
    "El provider está limitando las llamadas (rate limit). Inténtalo en unos minutos.",
  INSUFFICIENT_CREDITS:
    "El provider rechazó la llamada por falta de crédito/cuota. Revisa tu cuenta del provider.",
  MODEL_NOT_AVAILABLE:
    "El modelo seleccionado no está disponible. Elige otro en /settings/ai.",
  UNKNOWN: "No se pudo completar la llamada de IA. Inténtalo de nuevo.",
};

/** HTTP status that maps a code to a Route Handler response. */
const STATUS: Record<AiErrorCode, number> = {
  NO_KEY_CONFIGURED: 400,
  INVALID_KEY: 401,
  RATE_LIMIT: 429,
  INSUFFICIENT_CREDITS: 402,
  MODEL_NOT_AVAILABLE: 404,
  UNKNOWN: 500,
};

/**
 * A classified AI provider error. The `code` drives the UI message and the
 * route-handler HTTP status; `message` is the curated, safe string.
 */
export class AiProviderError extends Error {
  readonly code: AiErrorCode;
  readonly status: number;

  constructor(code: AiErrorCode, message = MESSAGES[code]) {
    super(message);
    this.name = "AiProviderError";
    this.code = code;
    this.status = STATUS[code];
  }
}

export function isAiProviderError(error: unknown): error is AiProviderError {
  return (
    error instanceof AiProviderError ||
    (error instanceof Error && error.name === "AiProviderError")
  );
}

/** Curated message for a code (for callers that already have the code). */
export function messageForCode(code: AiErrorCode): string {
  return MESSAGES[code];
}

/** HTTP status for a code (for the streaming Route Handler). */
export function statusForCode(code: AiErrorCode): number {
  return STATUS[code];
}

/**
 * Extracts an HTTP status code from a thrown provider/SDK error, probing the
 * shapes the Vercel AI SDK and the underlying fetch errors expose.
 */
function extractStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const e = error as Record<string, unknown>;
  // AI SDK APICallError exposes `statusCode`; fetch-style errors use `status`.
  const candidates = [e.statusCode, e.status, (e.response as Record<string, unknown> | undefined)?.status];
  for (const c of candidates) {
    if (typeof c === "number") return c;
  }
  return undefined;
}

/**
 * A lowercased haystack of the provider error TYPE/CODE/short-message so we can
 * disambiguate same-status causes (e.g. 429 rate-limit vs 429 quota). We read
 * only the structured `type`/`code` fields and the first line of the message —
 * never a full body, never the key.
 */
function errorTokens(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return typeof error === "string" ? error.toLowerCase() : "";
  }
  const e = error as Record<string, unknown>;
  const data = (e.data ?? e.responseBody ?? {}) as Record<string, unknown>;
  const nestedError = (data.error ?? {}) as Record<string, unknown>;
  const topError = (e.error ?? {}) as Record<string, unknown>;
  const firstLine = (v: unknown): string | undefined =>
    typeof v === "string" ? v.split("\n")[0] : undefined;
  const parts: unknown[] = [
    e.code,
    e.type,
    topError.type,
    topError.code,
    nestedError.type,
    nestedError.code,
    nestedError.status,
    data.status,
    data.type,
    // Only the first line of any message — keep it short, never a full body.
    firstLine(e.message),
    firstLine(topError.message),
    firstLine(nestedError.message),
  ];
  return parts
    .filter((p): p is string | number => typeof p === "string" || typeof p === "number")
    .map((p) => String(p).toLowerCase())
    .join(" ");
}

/**
 * Maps a raw thrown provider/SDK error to the AI error taxonomy, honouring the
 * per-provider 401/403/429/404 semantics (they differ in payload shape):
 *
 *   - OpenAI: 401 invalid_api_key; 429 `insufficient_quota` (credits) vs
 *     `rate_limit_exceeded`; 404 `model_not_found`.
 *   - Anthropic: 401 `authentication_error`; 429 `rate_limit_error`;
 *     `billing`/credit issues surface as 400 `invalid_request_error` or 403
 *     `permission_error` → INSUFFICIENT_CREDITS when the tokens say "credit".
 *   - Google: 400 `API_KEY_INVALID`; 429 `RESOURCE_EXHAUSTED` (quota) →
 *     RATE_LIMIT (free-tier RPM) unless the body says billing/credit; 404
 *     model not found.
 *
 * Returns an `AiProviderError` carrying ONLY the code + curated message.
 */
export function mapProviderError(error: unknown): AiProviderError {
  if (isAiProviderError(error)) return error;

  const status = extractStatus(error);
  const tokens = errorTokens(error);

  const mentionsCredit =
    /insufficient_quota|insufficient[_ ]?credit|out of credit|billing|payment|quota.*exceed|exceeded your.*quota|credit balance/.test(
      tokens,
    );
  const mentionsKey =
    /invalid_api_key|api[_ ]?key[_ ]?invalid|authentication_error|invalid.*api key|unauthorized|permission_error|invalid x-api-key/.test(
      tokens,
    );
  const mentionsModel =
    /model_not_found|not_found|model.*not.*(found|exist|available)|unknown model/.test(
      tokens,
    );
  const mentionsRate = /rate.?limit|too many requests|resource_exhausted|throttl/.test(
    tokens,
  );

  switch (status) {
    case 401:
    case 403:
      // 403 can be a billing/permission credit issue (Anthropic) — prefer
      // INSUFFICIENT_CREDITS only when the body clearly says so.
      if (status === 403 && mentionsCredit) {
        return new AiProviderError("INSUFFICIENT_CREDITS");
      }
      return new AiProviderError("INVALID_KEY");
    case 402:
      return new AiProviderError("INSUFFICIENT_CREDITS");
    case 404:
      return new AiProviderError("MODEL_NOT_AVAILABLE");
    case 429:
      // Same status, different cause: OpenAI insufficient_quota vs
      // rate_limit_exceeded; Google RESOURCE_EXHAUSTED is the free-tier RPM cap
      // (rate limit) unless the body names credit/billing.
      if (mentionsCredit) return new AiProviderError("INSUFFICIENT_CREDITS");
      return new AiProviderError("RATE_LIMIT");
    case 400:
      // Google reports an invalid key as 400 API_KEY_INVALID.
      if (mentionsKey) return new AiProviderError("INVALID_KEY");
      if (mentionsModel) return new AiProviderError("MODEL_NOT_AVAILABLE");
      if (mentionsCredit) return new AiProviderError("INSUFFICIENT_CREDITS");
      return new AiProviderError("UNKNOWN");
    default:
      break;
  }

  // No usable status — fall back to token heuristics.
  if (mentionsKey) return new AiProviderError("INVALID_KEY");
  if (mentionsCredit) return new AiProviderError("INSUFFICIENT_CREDITS");
  if (mentionsModel) return new AiProviderError("MODEL_NOT_AVAILABLE");
  if (mentionsRate) return new AiProviderError("RATE_LIMIT");
  return new AiProviderError("UNKNOWN");
}

/** Per-provider provider id passthrough (kept for symmetry / future tuning). */
export type { AiProvider };
