import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { db } from "@/db";
import type * as schema from "@/db/schema";
import { subscriptions } from "@/db/schema";

/**
 * F8 plan gate — entitlement check for PAID features (summarize, suggest,
 * adaptTemplate, extract_document).
 *
 * SECURITY-CRITICAL: this gates revenue. A bypass leaks a paid feature; a
 * false-deny blocks a paying customer. The logic is therefore FAIL-CLOSED: any
 * subscription state that is not provably an active, unexpired paid plan
 * collapses to "free". The ONLY thing that throws `PlanGateError` is a genuine
 * entitlement denial — an infrastructure error (the DB read rejecting) MUST
 * propagate UNCHANGED so a transient outage never silently grants access nor
 * masquerades as "upgrade required".
 *
 * `requirePlanWith` is the pure seam (db injected): `@/db` in the
 * Server-Action / Route paths, the service-role `serviceDb` in the Inngest
 * job. Both Drizzle clients connect as the DB owner/superuser and do NOT
 * enforce RLS at the SQL layer (see db/index.ts); tenant isolation here rests
 * on the server-resolved `workspaceId` + the explicit `eq(workspace_id)` filter
 * below, never on RLS. `requirePlan` is the thin wrapper over `@/db`.
 *
 * `subscriptions.workspace_id` is UNIQUE, so a workspace has at most one row;
 * absence of a row means Free (the schema default and the documented contract).
 */

export type Plan = "free" | "pro" | "team";

/**
 * Thrown ONLY for an entitlement denial (caller's effective plan is below the
 * required minimum). Carries a 403 so the route path can map it to an HTTP
 * status. NEVER thrown for an infrastructure/DB error.
 */
export class PlanGateError extends Error {
  readonly status: number;

  constructor(status = 403, message = "upgrade required") {
    super(message);
    this.status = status;
    this.name = "PlanGateError";
  }
}

export interface PlanGateResult {
  /** The caller's effective plan (after the active/expiry collapse to free). */
  plan: Plan;
  /** The subscription's current_period_end as stored, or null when absent. */
  validUntil: Date | null;
}

/** Plan ranking: a higher rank entitles every feature of the lower ranks. */
const RANK: Record<Plan, number> = { free: 0, pro: 1, team: 2 };

/**
 * Pure seam — `db` is injected (RLS `@/db` in actions/route; `serviceDb` in
 * Inngest). Resolves the caller's effective plan and throws `PlanGateError`
 * when it is below `minimumPlan`.
 *
 * The `db.select(...)` is intentionally NOT wrapped in a try/catch: a rejected
 * read is an infrastructure failure and MUST propagate to the caller unchanged
 * (it must never be swallowed, never grant access, never become a 403 gate).
 */
export async function requirePlanWith(
  db: PostgresJsDatabase<typeof schema>,
  workspaceId: string,
  minimumPlan: "pro" | "team",
): Promise<PlanGateResult> {
  const [row] = await db
    .select({
      plan: subscriptions.plan,
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId))
    .limit(1);

  // FAIL-CLOSED effective plan: a row is honored ONLY when it is an active,
  // non-null, unexpired paid period. No row, a non-"active" status, a null
  // period, OR an expired period ALL collapse to "free".
  const active =
    !!row &&
    row.status === "active" &&
    row.currentPeriodEnd != null &&
    row.currentPeriodEnd.getTime() > Date.now();
  const effective: Plan = active ? row.plan : "free";

  if (RANK[effective] < RANK[minimumPlan]) {
    throw new PlanGateError(403, "upgrade required");
  }

  return { plan: effective, validUntil: row?.currentPeriodEnd ?? null };
}

/**
 * Thin wrapper for the Server-Action / Route path — uses `@/db`. The caller
 * MUST pass a server-resolved `workspaceId` (never a client-supplied one): the
 * `eq(workspace_id)` filter in the seam is the actual tenant boundary here,
 * since `@/db` does not enforce RLS (owner/superuser connection — see db/index.ts).
 */
export async function requirePlan(
  workspaceId: string,
  minimumPlan: "pro" | "team",
): Promise<PlanGateResult> {
  return requirePlanWith(db, workspaceId, minimumPlan);
}
