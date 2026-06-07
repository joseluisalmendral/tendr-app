import { afterEach, describe, expect, it, vi } from "vitest";

import type { AiProvider } from "@/lib/ai/get-provider-client";
import { validateProviderKey } from "@/lib/ai/validate-provider-key";

/**
 * validateProviderKey unit tests — fetch is faked, NO real network.
 *
 * We assert the boolean contract (200 -> true, 401/timeout -> false) and that
 * the function returns ONLY a boolean: provider response bodies never leak into
 * the result. The keys here are obviously-fake test constants.
 */

const FAKE_KEY = "sk-fake-test-key-0000000000000000";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubFetch(impl: typeof fetch) {
  vi.stubGlobal("fetch", vi.fn(impl) as unknown as typeof fetch);
}

describe("validateProviderKey", () => {
  it("returns true on a 200 response", async () => {
    stubFetch(async () => new Response("{}", { status: 200 }));
    await expect(validateProviderKey("openai", FAKE_KEY)).resolves.toBe(true);
  });

  it("returns false on a 401 response", async () => {
    stubFetch(
      async () =>
        new Response(JSON.stringify({ error: "invalid api key" }), {
          status: 401,
        }),
    );
    await expect(validateProviderKey("openai", FAKE_KEY)).resolves.toBe(false);
  });

  it("returns false (never throws) on a network error / timeout", async () => {
    stubFetch(async () => {
      throw new DOMException("aborted", "AbortError");
    });
    await expect(validateProviderKey("anthropic", FAKE_KEY)).resolves.toBe(
      false,
    );
  });

  it("never leaks the provider error body into the return value", async () => {
    const secretBody = "PROVIDER_INTERNAL_ERROR_DETAIL_XYZ";
    const readBody = vi.fn();
    stubFetch(async () => ({
      ok: false,
      status: 403,
      text: async () => {
        readBody();
        return secretBody;
      },
    }) as unknown as Response);

    const result = await validateProviderKey("deepseek", FAKE_KEY);

    // The return is a bare boolean and the body was never read.
    expect(result).toBe(false);
    expect(typeof result).toBe("boolean");
    expect(readBody).not.toHaveBeenCalled();
  });

  it.each<AiProvider>([
    "openai",
    "anthropic",
    "google",
    "deepseek",
    "moonshot",
  ])("issues a single authenticated request for provider %s", async (provider) => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy as unknown as typeof fetch);

    await expect(validateProviderKey(provider, FAKE_KEY)).resolves.toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const call = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    const [url, init] = call;
    expect(typeof url).toBe("string");
    expect(init.method).toBe("GET");
  });
});
