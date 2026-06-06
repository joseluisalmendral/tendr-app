import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  provisionTenant,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";

import { createClientInWorkspace } from "../create-client";

/**
 * createClient action — pure logic exercised against the REAL local Supabase
 * stack via each tenant's user-session client (RLS applies; ZERO service_role
 * in the asserted path). The service client lives only in the test harness for
 * provisioning/teardown (disclosed).
 *
 * Covers SPEC: createClient action (Happy path, Invalid email) and Cross-tenant
 * isolation.
 */
describe("createClientInWorkspace", () => {
  let a: Tenant;
  let b: Tenant;

  beforeAll(async () => {
    a = await provisionTenant("clients-a");
    b = await provisionTenant("clients-b");
  });

  afterAll(async () => {
    await teardownTenants(a, b);
  });

  it("happy path: inserts the client and returns it, visible to its tenant", async () => {
    const result = await createClientInWorkspace(a.client, a.workspaceId, {
      name: "Acme Corp",
      email: "hola@acme.test",
      company: "Acme",
      tags: "vip, recurrente",
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") return;

    expect(result.client.name).toBe("Acme Corp");
    expect(result.client.email).toBe("hola@acme.test");
    expect(result.client.company).toBe("Acme");
    expect(result.client.tags).toEqual(["vip", "recurrente"]);
    expect(result.client.status).toBe("active");

    // The row is visible to its own tenant through the RLS SELECT policy.
    const { data, error } = await a.client
      .from("clients")
      .select("id, name")
      .eq("id", result.client.id)
      .single();
    expect(error).toBeNull();
    expect(data?.name).toBe("Acme Corp");
  });

  it("invalid email returns a field-level Zod error and inserts NO row", async () => {
    const result = await createClientInWorkspace(a.client, a.workspaceId, {
      name: "Bad Email Co",
      email: "not-an-email",
      company: null,
      tags: null,
    });

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.fieldErrors?.email).toBe("Ingresá un email válido.");

    // No DB row was created for this name (validation ran BEFORE any DB call).
    const { data } = await a.client
      .from("clients")
      .select("id")
      .eq("name", "Bad Email Co");
    expect(data ?? []).toHaveLength(0);
  });

  it("cross-tenant isolation: tenant B cannot see tenant A's client", async () => {
    const created = await createClientInWorkspace(a.client, a.workspaceId, {
      name: "Tenant-A-Only",
      email: null,
      company: null,
      tags: null,
    });
    expect(created.status).toBe("success");
    if (created.status !== "success") return;

    // Tenant B queries A's row id directly — RLS returns zero rows.
    const { data, error } = await b.client
      .from("clients")
      .select("id")
      .eq("id", created.client.id);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});
