import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Auth middleware (lib/supabase/middleware.ts `updateSession`, wired through the
 * Next 16 proxy.ts entry) machine-to-machine pass-through (SPEC: F6 async
 * extraction HTTP boundary must be reachable; verify C-G4-1 / coverage gap
 * W-G4-2).
 *
 * Regression guard for C-G4-1: every /api/* request without a Supabase session
 * was hard-401'd, including /api/inngest. Inngest (dev server AND Cloud) calls
 * /api/inngest machine-to-machine with NO session cookie, so register (GET/PUT)
 * and event invocation (POST) were blocked, making the pipeline unreachable.
 *
 * The machine-to-machine bypass (/api/webhooks, /api/inngest) returns BEFORE
 * createServerClient is ever called, so those cases need no Supabase mock. The
 * control case (a non-bypassed /api/* path with no session) DOES build the
 * client and call getClaims(); we mock @supabase/ssr so getClaims() reports a
 * clean "no session, no error" state, which must fail closed with a 401.
 */

const getClaimsMock = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getClaims: getClaimsMock,
      // updateSession only calls signInAnonymously on PAGE routes; API routes
      // never reach it. Provide a stub so the contract stays explicit.
      signInAnonymously: vi.fn(async () => ({ error: null })),
    },
  }),
}));

// updateSession reads these at call time inside createServerClient args; the
// mock ignores them, but they must be defined so the (mocked) factory call does
// not throw on the non-null assertions.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "test-anon-key";

// Imported AFTER the mock is registered so the module under test binds to the
// mocked @supabase/ssr.
const { updateSession } = await import("../middleware");

/**
 * Minimal NextRequest stand-in. updateSession only reads `nextUrl.pathname`,
 * `url`, and `cookies.getAll()` — never the full Next request surface.
 */
function makeRequest(pathname: string, method: string): NextRequest {
  const url = `http://localhost:3000${pathname}`;
  return {
    method,
    url,
    nextUrl: new URL(url),
    cookies: {
      getAll: () => [],
      set: () => undefined,
    },
  } as unknown as NextRequest;
}

describe("updateSession — machine-to-machine API bypass", () => {
  beforeEach(() => {
    // Default: a clean "no session, no verification error" state. The control
    // path must still 401 on this; the bypass paths must never reach it.
    getClaimsMock.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    getClaimsMock.mockReset();
  });

  // C-G4-1: Inngest register/sync/invoke must pass through, NOT 401. The bypass
  // returns before any Supabase client is built, so getClaims must never run.
  it.each(["GET", "PUT", "POST"])(
    "lets %s /api/inngest reach the handler without a session (no 401)",
    async (method) => {
      const response = await updateSession(makeRequest("/api/inngest", method));

      expect(response.status).not.toBe(401);
      expect(getClaimsMock).not.toHaveBeenCalled();
    },
  );

  // Pre-existing machine-to-machine bypass must keep working unchanged.
  it.each(["GET", "POST"])(
    "lets %s /api/webhooks/stripe pass through without a session (no 401)",
    async (method) => {
      const response = await updateSession(
        makeRequest("/api/webhooks/stripe", method),
      );

      expect(response.status).not.toBe(401);
      expect(getClaimsMock).not.toHaveBeenCalled();
    },
  );

  // Control: a non-bypassed API route with NO session MUST still fail closed.
  // This proves the bypass is scoped to machine-to-machine endpoints only and
  // did not loosen auth for the rest of /api/*.
  it.each(["GET", "PUT", "POST"])(
    "still 401s %s /api/clients/export when there is no session",
    async (method) => {
      const response = await updateSession(
        makeRequest("/api/clients/export", method),
      );

      expect(response.status).toBe(401);
      expect(getClaimsMock).toHaveBeenCalled();
      await expect(response.json()).resolves.toEqual({
        error: "Unauthorized",
      });
    },
  );

  // A near-miss path that merely starts with the bypass prefix but is NOT the
  // exact Inngest endpoint must NOT be bypassed (the Inngest check is an exact
  // pathname match by design).
  it("does NOT bypass /api/inngest-not-real (exact match only)", async () => {
    const response = await updateSession(
      makeRequest("/api/inngest-not-real", "GET"),
    );

    expect(response.status).toBe(401);
    expect(getClaimsMock).toHaveBeenCalled();
  });
});
