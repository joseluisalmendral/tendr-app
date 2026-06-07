import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  makeServiceClient,
  provisionTenant,
  seedClientRow,
  teardownTenants,
  type Tenant,
} from "./setup";

/**
 * template_adaptations — FULL deep RLS (SELECT/INSERT/UPDATE/DELETE) scoped by
 * workspace_id (migration 0005). This table holds adaptation result_text (client
 * PII derived content), so cross-tenant isolation on every verb is mandatory.
 *
 * Mirrors the clients/templates full-CRUD pattern: A can do all four verbs on
 * its own rows; A can do NONE of them on B's rows (B's row survives every
 * attempt).
 */

let a: Tenant;
let b: Tenant;
let aTemplateId: string;
let aClientId: string;
let bTemplateId: string;
let bClientId: string;
let bAdaptationId: string;

/** Seeds a template row in a tenant's workspace via its user session. */
async function seedTemplate(tenant: Tenant): Promise<string> {
  const { data, error } = await tenant.client
    .from("templates")
    .insert({
      workspace_id: tenant.workspaceId,
      name: "Propuesta",
      body_markdown: "# Hola",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seed template failed: ${error?.message}`);
  return data.id as string;
}

beforeAll(async () => {
  a = await provisionTenant("ta-a");
  b = await provisionTenant("ta-b");

  aTemplateId = await seedTemplate(a);
  aClientId = await seedClientRow(a, "A-Client");
  bTemplateId = await seedTemplate(b);
  bClientId = await seedClientRow(b, "B-Client");

  // Seed B's adaptation via service_role (RLS-bypassing) so a real cross-tenant
  // target row exists regardless of A's policies.
  const service = makeServiceClient();
  const { data, error } = await service
    .from("template_adaptations")
    .insert({
      workspace_id: b.workspaceId,
      template_id: bTemplateId,
      client_id: bClientId,
      result_text: "B-SECRET-ADAPTATION",
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`seed B adaptation failed: ${error?.message}`);
  }
  bAdaptationId = data.id as string;
});

afterAll(async () => {
  await teardownTenants(a, b);
});

describe("template_adaptations: own-workspace full CRUD", () => {
  let aAdaptationId: string;

  it("A can INSERT an adaptation in its own workspace", async () => {
    const { data, error } = await a.client
      .from("template_adaptations")
      .insert({
        workspace_id: a.workspaceId,
        template_id: aTemplateId,
        client_id: aClientId,
        result_text: "A adaptado",
        extra_instructions: "tono formal",
        provider: "google",
        model_id: "gemini-3.5-flash",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    aAdaptationId = data!.id as string;
  });

  it("A can SELECT its own adaptation", async () => {
    const { data, error } = await a.client
      .from("template_adaptations")
      .select("id, result_text")
      .eq("id", aAdaptationId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1);
    expect(data![0].result_text).toBe("A adaptado");
  });

  it("A can UPDATE its own adaptation", async () => {
    const { data } = await a.client
      .from("template_adaptations")
      .update({ result_text: "A adaptado v2" })
      .eq("id", aAdaptationId)
      .select("id");
    expect(data ?? []).toHaveLength(1);
  });

  it("A can DELETE its own adaptation", async () => {
    const { data } = await a.client
      .from("template_adaptations")
      .delete()
      .eq("id", aAdaptationId)
      .select("id");
    expect(data ?? []).toHaveLength(1);
  });
});

describe("template_adaptations: cross-tenant isolation (all verbs denied)", () => {
  it("A sees 0 of B's adaptations", async () => {
    const { data, error } = await a.client
      .from("template_adaptations")
      .select("id")
      .eq("workspace_id", b.workspaceId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("A cannot INSERT into B's workspace (WITH CHECK rejects)", async () => {
    const { error } = await a.client.from("template_adaptations").insert({
      workspace_id: b.workspaceId,
      template_id: bTemplateId,
      client_id: bClientId,
      result_text: "intruder",
    });
    expect(error).not.toBeNull();
  });

  it("A's UPDATE of B's adaptation changes 0 rows", async () => {
    const { data } = await a.client
      .from("template_adaptations")
      .update({ result_text: "hijacked" })
      .eq("id", bAdaptationId)
      .select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("A's DELETE of B's adaptation removes 0 rows (B's row survives)", async () => {
    const { data } = await a.client
      .from("template_adaptations")
      .delete()
      .eq("id", bAdaptationId)
      .select("id");
    expect(data ?? []).toHaveLength(0);

    // Confirm via service_role that B's row still exists intact.
    const service = makeServiceClient();
    const { data: still } = await service
      .from("template_adaptations")
      .select("id, result_text")
      .eq("id", bAdaptationId);
    expect(still ?? []).toHaveLength(1);
    expect(still![0].result_text).toBe("B-SECRET-ADAPTATION");
  });
});
