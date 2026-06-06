import {
  bigserial,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { authUsers } from "drizzle-orm/supabase";

import { workspaces } from "./workspaces";

/**
 * Audit log — append-only (N4).
 *
 * workspace_id is NULLABLE with ON DELETE SET NULL so audit rows SURVIVE
 * workspace deletion (orphaned rows keep an immutable trail). By RLS design,
 * SET NULL rows then become invisible to all user SELECTs — only service_role
 * can read orphaned audit rows. Inserts happen exclusively via service_role.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    actorId: uuid("actor_id").references(() => authUsers.id),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_log_workspace_id_idx").on(table.workspaceId),
    index("audit_log_actor_id_idx").on(table.actorId),
  ],
);

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
