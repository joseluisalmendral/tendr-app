import { describe, expect, it } from "vitest";

import {
  getProviderClient,
  ProviderNotConfiguredError,
} from "@/lib/ai/get-provider-client";

/**
 * F6 wires only the Google provider. Any other provider must throw
 * `ProviderNotConfiguredError` (the F7 BYO-key path will relax this).
 */
describe("getProviderClient", () => {
  it("returns a Google provider client for provider=google", () => {
    const client = getProviderClient("ws-1", "google");
    expect(typeof client).toBe("function");
  });

  it.each(["openai", "anthropic", "deepseek", "moonshot"] as const)(
    "throws ProviderNotConfiguredError for non-google provider %s",
    (provider) => {
      expect(() => getProviderClient("ws-1", provider)).toThrow(
        ProviderNotConfiguredError,
      );
    },
  );
});
