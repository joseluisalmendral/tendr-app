import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  makeAnonClient,
  provisionTenant,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";

/**
 * Layout guard seam (SPEC: Authenticated route group gate).
 *
 * The (app) layout calls requireSession() -> getCurrentWorkspace(); on null it
 * redirect('/login'). getCurrentWorkspace is RSC-coupled (next/headers), so we
 * exercise its exact decision contract against the real local stack instead of
 * rendering the RSC:
 *   1. A provisioned, signed-in tenant resolves a user + a workspace
 *      (id + name) — getCurrentWorkspace would return a non-null session, so
 *      the layout renders.
 *   2. An anonymous client with NO session has no user — getCurrentWorkspace
 *      returns null, so the layout would redirect to /login.
 */
describe("(app) layout session guard", () => {
  let tenant: Tenant;

  beforeAll(async () => {
    tenant = await provisionTenant("layout");
  });

  afterAll(async () => {
    await teardownTenants(tenant);
  });

  it("resolves the user and workspace name for an authenticated session", async () => {
    const {
      data: { user },
    } = await tenant.client.auth.getUser();
    expect(user?.id).toBe(tenant.userId);

    // Mirrors getCurrentWorkspace's select('id, name').eq('owner_id', uid).
    const { data: workspace, error } = await tenant.client
      .from("workspaces")
      .select("id, name")
      .eq("owner_id", tenant.userId)
      .maybeSingle();

    expect(error).toBeNull();
    expect(workspace?.id).toBe(tenant.workspaceId);
    expect(workspace?.name).toBe("WS-layout");
  });

  it("resolves no user for an anonymous client with no session (layout redirects)", async () => {
    const anon = makeAnonClient();
    const {
      data: { user },
    } = await anon.auth.getUser();

    // No session -> getCurrentWorkspace returns null -> redirect('/login').
    expect(user).toBeNull();
  });
});
