"use server";

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { ensureAnonymousWorkspace } from "@/app/(auth)/actions";
import { db } from "@/db";
import type * as schema from "@/db/schema";
import { subscriptions } from "@/db/schema";
import { getCurrentWorkspace } from "@/lib/auth/get-current-workspace";
import { getStripe } from "@/lib/stripe/client";

/**
 * `createCheckoutSession` (F8) — start a Stripe Checkout subscription flow for
 * the caller's workspace. Follows the F7 seam + thin `"use server"` wrapper
 * split: `createCheckoutSessionWith` holds ALL logic with its deps (db + a
 * minimal Stripe port) injected so it is import-testable; the exported
 * `createCheckoutSession` resolves the caller's workspace/email and wires the
 * real db and Stripe client.
 *
 * Two hard guarantees:
 *   1. NO arbitrary client price: `priceId` is validated against a Zod enum
 *      built at call time from [STRIPE_PRICE_PRO, STRIPE_PRICE_TEAM]. Any
 *      other value fails validation BEFORE any Stripe call.
 *   2. NO double subscription: an existing active subscription row (status
 *      'active' AND current_period_end > now) short-circuits with an error;
 *      no Checkout Session is created.
 */

/**
 * The two valid price ids for this workspace, derived from env at call time.
 * Empty/undefined env vars are filtered out so the enum never contains "".
 */
function allowedPriceIds(): string[] {
  return [process.env.STRIPE_PRICE_PRO, process.env.STRIPE_PRICE_TEAM].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
}

function buildInputSchema(allowed: string[]) {
  // Guarantee #1: a priceId not in the env-derived set fails Zod validation.
  return z.object({
    priceId: z
      .string()
      .refine((v) => allowed.includes(v), "Plan no válido."),
  });
}

export type CreateCheckoutSessionInput = { priceId: string };

export type CreateCheckoutSessionResult =
  | { ok: true; url: string }
  | {
      ok: false;
      errorCode: "validation_error" | "already_subscribed" | "stripe_error";
      error: string;
    };

/** Minimal Stripe surface the seam depends on (keeps the seam mockable). */
export interface StripePort {
  customers: {
    create(params: {
      email?: string;
      metadata?: Record<string, string>;
    }): Promise<{ id: string }>;
  };
  checkout: {
    sessions: {
      create(params: {
        mode: "subscription";
        customer: string;
        line_items: { price: string; quantity: number }[];
        success_url: string;
        cancel_url: string;
        client_reference_id: string;
        subscription_data: { metadata: Record<string, string> };
      }): Promise<{ url: string | null }>;
    };
  };
}

export interface CreateCheckoutSessionDeps {
  db: PostgresJsDatabase<typeof schema>;
  stripe: StripePort;
  allowedPriceIds: string[];
  siteUrl: string;
}

export async function createCheckoutSessionWith(
  deps: CreateCheckoutSessionDeps,
  workspaceId: string,
  userEmail: string | undefined,
  rawInput: CreateCheckoutSessionInput,
): Promise<CreateCheckoutSessionResult> {
  const parsed = buildInputSchema(deps.allowedPriceIds).safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: "validation_error",
      error: "Plan no válido.",
    };
  }
  const { priceId } = parsed.data;

  // Read the workspace's subscription row (workspace_id is UNIQUE → at most
  // one). Absence of a row means Free with no Stripe customer yet.
  const [existing] = await deps.db
    .select({
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      stripeCustomerId: subscriptions.stripeCustomerId,
    })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId))
    .limit(1);

  // Guarantee #2: an active subscription (active + not expired) blocks a
  // second checkout. We re-check current_period_end in JS because a webhook
  // may lag behind the period boundary.
  if (
    existing &&
    existing.status === "active" &&
    existing.currentPeriodEnd !== null &&
    existing.currentPeriodEnd.getTime() > Date.now()
  ) {
    return {
      ok: false,
      errorCode: "already_subscribed",
      error: "Ya tienes una subscription activa",
    };
  }

  // Reuse the customer if we already created one; otherwise create it and
  // persist the id so the next attempt reuses it (stripe_customer_id is
  // notNull, so a Free workspace simply has no row yet).
  let customerId: string;
  try {
    if (existing?.stripeCustomerId) {
      customerId = existing.stripeCustomerId;
    } else {
      const customer = await deps.stripe.customers.create({
        email: userEmail,
        metadata: { workspace_id: workspaceId },
      });
      customerId = customer.id;
      await deps.db
        .insert(subscriptions)
        .values({
          workspaceId,
          stripeCustomerId: customerId,
          plan: "free",
          status: "incomplete",
        })
        .onConflictDoUpdate({
          target: subscriptions.workspaceId,
          set: { stripeCustomerId: customerId },
        });
    }

    const session = await deps.stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${deps.siteUrl}/app?checkout=success`,
      cancel_url: `${deps.siteUrl}/upgrade?checkout=cancelled`,
      client_reference_id: workspaceId,
      subscription_data: { metadata: { workspace_id: workspaceId } },
    });

    if (!session.url) {
      return {
        ok: false,
        errorCode: "stripe_error",
        error: "No se pudo iniciar el checkout.",
      };
    }
    return { ok: true, url: session.url };
  } catch {
    return {
      ok: false,
      errorCode: "stripe_error",
      error: "No se pudo iniciar el checkout.",
    };
  }
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";

async function resolveWorkspace(): Promise<{
  workspaceId: string;
  email?: string;
} | null> {
  let current = await getCurrentWorkspace();
  if (current && current.workspaceId === null) {
    await ensureAnonymousWorkspace();
    current = await getCurrentWorkspace();
  }
  if (!current?.workspaceId) return null;
  return { workspaceId: current.workspaceId, email: current.user.email };
}

export async function createCheckoutSession(
  input: CreateCheckoutSessionInput,
): Promise<CreateCheckoutSessionResult> {
  const resolved = await resolveWorkspace();
  if (!resolved) {
    return {
      ok: false,
      errorCode: "validation_error",
      error: "Tu sesión expiró. Vuelve a iniciar sesión.",
    };
  }

  return createCheckoutSessionWith(
    { db, stripe: getStripe(), allowedPriceIds: allowedPriceIds(), siteUrl: SITE_URL },
    resolved.workspaceId,
    resolved.email,
    input,
  );
}

/**
 * Public plan tiers the /upgrade page exposes. The CLIENT only ever sends a
 * tier name ('pro' | 'team'), never a price id — STRIPE_PRICE_* are server-only
 * (not NEXT_PUBLIC_), so the browser cannot read them. The tier→priceId mapping
 * happens here, server-side, and the resolved priceId is still re-validated
 * against the env-built Zod enum inside the seam (defense in depth).
 */
export type PlanTier = "pro" | "team";

export async function startCheckout(
  tier: PlanTier,
): Promise<CreateCheckoutSessionResult> {
  const priceId =
    tier === "pro"
      ? process.env.STRIPE_PRICE_PRO
      : process.env.STRIPE_PRICE_TEAM;

  if (!priceId) {
    return {
      ok: false,
      errorCode: "stripe_error",
      error: "Este plan no está disponible ahora mismo.",
    };
  }

  return createCheckoutSession({ priceId });
}
