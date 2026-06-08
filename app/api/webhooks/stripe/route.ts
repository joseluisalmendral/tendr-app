import { headers } from "next/headers";
import type Stripe from "stripe";

import { eq } from "drizzle-orm";

import { serviceDb, schema } from "@/db/service";
import { getStripe } from "@/lib/stripe/client";

/**
 * Stripe webhook endpoint (F8).
 *
 * Mirrors the F7 seam + thin `"use server"` wrapper split (see
 * app/actions/subscriptions.ts): `processStripeEventWith` holds ALL business
 * logic with its deps (db + stripe + env) injected so it is unit-testable; the
 * exported `POST` is the security frontier only — it reads the raw body, reads
 * the signature header, verifies it, then hands a verified `Stripe.Event` to
 * the seam and maps the seam result to a `Response`.
 *
 * Node runtime is required: Stripe signature verification uses Node `crypto`
 * and needs the RAW request body (`req.text()`, NEVER `req.json()` — Stripe
 * signs the raw bytes). `force-dynamic` prevents any caching of this POST-only
 * route.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * All DB writes here use the dedicated service-role client `serviceDb`: this is
 * the designated privileged-write path (its doc-comment names "Stripe webhooks")
 * and the webhook has no user session, so reaching for the user-session `@/db`
 * client would be semantically wrong. (Note: neither Drizzle client enforces RLS
 * at the SQL layer today — both connect as the owner/superuser; see db/index.ts.
 * The distinction is about intent and the intended prod connection role, not an
 * RLS rejection.)
 */
type ServiceDb = typeof serviceDb;

/** Deps injected into the pure seam so it is fully unit-testable. */
export interface ProcessStripeEventDeps {
  db: ServiceDb;
  stripe: Stripe;
  env: {
    STRIPE_PRICE_PRO?: string;
    STRIPE_PRICE_TEAM?: string;
  };
}

export type ProcessStripeEventResult = "ok" | "already_processed";

/**
 * Sentinel thrown INSIDE the db transaction when the event-marker INSERT hits a
 * conflict (the event id is already present → this is a Stripe re-delivery).
 * Throwing rolls back the whole transaction so a duplicate delivery can never
 * re-apply the subscription write; the route maps it to 200 'Already processed'.
 */
class AlreadyProcessed extends Error {}

type Plan = "free" | "pro" | "team";

/** Maps a Stripe price id to our plan tier. Throws on an unknown price. */
function priceIdToPlan(
  priceId: string | undefined,
  env: ProcessStripeEventDeps["env"],
): Plan {
  if (priceId && priceId === env.STRIPE_PRICE_PRO) return "pro";
  if (priceId && priceId === env.STRIPE_PRICE_TEAM) return "team";
  // Loud failure: an unmapped price id is a config bug. Throwing makes the
  // route return 500 + a server log so Stripe retries instead of us silently
  // persisting a wrong/empty plan with a 200.
  throw new Error(`Unknown Stripe price id: ${priceId ?? "<none>"}`);
}

/**
 * Basil API gotcha: `Stripe.Subscription` has NO top-level `current_period_end`.
 * The period now lives on each subscription item; we read it from
 * `items.data[0].current_period_end` (Unix seconds → Date). Confirmed against
 * node_modules/stripe@22.2.0 SubscriptionItems.d.ts (`current_period_end: number`).
 */
function currentPeriodEndOf(subscription: Stripe.Subscription): Date {
  const item = subscription.items.data[0];
  return new Date(item.current_period_end * 1000);
}

/** The desired subscription state precomputed from a retrieved Subscription. */
interface DesiredCheckoutState {
  workspaceId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  plan: Plan;
  status: string;
  currentPeriodEnd: Date;
}

/**
 * Pure seam: process a VERIFIED Stripe event.
 *
 * Shape (rule #5 intent — atomic writes, network OUTSIDE the tx):
 *   1. Any network I/O (for checkout.session.completed we `subscriptions.retrieve`)
 *      happens BEFORE opening the transaction, and the desired state is
 *      precomputed.
 *   2. The event-marker INSERT and the subscriptions write happen inside ONE
 *      `db.transaction`. An empty `.returning()` array means the marker already
 *      existed → throw `AlreadyProcessed` to roll back.
 */
export async function processStripeEventWith(
  deps: ProcessStripeEventDeps,
  event: Stripe.Event,
): Promise<ProcessStripeEventResult> {
  const { db, stripe, env } = deps;

  // --- Step 1: network + precompute, OUTSIDE the transaction ---------------
  let desiredCheckout: DesiredCheckoutState | null = null;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;
    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["items.data.price"],
      });
      const workspaceId =
        session.client_reference_id ??
        subscription.metadata?.workspace_id ??
        null;
      if (workspaceId) {
        const priceId = subscription.items.data[0]?.price?.id;
        desiredCheckout = {
          workspaceId,
          stripeCustomerId:
            typeof session.customer === "string"
              ? session.customer
              : (session.customer?.id ?? ""),
          stripeSubscriptionId: subscription.id,
          plan: priceIdToPlan(priceId, env),
          status: subscription.status,
          currentPeriodEnd: currentPeriodEndOf(subscription),
        };
      }
    }
  }

  // --- Step 2: idempotent marker + subscription write, ONE transaction -----
  try {
    await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(schema.stripeWebhookEvents)
        .values({ eventId: event.id, type: event.type })
        .onConflictDoNothing()
        .returning();

      // Empty array → the event id already existed → duplicate delivery.
      // Throw to roll back; the route turns this into 200 'Already processed'.
      if (inserted.length === 0) {
        throw new AlreadyProcessed();
      }

      await applyEvent(tx, event, env, desiredCheckout);
    });
  } catch (err) {
    if (err instanceof AlreadyProcessed) {
      return "already_processed";
    }
    throw err;
  }

  return "ok";
}

/**
 * Applies the subscription side effect for a verified event INSIDE the
 * transaction. `desiredCheckout` is the precomputed checkout state (null for
 * other event types).
 */
async function applyEvent(
  tx: Parameters<Parameters<ServiceDb["transaction"]>[0]>[0],
  event: Stripe.Event,
  env: ProcessStripeEventDeps["env"],
  desiredCheckout: DesiredCheckoutState | null,
): Promise<void> {
  const { subscriptions } = schema;

  switch (event.type) {
    case "checkout.session.completed": {
      if (!desiredCheckout) return;
      // UPSERT by workspaceId: a row may already exist from slice 1
      // (status:'incomplete', plan:'free', stripeSubscriptionId:null), so we
      // never blind-insert.
      await tx
        .insert(subscriptions)
        .values({
          workspaceId: desiredCheckout.workspaceId,
          stripeCustomerId: desiredCheckout.stripeCustomerId,
          stripeSubscriptionId: desiredCheckout.stripeSubscriptionId,
          plan: desiredCheckout.plan,
          status: desiredCheckout.status,
          currentPeriodEnd: desiredCheckout.currentPeriodEnd,
        })
        .onConflictDoUpdate({
          target: subscriptions.workspaceId,
          set: {
            stripeCustomerId: desiredCheckout.stripeCustomerId,
            stripeSubscriptionId: desiredCheckout.stripeSubscriptionId,
            plan: desiredCheckout.plan,
            status: desiredCheckout.status,
            currentPeriodEnd: desiredCheckout.currentPeriodEnd,
          },
        });
      return;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      // Least-trust selector (W1): locate the row by the stripeSubscriptionId WE
      // persisted at checkout. That id is intrinsic to the Stripe object and
      // lives in our own account, so it cannot be forged. We deliberately do NOT
      // select by `metadata.workspace_id`: the signature proves the event came
      // from Stripe, not that a free-form metadata field honestly names the
      // owning workspace, so trusting it to pick which row to mutate would be a
      // cross-tenant write primitive.
      await tx
        .update(subscriptions)
        .set({
          status: subscription.status,
          currentPeriodEnd: currentPeriodEndOf(subscription),
        })
        .where(eq(subscriptions.stripeSubscriptionId, subscription.id));
      return;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      // Least-trust selector (W1): select by the stripeSubscriptionId we
      // persisted, never by attacker-influenceable metadata. See
      // customer.subscription.updated above for the full rationale.
      await tx
        .update(subscriptions)
        .set({ status: "cancelled", plan: "free" as Plan })
        .where(eq(subscriptions.stripeSubscriptionId, subscription.id));
      return;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      // Basil moved the invoice→subscription link OFF the top-level
      // `invoice.subscription` field. Confirmed against
      // node_modules/stripe@22.2.0 resources/Invoices.d.ts: the link is now
      // `invoice.parent.subscription_details.subscription`
      // (Invoice.parent: Invoice.Parent | null, line 348;
      //  Parent.subscription_details: Parent.SubscriptionDetails | null, line 651;
      //  SubscriptionDetails.subscription: string | Subscription, line 856).
      const subscriptionRef = invoice.parent?.subscription_details?.subscription;
      const subscriptionId =
        typeof subscriptionRef === "string"
          ? subscriptionRef
          : subscriptionRef?.id;
      if (!subscriptionId) return;
      // MVP: mark past_due. Email notification to the workspace owner is
      // roadmap (no transactional email in MVP).
      await tx
        .update(subscriptions)
        .set({ status: "past_due" })
        .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));
      return;
    }

    default:
      // Unhandled event type: the marker INSERT already committed (within this
      // tx) so Stripe is not retried, and no subscription write is performed.
      return;
  }
}

/**
 * POST handler — security frontier only.
 *
 * Pre-verification failures (missing header, missing secret, bad signature)
 * return a bare 400 with NO detail and NO logging: this endpoint is publicly
 * reachable and bots probe it; we must not spam logs before a request is proven
 * to come from Stripe. Post-verification failures are real server errors → 500
 * (logging is allowed there).
 */
export async function POST(req: Request): Promise<Response> {
  // Raw body — Stripe signs the raw bytes, so NEVER req.json().
  const body = await req.text();
  const sig = (await headers()).get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !secret) {
    return new Response("Invalid signature", { status: 400 });
  }

  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch {
    // No detail, no logging — pre-verification frontier.
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    const result = await processStripeEventWith(
      {
        db: serviceDb,
        stripe,
        env: {
          STRIPE_PRICE_PRO: process.env.STRIPE_PRICE_PRO,
          STRIPE_PRICE_TEAM: process.env.STRIPE_PRICE_TEAM,
        },
      },
      event,
    );

    if (result === "already_processed") {
      return new Response("Already processed", { status: 200 });
    }
    return new Response("OK", { status: 200 });
  } catch (err) {
    // Post-verification: a genuine processing error. Log it (request is proven
    // to come from Stripe) and return 500 so Stripe retries.
    console.error("Stripe webhook processing failed", err);
    return new Response("Processing error", { status: 500 });
  }
}
