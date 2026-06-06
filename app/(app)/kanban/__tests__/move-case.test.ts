import { execFileSync } from "node:child_process";

import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  provisionTenant,
  seedClientRow,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";

import { moveCaseStatus } from "../move-case";

/**
 * moveCase action / `move_case` SECURITY DEFINER RPC (migration 0003) exercised
 * against the REAL local Supabase stack via each tenant's user-session client
 * (RLS + the RPC's internal auth.uid() ownership gate apply; ZERO service_role
 * in the asserted path). The service client lives only in the harness for
 * provisioning/teardown (disclosed).
 *
 * Covers SPEC slice D: moveCase action with audit (Happy path, Cross-workspace
 * error) and Zod validation (invalid status → no DB touch).
 */

const LOCAL_DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** Seeds a case row in a tenant's workspace via its user session (RLS applies). */
async function seedCaseRow(
  tenant: Tenant,
  clientId: string,
  title = "Caso inicial",
): Promise<string> {
  const { data, error } = await tenant.client
    .from("cases")
    .insert({
      workspace_id: tenant.workspaceId,
      client_id: clientId,
      title,
      status: "prospect",
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`seed case failed: ${error?.message}`);
  }
  return data.id as string;
}

/** Reads a case's current status through a user client (RLS-scoped). */
async function readStatus(
  client: SupabaseClient,
  caseId: string,
): Promise<string | null> {
  const { data } = await client
    .from("cases")
    .select("status")
    .eq("id", caseId)
    .maybeSingle();
  return (data?.status as string | null) ?? null;
}

/** Counts move_case audit rows for a case id (admin/DB read — authoritative). */
function countMoveAuditRows(caseId: string): number {
  const out = execFileSync(
    "psql",
    [
      LOCAL_DB,
      "-tAc",
      `select count(*) from public.audit_log where action = 'move_case' and resource_id = '${caseId}';`,
    ],
    { encoding: "utf8" },
  );
  return Number.parseInt(out.trim(), 10);
}

describe("move_case RPC via moveCaseStatus", () => {
  let a: Tenant;
  let b: Tenant;
  let clientA: string;

  beforeAll(async () => {
    a = await provisionTenant("move-a");
    b = await provisionTenant("move-b");
    clientA = await seedClientRow(a, "Cliente A");
  });

  afterAll(async () => {
    // audit_log.actor_id → auth.users is ON DELETE NO ACTION (append-only by
    // design), so move_case traces block the user delete. Remove this run's
    // audit rows by actor_id BEFORE teardownTenants deletes the users.
    for (const t of [a, b]) {
      try {
        execFileSync(
          "psql",
          [
            LOCAL_DB,
            "-tAc",
            `delete from public.audit_log where actor_id = '${t.userId}';`,
          ],
          { encoding: "utf8" },
        );
      } catch {
        // best-effort
      }
    }
    await teardownTenants(a, b);
  });

  it("happy path: updates status AND writes one move_case audit row with from/to", async () => {
    const caseId = await seedCaseRow(a, clientA, "Caso a mover");

    const result = await moveCaseStatus(a.client, {
      caseId,
      newStatus: "active",
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.newStatus).toBe("active");

    // Status actually persisted (read through the owner's RLS-scoped client).
    expect(await readStatus(a.client, caseId)).toBe("active");

    // Exactly one audit row, action='move_case', with correct from/to metadata.
    // The owner can SELECT its own workspace's audit rows (0001 §10 policy).
    const { data: audit, error } = await a.client
      .from("audit_log")
      .select("action, actor_id, resource_type, resource_id, workspace_id, metadata")
      .eq("action", "move_case")
      .eq("resource_id", caseId);
    expect(error).toBeNull();
    expect(audit ?? []).toHaveLength(1);
    expect(audit![0].resource_type).toBe("case");
    expect(audit![0].actor_id).toBe(a.userId);
    expect(audit![0].workspace_id).toBe(a.workspaceId);
    expect(audit![0].metadata).toMatchObject({ from: "prospect", to: "active" });
  });

  it("cross-workspace: tenant B moving A's case errors, no status change, no audit row", async () => {
    const caseId = await seedCaseRow(a, clientA, "Caso de A protegido");
    const before = await readStatus(a.client, caseId);
    expect(before).toBe("prospect");

    // Tenant B attempts to move tenant A's case → the RPC's ownership gate
    // raises; the seam surfaces a clean error.
    const result = await moveCaseStatus(b.client, {
      caseId,
      newStatus: "closed_won",
    });
    expect(result.status).toBe("error");

    // No status change (verified through the real owner's client).
    expect(await readStatus(a.client, caseId)).toBe("prospect");

    // No audit row was written for this case (authoritative DB read).
    expect(countMoveAuditRows(caseId)).toBe(0);
  });

  it("invalid status: Zod rejects before any DB touch", async () => {
    const caseId = await seedCaseRow(a, clientA, "Caso estado inválido");

    const result = await moveCaseStatus(a.client, {
      caseId,
      newStatus: "archived", // not a member of the 5-value case_status enum
    });

    expect(result.status).toBe("error");

    // Untouched: still the seeded status, and no audit row created.
    expect(await readStatus(a.client, caseId)).toBe("prospect");
    expect(countMoveAuditRows(caseId)).toBe(0);
  });
});
