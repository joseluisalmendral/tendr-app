import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { clients } from "./crm";
import { workspaces } from "./workspaces";

/**
 * Documents — Storage objects plus the F6 AI extractor output.
 *
 * expires_at is kept (N3); the cleanup job lives in F6. extracted_metadata is
 * populated by the extractor. workspace_id NOT NULL is the RLS anchor.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
    filename: text("filename").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    extractedMetadata: jsonb("extracted_metadata"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("documents_workspace_id_idx").on(table.workspaceId),
    index("documents_client_id_idx").on(table.clientId),
  ],
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
