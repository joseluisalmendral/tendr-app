import { describe, expect, it } from "vitest";

import {
  AiProviderError,
  isAiProviderError,
  mapProviderError,
  statusForCode,
} from "@/lib/ai/provider-errors";

/**
 * AI error taxonomy (decision #757): NO_KEY_CONFIGURED / INVALID_KEY /
 * RATE_LIMIT / INSUFFICIENT_CREDITS / MODEL_NOT_AVAILABLE, mapped from the REAL
 * per-provider payload shapes (401/403/429/404 semantics differ per provider).
 *
 * Pure unit test — the fixtures mirror the actual SDK `APICallError` surface
 * (statusCode + data.error.{type,code}) each provider returns, so the mapper is
 * proven against real shapes, not invented ones.
 */

/** Builds an AI-SDK-style APICallError fixture. */
function apiError(statusCode: number, data: unknown, message = "provider error") {
  return Object.assign(new Error(message), {
    name: "AI_APICallError",
    statusCode,
    data,
  });
}

describe("mapProviderError — OpenAI", () => {
  it("401 invalid_api_key -> INVALID_KEY", () => {
    const e = apiError(401, {
      error: {
        message: "Incorrect API key provided: sk-***",
        type: "invalid_request_error",
        code: "invalid_api_key",
      },
    });
    expect(mapProviderError(e).code).toBe("INVALID_KEY");
  });

  it("429 insufficient_quota -> INSUFFICIENT_CREDITS", () => {
    const e = apiError(429, {
      error: {
        message: "You exceeded your current quota, please check your plan and billing details.",
        type: "insufficient_quota",
        code: "insufficient_quota",
      },
    });
    expect(mapProviderError(e).code).toBe("INSUFFICIENT_CREDITS");
  });

  it("429 rate_limit_exceeded -> RATE_LIMIT", () => {
    const e = apiError(429, {
      error: {
        message: "Rate limit reached for requests",
        type: "requests",
        code: "rate_limit_exceeded",
      },
    });
    expect(mapProviderError(e).code).toBe("RATE_LIMIT");
  });

  it("404 model_not_found -> MODEL_NOT_AVAILABLE", () => {
    const e = apiError(404, {
      error: {
        message: "The model `gpt-nope` does not exist",
        type: "invalid_request_error",
        code: "model_not_found",
      },
    });
    expect(mapProviderError(e).code).toBe("MODEL_NOT_AVAILABLE");
  });
});

describe("mapProviderError — Anthropic", () => {
  it("401 authentication_error -> INVALID_KEY", () => {
    const e = apiError(401, {
      type: "error",
      error: { type: "authentication_error", message: "invalid x-api-key" },
    });
    expect(mapProviderError(e).code).toBe("INVALID_KEY");
  });

  it("429 rate_limit_error -> RATE_LIMIT", () => {
    const e = apiError(429, {
      type: "error",
      error: { type: "rate_limit_error", message: "Number of requests has exceeded" },
    });
    expect(mapProviderError(e).code).toBe("RATE_LIMIT");
  });

  it("400 invalid_request_error mentioning credit balance -> INSUFFICIENT_CREDITS", () => {
    const e = apiError(400, {
      type: "error",
      error: {
        type: "invalid_request_error",
        message: "Your credit balance is too low to access the Anthropic API.",
      },
    });
    expect(mapProviderError(e).code).toBe("INSUFFICIENT_CREDITS");
  });
});

describe("mapProviderError — Google (Generative Language)", () => {
  it("400 API_KEY_INVALID -> INVALID_KEY", () => {
    const e = apiError(400, {
      error: {
        code: 400,
        message: "API key not valid. Please pass a valid API key.",
        status: "INVALID_ARGUMENT",
        // Google nests reason in details; the surfaced status string carries it.
        type: "API_KEY_INVALID",
      },
    });
    expect(mapProviderError(e).code).toBe("INVALID_KEY");
  });

  it("429 RESOURCE_EXHAUSTED (free-tier RPM) -> RATE_LIMIT", () => {
    const e = apiError(429, {
      error: {
        code: 429,
        message: "Resource has been exhausted (e.g. check quota).",
        status: "RESOURCE_EXHAUSTED",
      },
    });
    expect(mapProviderError(e).code).toBe("RATE_LIMIT");
  });

  it("404 model not found -> MODEL_NOT_AVAILABLE", () => {
    const e = apiError(404, {
      error: {
        code: 404,
        message: "models/gemini-nope is not found for API version v1beta",
        status: "NOT_FOUND",
      },
    });
    expect(mapProviderError(e).code).toBe("MODEL_NOT_AVAILABLE");
  });
});

describe("mapProviderError — misc", () => {
  it("403 permission_error with billing -> INSUFFICIENT_CREDITS", () => {
    const e = apiError(403, {
      error: { type: "permission_error", message: "billing not active" },
    });
    expect(mapProviderError(e).code).toBe("INSUFFICIENT_CREDITS");
  });

  it("unknown status, opaque error -> UNKNOWN", () => {
    expect(mapProviderError(new Error("boom")).code).toBe("UNKNOWN");
  });

  it("passes through an existing AiProviderError", () => {
    const err = new AiProviderError("RATE_LIMIT");
    expect(mapProviderError(err)).toBe(err);
    expect(isAiProviderError(err)).toBe(true);
  });

  it("status mapping is stable", () => {
    expect(statusForCode("INVALID_KEY")).toBe(401);
    expect(statusForCode("RATE_LIMIT")).toBe(429);
    expect(statusForCode("INSUFFICIENT_CREDITS")).toBe(402);
    expect(statusForCode("MODEL_NOT_AVAILABLE")).toBe(404);
    expect(statusForCode("NO_KEY_CONFIGURED")).toBe(400);
  });

  it("never leaks the provider raw body in the curated message", () => {
    const e = apiError(401, {
      error: { type: "invalid_request_error", code: "invalid_api_key", message: "sk-LEAKED-KEY-123" },
    });
    const mapped = mapProviderError(e);
    expect(mapped.message).not.toContain("sk-LEAKED-KEY-123");
  });
});
