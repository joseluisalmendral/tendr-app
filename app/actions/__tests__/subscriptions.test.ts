import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  provisionTenant,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";
import type { StripePort } from "../subscriptions";

/**
 * createCheckoutSessionWith (the pure subscriptions seam) against the REAL
 * local Supabase stack. The Stripe client is a hand-rolled StripePort spy (no
 * network); the db is the service_role client (writes the subscriptions row).
 *
 * Covers the two F8 guarantees:
 *   - valid priceId (from the env-derived enum) → returns a Checkout URL and
 *     creates a Stripe customer + persists the subscriptions row.
 *   - workspace with an ACTIVE subscription → already_subscribed, NO Stripe
 *     calls at all.
 *   - arbitrary priceId (not in the env enum) → validation_error (Zod), NO
 *     Stripe calls.
 *
 * DATABASE_URL must be exported in the shell.
 */
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const PRICE_PRO = "price_pro_test";
const PRICE_TEAM = "price_team_test";
const CHECKOUT_URL = "https://checkout.stripe.test/session/cs_test_123";
const SITE_URL = "https://tendr.test";

interface StripeSpy {
  port: StripePort;
  customersCreate: ReturnType<typeof vi.fn>;
  sessionsCreate: ReturnType<typeof vi.fn>;
}

function stripeSpy(opts?: { url?: string | null }): StripeSpy {
  const customersCreate = vi.fn(async () => ({ id: "cus_test_123" }));
  const sessionsCreate = vi.fn(async () => ({
    url: opts?.url === undefined ? CHECKOUT_URL : opts.url,
  }));
  return {
    port: {
      customers: { create: customersCreate },
      checkout: { sessions: { create: sessionsCreate } },
    },
    customersCreate,
    sessionsCreate,
  };
}

describe("createCheckoutSessionWith", () => {
  let tenant: Tenant;
  let serviceDb: typeof import("@/db/service")["serviceDb"];
  let createCheckoutSessionWith: typeof import("../subscriptions")["createCheckoutSessionWith"];
  let s: typeof import("@/db/schema");

  const deps = (spy: StripeSpy) => ({
    db: serviceDb,
    stripe: spy.port,
    allowedPriceIds: [PRICE_PRO, PRICE_TEAM],
    siteUrl: SITE_URL,
  });

  beforeAll(async () => {
    ({ serviceDb } = await import("@/db/service"));
    ({ createCheckoutSessionWith } = await import("../subscriptions"));
    s = await import("@/db/schema");

    tenant = await provisionTenant("subscriptions");
  });

  afterAll(async () => {
    await teardownTenants(tenant);
  });

  afterEach(async () => {
    await serviceDb
      .delete(s.subscriptions)
      .where(eq(s.subscriptions.workspaceId, tenant.workspaceId));
  });

  it("valid priceId: creates customer + persists row + returns checkout URL", async () => {
    const spy = stripeSpy();

    const result = await createCheckoutSessionWith(
      deps(spy),
      tenant.workspaceId,
      "owner@example.test",
      { priceId: PRICE_PRO },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url).toBe(CHECKOUT_URL);

    // Customer created with the workspace metadata; checkout used the priceId.
    expect(spy.customersCreate).toHaveBeenCalledTimes(1);
    expect(spy.customersCreate).toHaveBeenCalledWith({
      email: "owner@example.test",
      metadata: { workspace_id: tenant.workspaceId },
    });
    expect(spy.sessionsCreate).toHaveBeenCalledTimes(1);
    const sessionArg = spy.sessionsCreate.mock.calls[0][0];
    expect(sessionArg.line_items).toEqual([{ price: PRICE_PRO, quantity: 1 }]);
    expect(sessionArg.client_reference_id).toBe(tenant.workspaceId);
    expect(sessionArg.success_url).toBe(`${SITE_URL}/app?checkout=success`);

    // The subscriptions row was persisted with the new customer id.
    const [row] = await serviceDb
      .select({ customerId: s.subscriptions.stripeCustomerId })
      .from(s.subscriptions)
      .where(eq(s.subscriptions.workspaceId, tenant.workspaceId));
    expect(row.customerId).toBe("cus_test_123");
  });

  it("already active subscription: already_subscribed, NO Stripe calls", async () => {
    // Seed an active subscription whose period has NOT expired.
    await serviceDb.insert(s.subscriptions).values({
      workspaceId: tenant.workspaceId,
      stripeCustomerId: "cus_existing",
      stripeSubscriptionId: "sub_existing",
      plan: "pro",
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const spy = stripeSpy();

    const result = await createCheckoutSessionWith(
      deps(spy),
      tenant.workspaceId,
      "owner@example.test",
      { priceId: PRICE_PRO },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("already_subscribed");
    expect(result.error).toBe("Ya tienes una subscription activa");
    expect(spy.customersCreate).not.toHaveBeenCalled();
    expect(spy.sessionsCreate).not.toHaveBeenCalled();
  });

  it("arbitrary priceId not in env enum: validation_error, NO Stripe calls", async () => {
    const spy = stripeSpy();

    const result = await createCheckoutSessionWith(
      deps(spy),
      tenant.workspaceId,
      "owner@example.test",
      { priceId: "price_attacker_chosen" },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("validation_error");
    expect(spy.customersCreate).not.toHaveBeenCalled();
    expect(spy.sessionsCreate).not.toHaveBeenCalled();
  });
});
