import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveCurrentWorkspace } from "@/lib/auth/resolve-current-workspace";
import {
  makeAnonClient,
  provisionTenant,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";

/**
 * Layout guard seam (SPEC: Authenticated route group gate).
 *
 * The (app) layout calls requireSession() -> getCurrentWorkspace(), which
 * delegates to the pure `resolveCurrentWorkspace(client)` decision logic and
 * redirect('/login') on null. getCurrentWorkspace itself is RSC-coupled (it
 * imports server-only and injects the cookie-bound `next/headers` client), so
 * we exercise the REAL exported decision logic — resolveCurrentWorkspace — by
 * injecting real local-stack session clients. A regression in the actual
 * select/predicate/null-handling is now caught, not a hand-mirrored copy.
 *   1. A provisioned, signed-in tenant resolves a non-null CurrentWorkspace
 *      (user + workspace id + name) — the layout renders.
 *   2. A real anonymous session (anon sign-in) resolves a non-null
 *      CurrentWorkspace flagged isAnonymous with no workspace yet — the layout
 *      renders for anonymous users (design §0: anon allowed in).
 *   3. A client with NO session resolves null — the layout redirects to /login.
 */
describe("(app) layout session guard", () => {
  let tenant: Tenant;

  beforeAll(async () => {
    tenant = await provisionTenant("layout");
  });

  afterAll(async () => {
    await teardownTenants(tenant);
  });

  it("resolves the real CurrentWorkspace for an authenticated session", async () => {
    // Exercises the REAL resolveCurrentWorkspace export end-to-end against the
    // local stack: auth.getUser() + the workspaces select('id, name') query.
    const result = await resolveCurrentWorkspace(tenant.client);

    expect(result).not.toBeNull();
    expect(result?.user.id).toBe(tenant.userId);
    expect(result?.workspaceId).toBe(tenant.workspaceId);
    expect(result?.workspaceName).toBe("WS-layout");
    expect(result?.isAnonymous).toBe(false);
  });

  it("resolves a non-null anonymous session (layout renders, design §0)", async () => {
    // Real anonymous sign-in via the local stack — not a trivially-null check.
    // The gate decision for an authenticated-but-anonymous user is "render".
    const anon = makeAnonClient();
    const { data, error } = await anon.auth.signInAnonymously();
    expect(error).toBeNull();
    const anonUserId = data.user?.id;
    expect(anonUserId).toBeTruthy();

    try {
      const result = await resolveCurrentWorkspace(anon);

      expect(result).not.toBeNull();
      expect(result?.user.id).toBe(anonUserId);
      expect(result?.isAnonymous).toBe(true);
      // No workspace created yet for a brand-new anon session.
      expect(result?.workspaceId).toBeNull();
      expect(result?.workspaceName).toBeNull();
    } finally {
      await anon.auth.signOut();
    }
  });

  it("resolves null for a client with no session (layout redirects to /login)", async () => {
    // The real null branch of the gate: no authenticated user -> redirect.
    const anon = makeAnonClient();
    const result = await resolveCurrentWorkspace(anon);

    expect(result).toBeNull();
  });

  it("sees a just-provisioned workspace on a fresh resolve (dashboard one-request fix)", async () => {
    // Regression guard for the blank-dashboard bug: the dashboard provisions a
    // workspace for a fresh anonymous visitor and must render it in ONE request.
    // getCurrentWorkspace() is React.cache()'d, so re-reading it post-provision
    // returns the stale (workspaceId === null) value. The fix re-reads through
    // the UNCACHED resolver seam. This asserts that contract: a fresh
    // resolveCurrentWorkspace() on the same session sees the new workspace.
    const anon = makeAnonClient();
    const { data, error } = await anon.auth.signInAnonymously();
    expect(error).toBeNull();
    const anonUserId = data.user?.id;
    expect(anonUserId).toBeTruthy();

    try {
      // Pre-provision: no workspace yet (mirrors the dashboard's first read).
      const before = await resolveCurrentWorkspace(anon);
      expect(before?.workspaceId).toBeNull();

      // Provision under the same session, exactly as ensureAnonymousWorkspace.
      const { error: upsertError } = await anon.from("workspaces").upsert(
        { owner_id: anonUserId, name: "Mi workspace" },
        { onConflict: "owner_id", ignoreDuplicates: true },
      );
      expect(upsertError).toBeNull();

      // Fresh resolve (the uncached seam) now sees the workspace.
      const after = await resolveCurrentWorkspace(anon);
      expect(after?.workspaceId).not.toBeNull();
      expect(after?.workspaceName).toBe("Mi workspace");
    } finally {
      await anon.auth.signOut();
    }
  });
});
