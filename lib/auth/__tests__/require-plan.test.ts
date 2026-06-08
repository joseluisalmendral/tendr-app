import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  provisionTenant,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";

/**
 * requirePlanWith (the pure F8 plan-gate seam) against the REAL local Supabase
 * stack. Subscription rows are seeded with the privileged service-role `serviceDb`
 * and the gate is also driven with `serviceDb` (the Inngest path), which is the
 * only path that can read a row regardless of session — the fail-closed
 * entitlement logic, NOT RLS visibility, decides the outcome.
 *
 * Covers (SECURITY-CRITICAL — every effective-plan edge + the infra-error guard):
 *   - Free (no row)                                 -> PlanGateError (403)
 *   - Pro, active, future period                    -> resolves { pro, validUntil }
 *   - Pro, active, PAST period (expired)            -> PlanGateError (fail-closed)
 *   - Pro, non-active status, future period         -> PlanGateError (fail-closed)
 *   - Pro, active, NULL period                      -> PlanGateError (fail-closed)
 *   - Team, active, future                          -> resolves for "pro" AND "team"
 *   - DB/infra read failure                         -> rethrown UNCHANGED (not a gate)
 *
 * DATABASE_URL must be exported in the shell (vitest has no env loader).
 */
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const HOUR = 60 * 60 * 1000;

describe("requirePlanWith", () => {
  let tenant: Tenant;
  let serviceDb: typeof import("@/db/service")["serviceDb"];
  let requirePlanWith: typeof import("../require-plan")["requirePlanWith"];
  let PlanGateError: typeof import("../require-plan")["PlanGateError"];
  let subscriptions: typeof import("@/db/schema")["subscriptions"];
  let eq: typeof import("drizzle-orm")["eq"];

  /** Upserts a subscription row for the tenant (workspace_id is UNIQUE). */
  async function setSubscription(values: {
    plan: "free" | "pro" | "team";
    status: string;
    currentPeriodEnd: Date | null;
  }): Promise<void> {
    await serviceDb.delete(subscriptions).where(
      eq(subscriptions.workspaceId, tenant.workspaceId),
    );
    await serviceDb.insert(subscriptions).values({
      workspaceId: tenant.workspaceId,
      stripeCustomerId: `cus_test_${tenant.workspaceId}`,
      plan: values.plan,
      status: values.status,
      currentPeriodEnd: values.currentPeriodEnd,
    });
  }

  beforeAll(async () => {
    ({ serviceDb } = await import("@/db/service"));
    ({ requirePlanWith, PlanGateError } = await import("../require-plan"));
    ({ subscriptions } = await import("@/db/schema"));
    ({ eq } = await import("drizzle-orm"));

    tenant = await provisionTenant("require-plan");
  });

  afterAll(async () => {
    await teardownTenants(tenant);
  });

  afterEach(async () => {
    await serviceDb.delete(subscriptions).where(
      eq(subscriptions.workspaceId, tenant.workspaceId),
    );
  });

  it("Free (no subscription row) -> rejects with PlanGateError (403)", async () => {
    await expect(
      requirePlanWith(serviceDb, tenant.workspaceId, "pro"),
    ).rejects.toBeInstanceOf(PlanGateError);

    await expect(
      requirePlanWith(serviceDb, tenant.workspaceId, "pro"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("Pro, active, future period -> resolves { plan: pro, validUntil }", async () => {
    const future = new Date(Date.now() + HOUR);
    await setSubscription({ plan: "pro", status: "active", currentPeriodEnd: future });

    const result = await requirePlanWith(serviceDb, tenant.workspaceId, "pro");
    expect(result.plan).toBe("pro");
    expect(result.validUntil).toBeInstanceOf(Date);
    expect(result.validUntil?.getTime()).toBe(future.getTime());
  });

  it("Pro, active, PAST period -> rejects (expired treated as free)", async () => {
    const past = new Date(Date.now() - HOUR);
    await setSubscription({ plan: "pro", status: "active", currentPeriodEnd: past });

    await expect(
      requirePlanWith(serviceDb, tenant.workspaceId, "pro"),
    ).rejects.toBeInstanceOf(PlanGateError);
  });

  it("Pro, cancelled status, future period -> rejects (non-active treated as free)", async () => {
    const future = new Date(Date.now() + HOUR);
    await setSubscription({
      plan: "pro",
      status: "cancelled",
      currentPeriodEnd: future,
    });

    await expect(
      requirePlanWith(serviceDb, tenant.workspaceId, "pro"),
    ).rejects.toBeInstanceOf(PlanGateError);
  });

  it("Pro, active, NULL period -> rejects (fail-closed)", async () => {
    await setSubscription({ plan: "pro", status: "active", currentPeriodEnd: null });

    await expect(
      requirePlanWith(serviceDb, tenant.workspaceId, "pro"),
    ).rejects.toBeInstanceOf(PlanGateError);
  });

  it("Team, active, future -> resolves for both 'pro' (rank) and 'team'", async () => {
    const future = new Date(Date.now() + HOUR);
    await setSubscription({ plan: "team", status: "active", currentPeriodEnd: future });

    const asPro = await requirePlanWith(serviceDb, tenant.workspaceId, "pro");
    expect(asPro.plan).toBe("team");

    const asTeam = await requirePlanWith(serviceDb, tenant.workspaceId, "team");
    expect(asTeam.plan).toBe("team");
  });

  it("DB/infra read failure -> rethrows THAT error, never PlanGateError, never grants access", async () => {
    const infraError = new Error("connection reset");
    // Minimal stub db whose select().from().where().limit() chain rejects, so a
    // transient infra failure must surface as ITSELF — never masquerade as a
    // 403 gate decision and never silently grant access.
    const stubDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.reject(infraError),
          }),
        }),
      }),
    } as unknown as Parameters<typeof requirePlanWith>[0];

    await expect(
      requirePlanWith(stubDb, tenant.workspaceId, "pro"),
    ).rejects.toBe(infraError);

    await expect(
      requirePlanWith(stubDb, tenant.workspaceId, "pro"),
    ).rejects.not.toBeInstanceOf(PlanGateError);
  });
});
