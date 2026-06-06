import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { authUsers } from "drizzle-orm/supabase";

import { plan } from "./enums";

/**
 * Workspaces — the multi-tenant isolation anchor.
 *
 * owner_id is UNIQUE + NOT NULL (G3): every workspace has exactly one owner and
 * the RLS predicate `owner_id = (select auth.uid())` resolves via a unique
 * index. ON DELETE CASCADE (G4) tears the workspace down when the auth user is
 * removed; user-facing DELETE on workspaces is intentionally not exposed.
 */
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .unique()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Denormalized plan cache. Source of truth for gating is `subscriptions`;
  // this column is not synced by the payments webhook and is informational.
  plan: plan("plan").notNull().default("free"),
  aiMonthlyBudgetCents: integer("ai_monthly_budget_cents").default(5000),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
