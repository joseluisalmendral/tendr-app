import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { jobStatus } from "./enums";
import { workspaces } from "./workspaces";

/**
 * Jobs — async work tracking (F6/F7).
 *
 * status is pgEnum-typed (M5). Users may INSERT and SELECT their workspace jobs;
 * Inngest advances status/result via service_role (RLS deviation enforced in
 * the 0001 migration). Realtime-published (N5) for live progress.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: jobStatus("status").notNull().default("pending"),
    progress: jsonb("progress").default(sql`'[]'::jsonb`),
    payload: jsonb("payload"),
    result: jsonb("result"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("jobs_workspace_id_idx").on(table.workspaceId),
    index("jobs_workspace_status_idx").on(table.workspaceId, table.status),
  ],
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
