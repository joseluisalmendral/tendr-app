import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { plan } from "./enums";
import { workspaces } from "./workspaces";

/**
 * Billing (F8): Stripe subscription state + webhook idempotency.
 *
 * subscriptions.workspace_id is UNIQUE — at most one subscription row per
 * workspace; absence of a row means Free. Stripe webhooks write via
 * service_role (RLS lets users only SELECT their row). stripe_webhook_events
 * keeps the provider event_id as the text PK for idempotent processing (N4);
 * it is deny-all under RLS (service_role bypasses).
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .unique()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    stripeSubscriptionId: text("stripe_subscription_id"),
    plan: plan("plan").notNull().default("free"),
    status: text("status").notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("subscriptions_workspace_id_idx").on(table.workspaceId)],
);

export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  eventId: text("event_id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type StripeWebhookEvent = typeof stripeWebhookEvents.$inferSelect;
export type NewStripeWebhookEvent = typeof stripeWebhookEvents.$inferInsert;
