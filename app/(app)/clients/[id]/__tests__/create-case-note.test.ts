import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  provisionTenant,
  seedClientRow,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";

import { createCaseInWorkspace } from "../create-case";
import { createNoteInWorkspace, NOTE_BODY_MAX_LENGTH } from "../create-note";

/**
 * createCase / createNote actions — pure logic exercised against the REAL local
 * Supabase stack via each tenant's user-session client (RLS applies; ZERO
 * service_role in the asserted path). The service client lives only in the test
 * harness for provisioning/teardown (disclosed).
 *
 * Covers SPEC: createCase action (Happy + RLS) and createNote action with
 * markdown (Happy path, Max length).
 */
describe("createCaseInWorkspace", () => {
  let a: Tenant;
  let b: Tenant;
  let clientA: string;

  beforeAll(async () => {
    a = await provisionTenant("cases-a");
    b = await provisionTenant("cases-b");
    clientA = await seedClientRow(a, "Cliente A");
  });

  afterAll(async () => {
    await teardownTenants(a, b);
  });

  it("happy path: inserts the case and returns it, visible to its tenant", async () => {
    const result = await createCaseInWorkspace(a.client, a.workspaceId, {
      clientId: clientA,
      title: "Rediseño de marca",
      status: "proposal",
      valueCents: "150000",
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") return;

    expect(result.case.title).toBe("Rediseño de marca");
    expect(result.case.status).toBe("proposal");
    expect(result.case.valueCents).toBe(150000);

    // The row is visible to its own tenant through the RLS SELECT policy.
    const { data, error } = await a.client
      .from("cases")
      .select("id, title")
      .eq("id", result.case.id)
      .single();
    expect(error).toBeNull();
    expect(data?.title).toBe("Rediseño de marca");
  });

  it("cross-tenant isolation: tenant B cannot see tenant A's case", async () => {
    const created = await createCaseInWorkspace(a.client, a.workspaceId, {
      clientId: clientA,
      title: "Caso-solo-de-A",
      status: "active",
      valueCents: null,
    });
    expect(created.status).toBe("success");
    if (created.status !== "success") return;

    // Tenant B queries A's case id directly — RLS returns zero rows.
    const { data, error } = await b.client
      .from("cases")
      .select("id")
      .eq("id", created.case.id);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});

describe("createNoteInWorkspace", () => {
  let a: Tenant;
  let clientA: string;

  beforeAll(async () => {
    a = await provisionTenant("notes-a");
    clientA = await seedClientRow(a, "Cliente Notas");
  });

  afterAll(async () => {
    await teardownTenants(a);
  });

  it("happy path: persists a markdown note and returns it", async () => {
    const result = await createNoteInWorkspace(a.client, a.workspaceId, {
      clientId: clientA,
      body: "Reunión inicial. **Pendiente**: enviar propuesta.",
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") return;

    expect(result.note.body).toBe(
      "Reunión inicial. **Pendiente**: enviar propuesta.",
    );

    // The note is visible to its own tenant through the RLS SELECT policy.
    const { data, error } = await a.client
      .from("notes")
      .select("id, body")
      .eq("id", result.note.id)
      .single();
    expect(error).toBeNull();
    expect(data?.body).toBe(
      "Reunión inicial. **Pendiente**: enviar propuesta.",
    );
  });

  it("over-length body returns a field-level Zod error and inserts NO row", async () => {
    const tooLong = "x".repeat(NOTE_BODY_MAX_LENGTH + 1);

    // Count existing notes BEFORE the rejected call.
    const { data: before } = await a.client.from("notes").select("id");
    const beforeCount = before?.length ?? 0;

    const result = await createNoteInWorkspace(a.client, a.workspaceId, {
      clientId: clientA,
      body: tooLong,
    });

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.fieldErrors?.body).toBeDefined();

    // No DB row was created (validation ran BEFORE any DB call).
    const { data: after } = await a.client.from("notes").select("id");
    expect(after?.length ?? 0).toBe(beforeCount);
  });
});
