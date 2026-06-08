import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

import { provisionTenant, makeServiceClient, teardownTenants, type Tenant } from "./setup";

/**
 * F8 §6.6 — Stripe webhook integration tests (4 tests).
 *
 * These run against the LOCAL Supabase stack (the shared integration harness):
 * a real tenant is provisioned to get a real workspaceId, and rows are
 * inspected/seeded via the service_role supabase-js client. The route's `POST`
 * is imported and invoked with a real `Request`.
 *
 * Two boundaries are mocked:
 *   - `next/headers` → `headers().get('stripe-signature')` returns a per-test
 *     `currentSignature` we set before each POST.
 *   - `@/lib/stripe/client` → `getStripe()` returns an object whose `webhooks`
 *     is a REAL Stripe webhooks instance (so `constructEvent` truly verifies the
 *     signature we generate with the SAME secret via `generateTestHeaderString`)
 *     and whose `subscriptions.retrieve` is a `vi.fn()` we control.
 */

const TEST_WEBHOOK_SECRET = "whsec_test_secret";
const STRIPE_PRICE_PRO = "price_test_pro";
const STRIPE_PRICE_TEAM = "price_test_team";

// Real Stripe instance used ONLY for crypto: constructEvent (verification) and
// generateTestHeaderString (producing a valid signature for the same secret).
const realStripe = new Stripe("sk_test_dummy", {
  apiVersion: "2026-05-27.dahlia",
});

// Per-test mutable signature header value returned by the mocked next/headers.
let currentSignature: string | null = null;
// Per-test mutable subscriptions.retrieve mock implementation.
const retrieveMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) =>
      name === "stripe-signature" ? currentSignature : null,
  }),
}));

vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({
    webhooks: realStripe.webhooks,
    subscriptions: { retrieve: retrieveMock },
  }),
}));

// serviceDb (imported transitively by the route) throws at module load unless
// DATABASE_URL is set. Mirror the subscriptions seam test's local default.
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Import AFTER the mocks are registered and DATABASE_URL is set.
const { POST } = await import("@/app/api/webhooks/stripe/route");

const service = makeServiceClient();

function makeRequest(body: string): Request {
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body,
  });
}

/** Builds the raw payload + a VALID signature header for the given event. */
function sign(event: unknown): { body: string; signature: string } {
  const body = JSON.stringify(event);
  const signature = realStripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: TEST_WEBHOOK_SECRET,
  });
  return { body, signature };
}

// `tenant` carries the checkout/idempotency thread (tests 1-3, which share an
// accumulating subscription row). `deletedTenant` is a separate clean workspace
// for the deleted-event test, since its seeded row would collide with tenant's
// UNIQUE(workspace_id) subscription row.
let tenant: Tenant;
let deletedTenant: Tenant;

beforeAll(async () => {
  process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
  process.env.STRIPE_PRICE_PRO = STRIPE_PRICE_PRO;
  process.env.STRIPE_PRICE_TEAM = STRIPE_PRICE_TEAM;
  tenant = await provisionTenant("webhook");
  deletedTenant = await provisionTenant("webhook-del");
});

afterAll(async () => {
  // stripe_webhook_events rows are not workspace-scoped, so teardownTenants
  // (which cascades from the auth user) does not remove them — clean explicitly.
  await service
    .from("stripe_webhook_events")
    .delete()
    .in("event_id", [EVT_CHECKOUT, EVT_CHECKOUT_DUP, EVT_DELETED, EVT_ATOMIC]);
  await teardownTenants(tenant, deletedTenant);
});

beforeEach(() => {
  currentSignature = null;
  retrieveMock.mockReset();
});

/** Reads the (at most one) subscriptions row for a workspace via service role. */
async function readSubscriptions(workspaceId: string = tenant.workspaceId) {
  const { data, error } = await service
    .from("subscriptions")
    .select("plan,status,stripe_subscription_id,stripe_customer_id,current_period_end")
    .eq("workspace_id", workspaceId);
  expect(error).toBeNull();
  return data ?? [];
}

const futurePeriodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

// stripe_webhook_events is append-only (PK = event id, no workspace_id, so it
// is NOT cleared by teardownTenants). Use a per-run prefix so reruns never
// collide with markers left by a prior run, and clean them up in afterAll.
const RUN = randomUUID();
const EVT_CHECKOUT = `evt_checkout_${RUN}`;
const EVT_CHECKOUT_DUP = `evt_checkout_dup_${RUN}`;
const EVT_DELETED = `evt_deleted_${RUN}`;
const EVT_ATOMIC = `evt_atomic_${RUN}`;

function checkoutCompletedEvent() {
  return {
    id: EVT_CHECKOUT,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        object: "checkout.session",
        client_reference_id: tenant.workspaceId,
        customer: "cus_test",
        subscription: "sub_test",
        mode: "subscription",
      },
    },
  };
}

function retrievedSubscription() {
  return {
    id: "sub_test",
    object: "subscription",
    status: "active",
    metadata: { workspace_id: tenant.workspaceId },
    items: {
      object: "list",
      data: [
        {
          id: "si_test",
          object: "subscription_item",
          price: { id: STRIPE_PRICE_PRO, object: "price" },
          current_period_end: futurePeriodEnd,
        },
      ],
    },
  };
}

describe("Stripe webhook POST", () => {
  it("rejects an invalid signature with 400 and writes nothing", async () => {
    const event = checkoutCompletedEvent();
    const body = JSON.stringify(event);
    currentSignature = "t=1,v1=bad";

    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);

    // No webhook-event row for this id.
    const { data: evtRows } = await service
      .from("stripe_webhook_events")
      .select("event_id")
      .eq("event_id", event.id);
    expect(evtRows ?? []).toHaveLength(0);

    // No subscriptions change for the tenant.
    expect(await readSubscriptions()).toHaveLength(0);
  });

  it("processes checkout.session.completed → plan='pro'", async () => {
    const event = checkoutCompletedEvent();
    retrieveMock.mockResolvedValue(retrievedSubscription());
    const { body, signature } = sign(event);
    currentSignature = signature;

    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");

    const rows = await readSubscriptions();
    expect(rows).toHaveLength(1);
    expect(rows[0].plan).toBe("pro");
    expect(rows[0].stripe_subscription_id).toBe("sub_test");
    // Exact value (not merely non-null): the period must be read from
    // items.data[0].current_period_end (Unix seconds) and stored as that precise
    // instant. A non-null assertion would pass even if the date were computed
    // from the (undefined in Basil) top-level field.
    expect(rows[0].current_period_end).not.toBeNull();
    expect(new Date(String(rows[0].current_period_end)).getTime()).toBe(
      futurePeriodEnd * 1000,
    );
  });

  it("ignores a duplicate event_id (idempotent)", async () => {
    // Distinct event id: test 2 already consumed `evt_checkout_1`, so the FIRST
    // POST here must be a genuine first delivery, then we replay it.
    const event = { ...checkoutCompletedEvent(), id: EVT_CHECKOUT_DUP };
    retrieveMock.mockResolvedValue(retrievedSubscription());
    const { body, signature } = sign(event);
    currentSignature = signature;

    const first = await POST(makeRequest(body));
    expect(first.status).toBe(200);
    expect(await first.text()).toBe("OK");

    currentSignature = signature;
    const second = await POST(makeRequest(body));
    expect(second.status).toBe(200);
    expect(await second.text()).toBe("Already processed");

    // Exactly one marker row for the event id.
    const { data: evtRows } = await service
      .from("stripe_webhook_events")
      .select("event_id")
      .eq("event_id", event.id);
    expect(evtRows ?? []).toHaveLength(1);

    // Subscriptions not double-applied: still exactly one row for the workspace.
    expect(await readSubscriptions()).toHaveLength(1);
  });

  it("processes customer.subscription.deleted → plan='free', status='cancelled'", async () => {
    // Seed an active pro subscription row for the dedicated deleted-tenant.
    const { error: seedErr } = await service.from("subscriptions").insert({
      workspace_id: deletedTenant.workspaceId,
      stripe_customer_id: "cus_del",
      stripe_subscription_id: "sub_del",
      plan: "pro",
      status: "active",
    });
    expect(seedErr).toBeNull();

    const event = {
      id: EVT_DELETED,
      object: "event",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_del",
          object: "subscription",
          status: "canceled",
          metadata: { workspace_id: deletedTenant.workspaceId },
          items: {
            object: "list",
            data: [
              {
                id: "si_test",
                object: "subscription_item",
                price: { id: STRIPE_PRICE_PRO, object: "price" },
                current_period_end: futurePeriodEnd,
              },
            ],
          },
        },
      },
    };
    const { body, signature } = sign(event);
    currentSignature = signature;

    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);

    const rows = await readSubscriptions(deletedTenant.workspaceId);
    expect(rows).toHaveLength(1);
    expect(rows[0].plan).toBe("free");
    expect(rows[0].status).toBe("cancelled");
  });

  it("rolls back the event marker when the subscription write fails (atomic)", async () => {
    // Atomicity guarantee: the marker INSERT and the subscriptions write live in
    // ONE transaction. Here the subscriptions write FAILS at the DB layer — the
    // checkout references a workspace_id that does not exist, so the INSERT into
    // subscriptions violates the FK on subscriptions.workspace_id. The whole tx
    // must roll back: the already-inserted marker must NOT persist, and the route
    // returns 500 so Stripe retries. This is the failure branch the idempotency
    // test could not reach.
    const bogusWorkspaceId = randomUUID(); // never provisioned → FK violation
    const event = {
      id: EVT_ATOMIC,
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_atomic",
          object: "checkout.session",
          client_reference_id: bogusWorkspaceId,
          customer: "cus_atomic",
          subscription: "sub_atomic",
          mode: "subscription",
        },
      },
    };
    retrieveMock.mockResolvedValue({
      id: "sub_atomic",
      object: "subscription",
      status: "active",
      metadata: { workspace_id: bogusWorkspaceId },
      items: {
        object: "list",
        data: [
          {
            id: "si_atomic",
            object: "subscription_item",
            price: { id: STRIPE_PRICE_PRO, object: "price" },
            current_period_end: futurePeriodEnd,
          },
        ],
      },
    });
    const { body, signature } = sign(event);
    currentSignature = signature;

    const res = await POST(makeRequest(body));
    // Post-verification processing error (FK violation) → 500.
    expect(res.status).toBe(500);

    // THE atomicity assertion: the marker was rolled back, so no row persists.
    const { data: evtRows } = await service
      .from("stripe_webhook_events")
      .select("event_id")
      .eq("event_id", EVT_ATOMIC);
    expect(evtRows ?? []).toHaveLength(0);

    // And no partial subscription row leaked for the bogus workspace.
    const { data: subRows } = await service
      .from("subscriptions")
      .select("workspace_id")
      .eq("workspace_id", bogusWorkspaceId);
    expect(subRows ?? []).toHaveLength(0);
  });
});
