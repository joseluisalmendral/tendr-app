import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  provisionTenant,
  seedClientRow,
  teardownTenants,
  type Tenant,
} from "./setup";

/**
 * Cross-tenant isolation: User A must neither SEE nor WRITE User B's data.
 */

let a: Tenant;
let b: Tenant;
let bClientId: string;

const WS_SCOPED_TABLES = [
  "clients",
  "cases",
  "notes",
  "documents",
  "templates",
  "template_adaptations",
  "jobs",
  "subscriptions",
  "audit_log",
  "ai_provider_configs",
  "ai_feature_model_mapping",
  "ai_usage_ledger",
] as const;

beforeAll(async () => {
  a = await provisionTenant("a");
  b = await provisionTenant("b");
  bClientId = await seedClientRow(b, "B-Client");
});

afterAll(async () => {
  await teardownTenants(a, b);
});

describe("cross-tenant SELECT isolation", () => {
  it("A sees 0 of B's rows on every workspace-scoped table", async () => {
    for (const table of WS_SCOPED_TABLES) {
      // Select only workspace_id (an always-readable column) so this isolation
      // check does not collide with the M6 column REVOKE on
      // ai_provider_configs — that secrecy is asserted in rls-columns.test.ts.
      const { data, error } = await a.client
        .from(table)
        .select("workspace_id")
        .eq("workspace_id", b.workspaceId);
      // No error (policy short-circuits cleanly), just zero rows.
      expect(error, `table ${table}`).toBeNull();
      expect(data ?? [], `table ${table}`).toHaveLength(0);
    }
  });

  it("A cannot SELECT B's workspace row", async () => {
    const { data, error } = await a.client
      .from("workspaces")
      .select("id")
      .eq("id", b.workspaceId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});

describe("cross-tenant write isolation", () => {
  it("A cannot INSERT into B's workspace", async () => {
    const { error } = await a.client
      .from("clients")
      .insert({ workspace_id: b.workspaceId, name: "intruder" });
    // WITH CHECK rejects the insert.
    expect(error).not.toBeNull();
  });

  it("A's UPDATE of B's client changes 0 rows", async () => {
    const { data } = await a.client
      .from("clients")
      .update({ name: "hijacked" })
      .eq("id", bClientId)
      .select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("A's DELETE of B's client removes 0 rows (B's row survives)", async () => {
    const { data } = await a.client
      .from("clients")
      .delete()
      .eq("id", bClientId)
      .select("id");
    expect(data ?? []).toHaveLength(0);

    // Confirm via B's own session that the row still exists.
    const { data: still } = await b.client
      .from("clients")
      .select("id")
      .eq("id", bClientId);
    expect(still ?? []).toHaveLength(1);
  });
});
