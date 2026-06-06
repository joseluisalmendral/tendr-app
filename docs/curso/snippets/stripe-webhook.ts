// Stripe webhook handler · F8
// app/api/webhooks/stripe/route.ts
//
// CRÍTICO: firma + idempotencia + transacción atómica.

import { headers } from 'next/headers'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe/client'
import { db } from '@/db'
import { subscriptions, stripeWebhookEvents } from '@/db/schema'
import { eq } from 'drizzle-orm'

const PRICE_TO_PLAN: Record<string, 'pro' | 'team'> = {
  [process.env.STRIPE_PRICE_PRO!]: 'pro',
  [process.env.STRIPE_PRICE_TEAM!]: 'team',
}

export async function POST(req: Request) {
  // 1. Header de firma
  const headerStore = await headers()
  const signature = headerStore.get('stripe-signature')
  if (!signature) {
    return new Response('Missing signature', { status: 400 })
  }

  // 2. Raw body (NO req.json(); Stripe firma el raw text)
  const body = await req.text()

  // 3. Verificación de firma
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    )
  } catch {
    // No filtramos detalle del error de firma
    return new Response('Invalid signature', { status: 400 })
  }

  // 4. Idempotencia: si ya procesamos este event_id, devolvemos 200 sin
  //    re-procesar. La PK en stripe_webhook_events es la garantía.
  try {
    await db.transaction(async (tx) => {
      // INSERT con PK; conflict si ya existe
      await tx
        .insert(stripeWebhookEvents)
        .values({ eventId: event.id, type: event.type })
        // Si tu Drizzle soporta onConflictDoNothing, úsalo. Si no,
        // captura el error de unique violation aquí.

      await handleStripeEvent(tx, event)
    })
  } catch (e) {
    const msg = (e as Error).message ?? ''
    if (msg.includes('duplicate key') || msg.includes('unique')) {
      // Re-envío del mismo event_id; idempotencia garantizada.
      return new Response('Already processed', { status: 200 })
    }
    // Cualquier otro error: 500. Stripe reintentará.
    return new Response('Processing error', { status: 500 })
  }

  return new Response('OK', { status: 200 })
}

// ============================================================================
// Handler dentro de transacción
// ============================================================================
async function handleStripeEvent(
  tx: typeof db,
  event: Stripe.Event,
): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const workspaceId = session.client_reference_id
      if (!workspaceId) return

      // Recuperar la subscription para saber price/plan/period.
      const subscriptionId = session.subscription as string
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      // Stripe API Basil movió current_period_end del subscription a cada
      // subscription item. Se lee desde items.data[0], no del top-level.
      const item = subscription.items.data[0]
      const priceId = item?.price.id ?? ''
      const plan = PRICE_TO_PLAN[priceId] ?? 'free'
      const periodEnd = new Date(item.current_period_end * 1000)

      await tx
        .insert(subscriptions)
        .values({
          workspaceId,
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: subscriptionId,
          plan,
          status: subscription.status,
          currentPeriodEnd: periodEnd,
        })
        .onConflictDoUpdate({
          target: subscriptions.workspaceId,
          set: {
            stripeSubscriptionId: subscriptionId,
            plan,
            status: subscription.status,
            currentPeriodEnd: periodEnd,
            updatedAt: new Date(),
          },
        })
      break
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const workspaceId =
        (subscription.metadata?.workspace_id as string | undefined) ?? null
      if (!workspaceId) return

      const item = subscription.items.data[0]
      const priceId = item?.price.id ?? ''
      const plan = PRICE_TO_PLAN[priceId] ?? 'free'

      await tx
        .update(subscriptions)
        .set({
          plan,
          status: subscription.status,
          // Basil: el periodo vive en el subscription item, no en el top-level.
          currentPeriodEnd: new Date(item.current_period_end * 1000),
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.workspaceId, workspaceId))
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const workspaceId =
        (subscription.metadata?.workspace_id as string | undefined) ?? null
      if (!workspaceId) return

      await tx
        .update(subscriptions)
        .set({
          plan: 'free',
          status: 'cancelled',
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.workspaceId, workspaceId))
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const subscriptionId = invoice.subscription as string | null
      if (!subscriptionId) return

      await tx
        .update(subscriptions)
        .set({ status: 'past_due', updatedAt: new Date() })
        .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
      // MVP: status past_due, sin email. Roadmap: email + grace 3-7 días.
      break
    }

    default: {
      // Event type que no manejamos todavía. Devolvemos OK para que Stripe
      // no reintente, pero NO insertamos en stripe_webhook_events para que
      // cuando añadamos el handler, el event re-enviado se reprocese.
      // El INSERT ya pasó en el caller; tendrías que revertirlo si quieres
      // este comportamiento. Alternativa: handlear todos los events
      // conocidos explícitamente.
      console.warn(`Unhandled Stripe event type: ${event.type}`)
    }
  }
}
