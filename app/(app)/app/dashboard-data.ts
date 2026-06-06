import { count, eq } from "drizzle-orm";

import { db } from "@/db";
import { cases, clients } from "@/db/schema/crm";

/**
 * The 4 dashboard display buckets. The DB has 5 case statuses; closed_won and
 * closed_lost are collapsed into a single "closed" bucket for the dashboard
 * (the kanban board keeps all 5 columns).
 *
 * NOTE: this module is intentionally free of `server-only` and the Supabase
 * server client so the count queries stay unit-testable against the local
 * stack (the test imports getDashboardCounts directly). Recent-activity,
 * which needs the user-JWT Supabase client, lives in dashboard-activity.ts.
 */
export type CaseBuckets = {
  prospect: number;
  proposal: number;
  active: number;
  /** closed_won + closed_lost collapsed. Rendered as "Cerrados". */
  closed: number;
};

export type DashboardCounts = {
  clientCount: number;
  caseBuckets: CaseBuckets;
  totalCases: number;
};

/**
 * Reads dashboard counts via SQL aggregation (no row over-fetch). Both reads
 * carry an explicit workspace_id filter — Drizzle is reads-only and is NOT the
 * tenant boundary (see design ADR-D2), so the filter is mandatory.
 *
 * Runs both queries in parallel. The grouped case query returns one row per
 * present status; absent statuses default to 0 in the collapsed buckets.
 */
export async function getDashboardCounts(
  workspaceId: string,
): Promise<DashboardCounts> {
  const [clientRows, caseRows] = await Promise.all([
    db
      .select({ value: count() })
      .from(clients)
      .where(eq(clients.workspaceId, workspaceId)),
    db
      .select({ status: cases.status, value: count() })
      .from(cases)
      .where(eq(cases.workspaceId, workspaceId))
      .groupBy(cases.status),
  ]);

  const caseBuckets: CaseBuckets = {
    prospect: 0,
    proposal: 0,
    active: 0,
    closed: 0,
  };
  let totalCases = 0;

  for (const row of caseRows) {
    const n = Number(row.value);
    totalCases += n;
    switch (row.status) {
      case "prospect":
        caseBuckets.prospect += n;
        break;
      case "proposal":
        caseBuckets.proposal += n;
        break;
      case "active":
        caseBuckets.active += n;
        break;
      case "closed_won":
      case "closed_lost":
        caseBuckets.closed += n;
        break;
      default:
        break;
    }
  }

  return {
    clientCount: Number(clientRows[0]?.value ?? 0),
    caseBuckets,
    totalCases,
  };
}
