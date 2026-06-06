import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { workspaces } from "./workspaces";

/**
 * Templates — markdown bodies with the F7 AI adapter.
 *
 * workspace_id NOT NULL is the RLS anchor; updated_at auto-touches at the app
 * layer via $onUpdate (M4).
 */
export const templates = pgTable(
  "templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    bodyMarkdown: text("body_markdown").notNull(),
    variables: text("variables")
      .array()
      .default(sql`'{}'`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("templates_workspace_id_idx").on(table.workspaceId)],
);

export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;
