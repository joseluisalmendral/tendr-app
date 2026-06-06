import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  provisionTenant,
  seedClientRow,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";

/**
 * Dashboard counts (SPEC: Dashboard home — Counts over seed).
 *
 * Seeds a known set of clients + cases across ALL 5 statuses for tenant A,
 * then asserts getDashboardCounts returns the correct per-bucket totals,
 * INCLUDING the closed_won + closed_lost -> "Cerrados" collapse.
 *
 * getDashboardCounts uses the Drizzle reads-only client, which connects via
 * DATABASE_URL. We point it at the local session-port DB before importing the
 * module (the module reads the env at load time).
 */
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

describe("getDashboardCounts", () => {
  let tenant: Tenant;
  let getDashboardCounts: (typeof import("../dashboard-data"))["getDashboardCounts"];

  beforeAll(async () => {
    ({ getDashboardCounts } = await import("../dashboard-data"));

    tenant = await provisionTenant("dashboard");

    // 3 clients.
    const clientId = await seedClientRow(tenant, "Acme");
    await seedClientRow(tenant, "Globex");
    await seedClientRow(tenant, "Initech");

    // Cases across all 5 statuses, with a known per-status distribution:
    // prospect x2, proposal x1, active x3, closed_won x2, closed_lost x1.
    const rows = [
      ...Array(2).fill("prospect"),
      ...Array(1).fill("proposal"),
      ...Array(3).fill("active"),
      ...Array(2).fill("closed_won"),
      ...Array(1).fill("closed_lost"),
    ].map((status, i) => ({
      workspace_id: tenant.workspaceId,
      client_id: clientId,
      title: `Case ${i}`,
      status,
    }));

    const { error } = await tenant.client.from("cases").insert(rows);
    if (error) throw new Error(`seed cases failed: ${error.message}`);
  });

  afterAll(async () => {
    await teardownTenants(tenant);
  });

  it("returns correct client count and collapsed case buckets", async () => {
    const counts = await getDashboardCounts(tenant.workspaceId);

    expect(counts.clientCount).toBe(3);
    expect(counts.totalCases).toBe(9);
    expect(counts.caseBuckets).toEqual({
      prospect: 2,
      proposal: 1,
      active: 3,
      // closed_won (2) + closed_lost (1) collapsed into "Cerrados".
      closed: 3,
    });
  });

  it("scopes counts to the workspace filter (other workspaces excluded)", async () => {
    const other = await provisionTenant("dashboard-other");
    try {
      await seedClientRow(other, "Foreign");
      const counts = await getDashboardCounts(other.workspaceId);
      // Only this workspace's single client; none of tenant A's rows leak in.
      expect(counts.clientCount).toBe(1);
      expect(counts.totalCases).toBe(0);
    } finally {
      await teardownTenants(other);
    }
  });
});
