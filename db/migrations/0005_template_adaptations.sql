-- ============================================================================
-- 0005_template_adaptations — persisted AI template adaptations + full deep RLS
-- ============================================================================
-- F7c finding 3 (decisions #775): adaptTemplate now PERSISTS each adaptation
-- linked to (workspace, template, client) so the adapt dialog can show a per
-- (template, client) history + copy button and the user can delete entries.
--
-- This migration:
--   1. CREATEs the table (mirrors the structural db/schema definition). The 5
--      nullable beautified_* columns are PRE-PROVISIONED for PR-F7C-4a
--      (beautify_email) per plan-beautify #778 so 4a needs no second ALTER on
--      this table.
--   2. CREATEs the two hot-path lookup indexes.
--   3. Enables RLS and installs the FULL WS template
--      (SELECT/INSERT/UPDATE/DELETE) scoped by workspace_id — the same deep-RLS
--      surface every workspace-owned table carries (0001 invariants a/b/d/e).
--
-- RLS invariants (identical to 0001):
--   a) initplan `(select auth.uid())` — evaluated once per query.
--   b) `to authenticated` on every policy (anon carries the authenticated role;
--      isolation is the workspace_id predicate, never the role).
--   d) the UPDATE policy carries USING + WITH CHECK with the identical
--      predicate so a row can neither be stolen nor pushed to another tenant.
--   e) service_role bypasses RLS — the onFinish persist runs under the user
--      session (RLS-bound) per design; the explicit eq(workspaceId) gate plus
--      these policies are belt-and-suspenders tenancy.
--
-- No column allowlist (only ai_provider_configs revokes columns); result_text
-- is the user's own client PII under their workspace RLS — acceptable.
-- ============================================================================

CREATE TABLE "template_adaptations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"result_text" text NOT NULL,
	"extra_instructions" text,
	"provider" text,
	"model_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"beautified_html" text,
	"email_subject" text,
	"email_preheader" text,
	"beautified_palette" text,
	"beautified_at" timestamp with time zone
);
--> statement-breakpoint

ALTER TABLE "template_adaptations"
	ADD CONSTRAINT "template_adaptations_workspace_id_workspaces_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
	ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "template_adaptations"
	ADD CONSTRAINT "template_adaptations_template_id_templates_id_fk"
	FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id")
	ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "template_adaptations"
	ADD CONSTRAINT "template_adaptations_client_id_clients_id_fk"
	FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
	ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "template_adaptations_workspace_client_idx"
	ON "template_adaptations" USING btree ("workspace_id","client_id");--> statement-breakpoint

CREATE INDEX "template_adaptations_workspace_template_idx"
	ON "template_adaptations" USING btree ("workspace_id","template_id");--> statement-breakpoint

-- Full deep RLS (SELECT/INSERT/UPDATE/DELETE), WS template.
ALTER TABLE "template_adaptations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "template_adaptations_select_own_workspace" ON "template_adaptations" FOR SELECT TO authenticated
	USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "template_adaptations_insert_own_workspace" ON "template_adaptations" FOR INSERT TO authenticated
	WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "template_adaptations_update_own_workspace" ON "template_adaptations" FOR UPDATE TO authenticated
	USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = (SELECT auth.uid())))
	WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = (SELECT auth.uid())));--> statement-breakpoint
CREATE POLICY "template_adaptations_delete_own_workspace" ON "template_adaptations" FOR DELETE TO authenticated
	USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = (SELECT auth.uid())));
