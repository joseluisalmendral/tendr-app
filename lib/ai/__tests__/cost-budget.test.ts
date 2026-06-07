import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { aiUsageLedger, workspaces } from "@/db/schema";
import { serviceDb } from "@/db/service";
import {
  provisionTenant,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";
import {
  assertWithinBudget,
  BudgetExceededError,
  getBudgetStatus,
  isBudgetExceededError,
} from "@/lib/ai/cost-budget";

/**
 * cost-budget exercised against the REAL local Supabase stack and REAL ledger
 * rows. Covers SPEC requirement D1 (Monthly cost budget):
 *   - 50% of budget -> assertWithinBudget passes, no warning
 *   - 99% of budget -> passes AND the 80% warning flag is active
 *   - 101% of budget -> throws BudgetExceededError (429) before any model call
 *   - last-month rows are EXCLUDED from the current UTC month sum
 *   - estimatedCostCents default (0) gates against the already-accrued spend
 *   - cross-workspace isolation: another tenant's spend never counts
 *
 * The workspace budget is set to a known value via serviceDb so the percentage
 * thresholds are deterministic. Ledger rows are inserted with explicit
 * cost_cents and (for the exclusion test) a back-dated created_at.
 *
 * Requires the local stack running. DATABASE_URL must be exported.
 */
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const BUDGET_CENTS = 10_000; // 100 EUR — round number for clean percentages.

let tenant: Tenant;

/** Inserts a ledger row this UTC month with the given cost (serviceDb). */
async function seedUsage(
  workspaceId: string,
  costCents: number,
): Promise<void> {
  await serviceDb.insert(aiUsageLedger).values({
    workspaceId,
    feature: "summarize",
    provider: "google",
    modelId: "gemini-3.5-flash",
    tokensIn: 100,
    tokensOut: 50,
    costCents,
    // F7c: the gate sums micro-cents. Whole-cent helpers dual-write the exact
    // micro-cents equivalent so the existing percentage assertions hold.
    costMicrocents: costCents * 10000,
  });
}

/** Inserts a ledger row this UTC month billing exact micro-cents (serviceDb). */
async function seedUsageMicrocents(
  workspaceId: string,
  costMicrocents: number,
): Promise<void> {
  await serviceDb.insert(aiUsageLedger).values({
    workspaceId,
    feature: "summarize",
    provider: "google",
    modelId: "gemini-3.5-flash",
    tokensIn: 100,
    tokensOut: 50,
    costCents: Math.round(costMicrocents / 10000),
    costMicrocents,
  });
}

/** Inserts a ledger row dated in the PREVIOUS month (serviceDb). */
async function seedLastMonthUsage(
  workspaceId: string,
  costCents: number,
): Promise<void> {
  const [row] = await serviceDb
    .insert(aiUsageLedger)
    .values({
      workspaceId,
      feature: "summarize",
      provider: "google",
      modelId: "gemini-3.5-flash",
      tokensIn: 100,
      tokensOut: 50,
      costCents,
      costMicrocents: costCents * 10000,
    })
    .returning({ id: aiUsageLedger.id });

  // Back-date into the previous month so it falls OUTSIDE the current UTC
  // month bucket. `created_at` is not user-updatable, so use serviceDb.
  await serviceDb
    .update(aiUsageLedger)
    .set({
      createdAt: sql`date_trunc('month', timezone('UTC', now())) - interval '10 days'`,
    })
    .where(eq(aiUsageLedger.id, row.id));
}

/** Sets the workspace monthly budget to a known value (serviceDb). */
async function setBudget(
  workspaceId: string,
  budgetCents: number,
): Promise<void> {
  await serviceDb
    .update(workspaces)
    .set({ aiMonthlyBudgetCents: budgetCents })
    .where(eq(workspaces.id, workspaceId));
}

beforeAll(async () => {
  tenant = await provisionTenant("cost-budget");
  await setBudget(tenant.workspaceId, BUDGET_CENTS);
});

afterAll(async () => {
  await teardownTenants(tenant);
});

afterEach(async () => {
  await serviceDb
    .delete(aiUsageLedger)
    .where(eq(aiUsageLedger.workspaceId, tenant.workspaceId));
});

describe("getBudgetStatus", () => {
  it("reports the current-month spend, percentage, and within-budget flag", async () => {
    await seedUsage(tenant.workspaceId, 5_000); // 50%

    const status = await getBudgetStatus(db, tenant.workspaceId);

    expect(status.usedCents).toBe(5_000);
    expect(status.budgetCents).toBe(BUDGET_CENTS);
    expect(status.percentUsed).toBe(50);
    expect(status.withinBudget).toBe(true);
    expect(status.warningThreshold).toBe(false);
  });

  it("returns zero spend (not the warning) for a workspace with no ledger rows", async () => {
    const status = await getBudgetStatus(db, tenant.workspaceId);

    expect(status.usedCents).toBe(0);
    expect(status.percentUsed).toBe(0);
    expect(status.withinBudget).toBe(true);
    expect(status.warningThreshold).toBe(false);
  });
});

describe("assertWithinBudget", () => {
  it("passes at 50% of budget with no warning flag", async () => {
    await seedUsage(tenant.workspaceId, 5_000); // 50%

    const status = await assertWithinBudget(db, tenant.workspaceId);

    expect(status.withinBudget).toBe(true);
    expect(status.warningThreshold).toBe(false);
  });

  it("activates the warning flag at EXACTLY 80.0% of budget (>= boundary)", async () => {
    await seedUsage(tenant.workspaceId, 8_000); // exactly 80%

    const status = await assertWithinBudget(db, tenant.workspaceId);

    expect(status.withinBudget).toBe(true);
    expect(status.warningThreshold).toBe(true);
    expect(status.percentUsed).toBeCloseTo(80, 5);
  });

  it("passes at 99% of budget AND activates the 80% warning flag", async () => {
    await seedUsage(tenant.workspaceId, 9_900); // 99%

    const status = await assertWithinBudget(db, tenant.workspaceId);

    expect(status.withinBudget).toBe(true);
    expect(status.warningThreshold).toBe(true);
    expect(status.percentUsed).toBeCloseTo(99, 5);
  });

  it("throws BudgetExceededError (429) at 101% of budget", async () => {
    await seedUsage(tenant.workspaceId, 10_100); // 101%

    await expect(
      assertWithinBudget(db, tenant.workspaceId),
    ).rejects.toBeInstanceOf(BudgetExceededError);

    // The thrown error carries 429 semantics and the curated Spanish message.
    try {
      await assertWithinBudget(db, tenant.workspaceId);
      throw new Error("expected assertWithinBudget to throw");
    } catch (err) {
      expect(isBudgetExceededError(err)).toBe(true);
      const budgetErr = err as BudgetExceededError;
      expect(budgetErr.status).toBe(429);
      expect(budgetErr.message).toBe(
        "Budget mensual superado. Súbelo en /settings/ai.",
      );
    }
  });

  it("throws when exactly at 100% (>= budget boundary)", async () => {
    await seedUsage(tenant.workspaceId, BUDGET_CENTS); // 100%

    await expect(
      assertWithinBudget(db, tenant.workspaceId),
    ).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it("uses estimatedCostCents=0 by default — gates only against accrued spend", async () => {
    await seedUsage(tenant.workspaceId, 9_000); // 90%, under budget

    // No estimate passed: 9000 + 0 < 10000 -> passes.
    const status = await assertWithinBudget(db, tenant.workspaceId);
    expect(status.withinBudget).toBe(true);

    // With an estimate that crosses the cap: 9000 + 1500 >= 10000 -> throws.
    await expect(
      assertWithinBudget(db, tenant.workspaceId, 1_500),
    ).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it("accounts sub-cent micro-cent rows exactly and reports real USD spend (F7c)", async () => {
    // Three sub-cent generations that each round to 0 whole cents under the old
    // model would have summed to 0; micro-cents accounts them exactly.
    await seedUsageMicrocents(tenant.workspaceId, 13303); // $0.013303
    await seedUsageMicrocents(tenant.workspaceId, 4500); // $0.0045
    await seedUsageMicrocents(tenant.workspaceId, 250); // $0.00025

    const status = await getBudgetStatus(db, tenant.workspaceId);

    expect(status.usedMicrocents).toBe(13303 + 4500 + 250);
    // 18053 µ¢ = 1.8053 cents -> nearest cent = 2 (display only).
    expect(status.usedCents).toBe(2);
    expect(status.withinBudget).toBe(true);
    expect(status.warningThreshold).toBe(false);
  });

  it("pins the 80% warning boundary with sub-cent micro-cent rows", async () => {
    // budget 10000 cents -> 80% = 80_000_000 µ¢. Hit it with a sub-cent tail.
    await seedUsageMicrocents(tenant.workspaceId, 79_999_999); // just under 80%
    let status = await assertWithinBudget(db, tenant.workspaceId);
    expect(status.warningThreshold).toBe(false);
    expect(status.withinBudget).toBe(true);

    await seedUsageMicrocents(tenant.workspaceId, 1); // crosses to exactly 80%
    status = await assertWithinBudget(db, tenant.workspaceId);
    expect(status.warningThreshold).toBe(true);
    expect(status.withinBudget).toBe(true);
    expect(status.percentUsed).toBeCloseTo(80, 5);
  });

  it("pins the 100% gate boundary with a sub-cent overshoot (throws at >= budget)", async () => {
    // 99.999999% -> passes; one more µ¢ -> exactly 100% -> throws.
    await seedUsageMicrocents(tenant.workspaceId, 99_999_999);
    await expect(
      assertWithinBudget(db, tenant.workspaceId),
    ).resolves.toMatchObject({ withinBudget: true });

    await seedUsageMicrocents(tenant.workspaceId, 1); // exactly 100%
    await expect(
      assertWithinBudget(db, tenant.workspaceId),
    ).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it("excludes last-month rows from the current-month sum (implicit reset)", async () => {
    await seedUsage(tenant.workspaceId, 3_000); // 30% this month
    await seedLastMonthUsage(tenant.workspaceId, 9_000); // would blow budget

    const status = await assertWithinBudget(db, tenant.workspaceId);

    // Only the current-month 3000 counts; the back-dated 9000 is excluded.
    expect(status.usedCents).toBe(3_000);
    expect(status.percentUsed).toBe(30);
    expect(status.withinBudget).toBe(true);
  });

  it("never counts another workspace's spend (cross-tenant isolation)", async () => {
    const other = await provisionTenant("cost-budget-other");
    try {
      await setBudget(other.workspaceId, BUDGET_CENTS);
      // Other tenant blows its budget; this tenant has zero spend.
      await seedUsage(other.workspaceId, 20_000);

      const mine = await getBudgetStatus(db, tenant.workspaceId);
      expect(mine.usedCents).toBe(0);
      expect(mine.withinBudget).toBe(true);

      // And this tenant's gate passes despite the other tenant being over.
      await expect(
        assertWithinBudget(db, tenant.workspaceId),
      ).resolves.toMatchObject({ withinBudget: true });
    } finally {
      await serviceDb
        .delete(aiUsageLedger)
        .where(eq(aiUsageLedger.workspaceId, other.workspaceId));
      await teardownTenants(other);
    }
  });
});
