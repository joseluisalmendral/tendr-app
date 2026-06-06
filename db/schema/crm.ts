import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { authUsers } from "drizzle-orm/supabase";

import { caseStatus, clientStatus } from "./enums";
import { workspaces } from "./workspaces";

/**
 * Core CRM tables: clients, cases, notes.
 *
 * Every table carries workspace_id NOT NULL FK -> workspaces ON DELETE CASCADE
 * (the RLS tenant anchor). All workspace_id and FK columns are indexed (M1);
 * hot-path composite indexes back the list/board queries that already filter
 * by the RLS column.
 */

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    company: text("company"),
    tags: text("tags")
      .array()
      .default(sql`'{}'`),
    status: clientStatus("status").default("active"),
    // Written by the summarize(clientId) Server Action (F7); read by
    // adaptTemplate. Nullable until the first summary exists.
    notesSummary: text("notes_summary"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("clients_workspace_id_idx").on(table.workspaceId)],
);

export const cases = pgTable(
  "cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: caseStatus("status").default("prospect"),
    valueCents: integer("value_cents"),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    // updated_by (N1): consumed client-side as the F5 Realtime self-echo filter.
    updatedBy: uuid("updated_by").references(() => authUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("cases_workspace_id_idx").on(table.workspaceId),
    index("cases_client_id_idx").on(table.clientId),
    // Board/list queries filter by workspace + status.
    index("cases_workspace_status_idx").on(table.workspaceId, table.status),
  ],
);

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "cascade",
    }),
    caseId: uuid("case_id").references(() => cases.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notes_workspace_id_idx").on(table.workspaceId),
    index("notes_client_id_idx").on(table.clientId),
    index("notes_case_id_idx").on(table.caseId),
    // A note must attach to at least a client or a case (M3).
    check(
      "notes_client_or_case_check",
      sql`${table.clientId} is not null or ${table.caseId} is not null`,
    ),
  ],
);

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
