import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { provisionTenant, teardownTenants, type Tenant } from "./setup";

/**
 * UPDATE-without-SELECT gotcha coverage.
 *
 * For every UPDATE-bearing table: an UPDATE of a NON-visible (other-tenant)
 * row returns 0 rows silently (USING gating), AND a workspace_id/owner_id
 * reassignment to a foreign workspace is rejected by WITH CHECK.
 */

let a: Tenant;
let b: Tenant;

beforeAll(async () => {
  a = await provisionTenant("gotcha-a");
  b = await provisionTenant("gotcha-b");
});

afterAll(async () => {
  await teardownTenants(a, b);
});

describe("workspaces UPDATE gotcha", () => {
  it("A cannot UPDATE B's workspace (USING gates to 0 rows)", async () => {
    const { data } = await a.client
      .from("workspaces")
      .update({ name: "stolen" })
      .eq("id", b.workspaceId)
      .select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("A cannot reassign its workspace owner_id to B (WITH CHECK rejects)", async () => {
    const { data, error } = await a.client
      .from("workspaces")
      .update({ owner_id: b.userId })
      .eq("id", a.workspaceId)
      .select("id");
    // Either an explicit policy violation, or 0 rows changed — never success.
    if (error) {
      expect(error).not.toBeNull();
    } else {
      expect(data ?? []).toHaveLength(0);
    }
  });
});

describe("child-table UPDATE gotcha (clients)", () => {
  let aClientId: string;

  beforeAll(async () => {
    const { data } = await a.client
      .from("clients")
      .insert({ workspace_id: a.workspaceId, name: "A-Client" })
      .select("id")
      .single();
    aClientId = data!.id as string;
  });

  it("A cannot UPDATE a client in B's workspace (0 rows via USING)", async () => {
    // Create a B client to target.
    const { data: bClient } = await b.client
      .from("clients")
      .insert({ workspace_id: b.workspaceId, name: "B-Client" })
      .select("id")
      .single();

    const { data } = await a.client
      .from("clients")
      .update({ name: "stolen" })
      .eq("id", bClient!.id)
      .select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("A cannot reassign its client's workspace_id to B (WITH CHECK rejects)", async () => {
    const { data, error } = await a.client
      .from("clients")
      .update({ workspace_id: b.workspaceId })
      .eq("id", aClientId)
      .select("id");
    if (error) {
      expect(error).not.toBeNull();
    } else {
      expect(data ?? []).toHaveLength(0);
    }
  });
});
