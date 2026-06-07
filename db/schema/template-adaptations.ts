import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { clients } from "./crm";
import { templates } from "./templates";
import { workspaces } from "./workspaces";

/**
 * template_adaptations — persisted AI adaptations of a template for a client
 * (F7c finding 3, decisions #775).
 *
 * Each row is the full streamed `result_text` of one adaptTemplate run, linked
 * to the workspace + template + client so the adapt dialog can show a per
 * (template, client) history with a copy button (PR-F7C-3b consumes the read
 * helper) and the user can delete individual entries.
 *
 * Tenancy / RLS:
 *   - workspace_id NOT NULL FK -> workspaces ON DELETE CASCADE is the RLS
 *     anchor (mirrors every other workspace-scoped table). When a workspace is
 *     deleted, its adaptations cascade away.
 *   - template_id / client_id FK ON DELETE CASCADE: an adaptation has no
 *     meaning once its template or client is gone, so it is removed with them.
 *     This matches `documents` (client_id cascade) and `cases` (client_id
 *     cascade) — adaptations are derived child data, not independently
 *     retained history.
 *   - FULL deep RLS (SELECT/INSERT/UPDATE/DELETE) scoped by workspace_id lives
 *     in migration 0005 (the project keeps all policies in hand-authored SQL).
 *
 * Indexes back the two read paths the UI needs: list by (workspace, client) and
 * list by (workspace, template), both newest-first.
 *
 * F7c PR-F7C-4a (beautify_email) PRE-PROVISIONING — DECISION (plan-beautify
 * #778): the 5 nullable email columns below (beautified_*) are created NOW,
 * empty, so PR-F7C-4a only has to populate them (an enum ADD VALUE migration in
 * its own file) and never needs a second ALTER on this table. #778 explicitly
 * sanctions pre-creating them here. They are NULL until a beautified email is
 * generated for the adaptation; NULL = "not yet beautified". They inherit this
 * table's RLS (the UPDATE policy in 0005 covers writing them) and carry no
 * column allowlist, so no extra GRANT is needed when 4a writes them.
 */
export const templateAdaptations = pgTable(
  "template_adaptations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    // The full streamed adaptation. PII (client text) lives here under the
    // workspace's RLS — acceptable, same tenancy as the source notes/cases.
    resultText: text("result_text").notNull(),
    // Optional free-text steering the user typed in the adapt dialog. Bounded
    // at the seam (Zod max length) before it reaches the model + this row.
    extraInstructions: text("extra_instructions"),
    provider: text("provider"),
    modelId: text("model_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    // --- PR-F7C-4a beautify_email pre-provisioned columns (all nullable) ---
    beautifiedHtml: text("beautified_html"),
    emailSubject: text("email_subject"),
    emailPreheader: text("email_preheader"),
    beautifiedPalette: text("beautified_palette"),
    beautifiedAt: timestamp("beautified_at", { withTimezone: true }),
  },
  (table) => [
    index("template_adaptations_workspace_client_idx").on(
      table.workspaceId,
      table.clientId,
    ),
    index("template_adaptations_workspace_template_idx").on(
      table.workspaceId,
      table.templateId,
    ),
  ],
);

export type TemplateAdaptation = typeof templateAdaptations.$inferSelect;
export type NewTemplateAdaptation = typeof templateAdaptations.$inferInsert;
