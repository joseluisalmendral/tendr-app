import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq, sql, sum } from "drizzle-orm";

import type * as schema from "@/db/schema";
import { aiUsageLedger, workspaces } from "@/db/schema";

/**
 * Monthly cost budget gate (F7 Block D / PR3; F7c finding 1).
 *
 * Sums the CURRENT UTC month's `ai_usage_ledger.cost_microcents` (USD * 10000)
 * for a workspace and compares it to `workspaces.ai_monthly_budget_cents`.
 * `assertWithinBudget` runs BEFORE each model call (adaptTemplate, summarize,
 * suggest, the Inngest extractor); on exceed it throws `BudgetExceededError`
 * (HTTP 429 semantics).
 *
 * Comparison unit (F7c): the gate compares MICRO-CENTS on both sides — the
 * ledger sum vs. `budget_cents * 10000` — so sub-cent rows are accounted exactly
 * and the boundary semantics match the prior whole-cent behavior at the 80%/100%
 * marks. The budget column stays INTEGER cents (unchanged); `usedCents` is the
 * sum rounded to the nearest cent for display only.
 *
 * Tenancy: every read carries an EXPLICIT `eq(workspaceId)` predicate as the
 * authoritative tenancy gate (the session pooler can bypass RLS). The ledger sum
 * and the budget read are both workspace-scoped.
 *
 * Month bucketing (design §7 / R7): the predicate uses
 *   `created_at >= (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC')`
 * — the inner `at time zone 'UTC'` truncates the month in the UTC calendar and
 * the outer one converts the result BACK to the timestamptz domain, so the
 * comparison against `created_at` is immune to the session TimeZone. A bare
 * `timezone('UTC', now())` RHS is `timestamp without time zone` and would be
 * re-cast using the session TZ, silently shifting the bucket at month
 * boundaries under any non-UTC session (pooler/role defaults). Matches the
 * ledger rollup index expression `date_trunc('month', created_at at time zone
 * 'UTC')` (db/schema/ai.ts). Monthly reset stays implicit (no row deletion);
 * last-month rows are excluded.
 *
 * The `db` handle is injected (first param) so the module is import-testable
 * against the real local stack without a server-only coupling — same convention
 * as getModelForFeature / getAvailableModels.
 */

/** Default monthly budget when a workspace row has no explicit value (50 EUR). */
const DEFAULT_BUDGET_CENTS = 5000;

/** Warning threshold: surface the 80% signal at or above this percentage. */
const WARNING_PERCENT = 80;

/**
 * Thrown when (used + estimated) cost reaches or exceeds the workspace budget.
 * HTTP 429 semantics — PR4a Server Actions / route handlers map it to a 429
 * response via `isBudgetExceededError`. The message is the curated, user-facing
 * Spanish string from the F7 decision record (ADR-007 error taxonomy).
 */
export class BudgetExceededError extends Error {
  readonly status = 429;
  readonly code = "budget_exceeded";

  constructor(
    message = "Budget mensual superado. Súbelo en /settings/ai.",
  ) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

/**
 * Type guard so callers (PR4a route handlers / Server Actions) can map a
 * thrown budget error to a 429 response cleanly without `instanceof` coupling
 * across module/bundle boundaries.
 */
export function isBudgetExceededError(
  error: unknown,
): error is BudgetExceededError {
  return (
    error instanceof BudgetExceededError ||
    (error instanceof Error && error.name === "BudgetExceededError")
  );
}

export interface BudgetStatus {
  /**
   * Micro-cents (USD * 10000) spent in the current UTC month. The authoritative
   * spend figure — the gate and percentage are computed from this so sub-cent
   * rows count exactly (F7c finding 1).
   */
  usedMicrocents: number;
  /**
   * Cents spent this month, rounded to the nearest cent from `usedMicrocents`.
   * For display/back-compat only; never used for the gate comparison.
   */
  usedCents: number;
  /** The workspace monthly budget in cents (default 5000). */
  budgetCents: number;
  /** Percentage of budget used (0-100+), computed from micro-cents. */
  percentUsed: number;
  /** True while the workspace is still under budget. */
  withinBudget: boolean;
  /** True at or above 80% of the budget — drives the UI warning surface. */
  warningThreshold: boolean;
}

/**
 * Computes the current UTC month's spend for a workspace versus its budget.
 * Reset is implicit (temporal filter), never by deletion.
 */
export async function getBudgetStatus(
  db: PostgresJsDatabase<typeof schema>,
  workspaceId: string,
): Promise<BudgetStatus> {
  const [usage] = await db
    .select({ total: sum(aiUsageLedger.costMicrocents) })
    .from(aiUsageLedger)
    .where(
      and(
        eq(aiUsageLedger.workspaceId, workspaceId),
        // Match the ai_usage_ledger_workspace_month_idx expression exactly.
        sql`${aiUsageLedger.createdAt} >= (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC')`,
      ),
    );

  const [ws] = await db
    .select({ budget: workspaces.aiMonthlyBudgetCents })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  const usedMicrocents = Number(usage?.total ?? 0);
  const budgetCents = ws?.budget ?? DEFAULT_BUDGET_CENTS;
  // Compare in micro-cents on both sides so sub-cent spend is exact.
  const budgetMicrocents = budgetCents * 10000;
  const percentUsed =
    budgetMicrocents > 0 ? (usedMicrocents / budgetMicrocents) * 100 : 0;

  return {
    usedMicrocents,
    usedCents: Math.round(usedMicrocents / 10000),
    budgetCents,
    percentUsed,
    withinBudget: usedMicrocents < budgetMicrocents,
    warningThreshold: percentUsed >= WARNING_PERCENT,
  };
}

/**
 * Budget gate — call BEFORE every model call. Throws `BudgetExceededError`
 * (429) when `usedCents + estimatedCostCents >= budgetCents`. Returns the
 * `BudgetStatus` on pass so callers can surface the 80% warning flag.
 *
 * `estimatedCostCents` defaults to 0: output tokens are unknown ahead of the
 * call, so the gate protects against an ALREADY-exceeded budget; the real cost
 * is billed to the ledger after completion. A single call can therefore push
 * slightly past the cap — acceptable for a soft monthly budget (design §7).
 */
export async function assertWithinBudget(
  db: PostgresJsDatabase<typeof schema>,
  workspaceId: string,
  estimatedCostCents = 0,
): Promise<BudgetStatus> {
  const status = await getBudgetStatus(db, workspaceId);
  // Compare in micro-cents so accrued sub-cent spend is counted exactly.
  const budgetMicrocents = status.budgetCents * 10000;
  if (
    status.usedMicrocents + estimatedCostCents * 10000 >=
    budgetMicrocents
  ) {
    throw new BudgetExceededError();
  }
  return status;
}
