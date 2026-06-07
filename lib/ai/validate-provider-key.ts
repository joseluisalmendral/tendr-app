import "server-only";

import type { AiProvider } from "@/lib/ai/get-provider-client";

/**
 * Cheap pre-save validation of a BYO provider key.
 *
 * Performs a SINGLE authenticated request to the provider's models/list
 * endpoint with a short timeout and returns a plain boolean. It MUST NOT leak
 * the provider's response body, headers, or the key itself — callers map a
 * `false` to a curated "Key inválida" message with no detail.
 *
 * SECRETS HARD-STOP: the plaintext key is only used to build the auth header
 * for this request and is never logged or returned.
 */

const TIMEOUT_MS = 5_000;
const MOONSHOT_MODELS_URL = "https://api.moonshot.ai/v1/models";

/** Builds the (url, headers) for the provider's authenticated models call. */
function buildModelsRequest(
  provider: AiProvider,
  plaintextKey: string,
): { url: string; headers: Record<string, string> } {
  switch (provider) {
    case "openai":
      return {
        url: "https://api.openai.com/v1/models",
        headers: { Authorization: `Bearer ${plaintextKey}` },
      };
    case "anthropic":
      return {
        url: "https://api.anthropic.com/v1/models",
        headers: {
          "x-api-key": plaintextKey,
          "anthropic-version": "2023-06-01",
        },
      };
    case "google":
      return {
        // Google AI Studio keys authenticate via query param, not a header.
        url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
          plaintextKey,
        )}`,
        headers: {},
      };
    case "deepseek":
      return {
        url: "https://api.deepseek.com/models",
        headers: { Authorization: `Bearer ${plaintextKey}` },
      };
    case "moonshot":
      return {
        url: MOONSHOT_MODELS_URL,
        headers: { Authorization: `Bearer ${plaintextKey}` },
      };
    default: {
      // Exhaustiveness guard — unreachable for the closed AiProvider union.
      const _exhaustive: never = provider;
      throw new Error(`Unknown provider: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Returns `true` when the key authenticates against the provider, `false`
 * otherwise (non-2xx response, network error, or timeout). NEVER throws and
 * NEVER surfaces provider error bodies.
 */
export async function validateProviderKey(
  provider: AiProvider,
  plaintextKey: string,
): Promise<boolean> {
  const { url, headers } = buildModelsRequest(provider, plaintextKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    // Only the status matters; the body is intentionally never read or logged.
    return response.ok;
  } catch {
    // Network errors and timeouts (AbortError) are treated as invalid without
    // leaking any detail.
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
