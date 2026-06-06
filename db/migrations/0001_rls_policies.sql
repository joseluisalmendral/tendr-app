-- ============================================================================
-- 0001_rls_policies — per-workspace Row Level Security, column REVOKE, Realtime
-- ============================================================================
-- This is the SINGLE auditable tenant-isolation surface for Tendr. The TS
-- schema stays purely structural; all RLS lives here.
--
-- Invariants applied to EVERY data policy (see design):
--   a) initplan pattern `(select auth.uid())` — evaluated once per query.
--   b) `to authenticated` on every policy — covers signed-in AND anonymous
--      sessions (anon carries the `authenticated` Postgres role); real
--      isolation is the workspace_id/owner_id predicate, never the role.
--   d) every UPDATE policy carries USING + WITH CHECK with the identical
--      predicate so a row can neither be stolen (USING) nor pushed into
--      another tenant (WITH CHECK).
--   e) service_role (SUPABASE_SECRET_KEY) bypasses RLS by design — the write
--      path for Inngest, Stripe, audit inserts, the F6 extractor and manifest
--      curation. These policies govern the USER (anon/authenticated) session.
--
-- Predicate legend:
--   OWN = owner_id = (select auth.uid())                       [workspaces]
--   WS  = workspace_id in (select id from workspaces
--                          where owner_id = (select auth.uid())) [child tables]
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enable RLS on all 14 tables
-- ----------------------------------------------------------------------------
alter table "workspaces" enable row level security;--> statement-breakpoint
alter table "clients" enable row level security;--> statement-breakpoint
alter table "cases" enable row level security;--> statement-breakpoint
alter table "notes" enable row level security;--> statement-breakpoint
alter table "documents" enable row level security;--> statement-breakpoint
alter table "templates" enable row level security;--> statement-breakpoint
alter table "jobs" enable row level security;--> statement-breakpoint
alter table "subscriptions" enable row level security;--> statement-breakpoint
alter table "audit_log" enable row level security;--> statement-breakpoint
alter table "ai_provider_configs" enable row level security;--> statement-breakpoint
alter table "ai_feature_model_mapping" enable row level security;--> statement-breakpoint
alter table "ai_usage_ledger" enable row level security;--> statement-breakpoint
alter table "ai_model_manifest" enable row level security;--> statement-breakpoint
alter table "stripe_webhook_events" enable row level security;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 2. workspaces — OWN predicate; SELECT/INSERT/UPDATE, no user DELETE
--    (DELETE happens via cascade from auth.users on account deletion).
-- ----------------------------------------------------------------------------
create policy "workspaces_select_own" on "workspaces" for select to authenticated
  using (owner_id = (select auth.uid()));--> statement-breakpoint
create policy "workspaces_insert_own" on "workspaces" for insert to authenticated
  with check (owner_id = (select auth.uid()));--> statement-breakpoint
create policy "workspaces_update_own" on "workspaces" for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 3. clients — full WS template (SELECT/INSERT/UPDATE/DELETE)
-- ----------------------------------------------------------------------------
create policy "clients_select_own_workspace" on "clients" for select to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint
create policy "clients_insert_own_workspace" on "clients" for insert to authenticated
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint
create policy "clients_update_own_workspace" on "clients" for update to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())))
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint
create policy "clients_delete_own_workspace" on "clients" for delete to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 4. cases — full WS template
-- ----------------------------------------------------------------------------
create policy "cases_select_own_workspace" on "cases" for select to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint
create policy "cases_insert_own_workspace" on "cases" for insert to authenticated
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint
create policy "cases_update_own_workspace" on "cases" for update to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())))
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint
create policy "cases_delete_own_workspace" on "cases" for delete to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 5. notes — full WS template
-- ----------------------------------------------------------------------------
create policy "notes_select_own_workspace" on "notes" for select to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint
create policy "notes_insert_own_workspace" on "notes" for insert to authenticated
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint
create policy "notes_update_own_workspace" on "notes" for update to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())))
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint
create policy "notes_delete_own_workspace" on "notes" for delete to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 6. documents — full WS template
-- ----------------------------------------------------------------------------
create policy "documents_select_own_workspace" on "documents" for select to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint
create policy "documents_insert_own_workspace" on "documents" for insert to authenticated
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint
create policy "documents_update_own_workspace" on "documents" for update to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())))
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint
create policy "documents_delete_own_workspace" on "documents" for delete to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 7. templates — full WS template
-- ----------------------------------------------------------------------------
create policy "templates_select_own_workspace" on "templates" for select to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint
create policy "templates_insert_own_workspace" on "templates" for insert to authenticated
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint
create policy "templates_update_own_workspace" on "templates" for update to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())))
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint
create policy "templates_delete_own_workspace" on "templates" for delete to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 8. jobs — DEVIATION: SELECT + INSERT only. Inngest advances status/result
--    via service_role; users never UPDATE/DELETE jobs.
-- ----------------------------------------------------------------------------
create policy "jobs_select_own_workspace" on "jobs" for select to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint
create policy "jobs_insert_own_workspace" on "jobs" for insert to authenticated
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 9. subscriptions — DEVIATION: SELECT only. Stripe webhook writes via
--    service_role.
-- ----------------------------------------------------------------------------
create policy "subscriptions_select_own_workspace" on "subscriptions" for select to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 10. audit_log — DEVIATION: SELECT only (append-only; service_role inserts).
--     workspace_id nullable (N4): SET NULL rows are invisible to users by
--     design — the predicate `workspace_id in (...)` never matches NULL.
-- ----------------------------------------------------------------------------
create policy "audit_log_select_own_workspace" on "audit_log" for select to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 11. ai_provider_configs — full WS template + column REVOKE (M6, section 16)
-- ----------------------------------------------------------------------------
create policy "ai_provider_configs_select_own_workspace" on "ai_provider_configs" for select to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint
create policy "ai_provider_configs_insert_own_workspace" on "ai_provider_configs" for insert to authenticated
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint
create policy "ai_provider_configs_update_own_workspace" on "ai_provider_configs" for update to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())))
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint
create policy "ai_provider_configs_delete_own_workspace" on "ai_provider_configs" for delete to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 12. ai_feature_model_mapping — full WS template
-- ----------------------------------------------------------------------------
create policy "ai_feature_model_mapping_select_own_workspace" on "ai_feature_model_mapping" for select to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint
create policy "ai_feature_model_mapping_insert_own_workspace" on "ai_feature_model_mapping" for insert to authenticated
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint
create policy "ai_feature_model_mapping_update_own_workspace" on "ai_feature_model_mapping" for update to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())))
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint
create policy "ai_feature_model_mapping_delete_own_workspace" on "ai_feature_model_mapping" for delete to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 13. ai_usage_ledger — DEVIATION: SELECT + INSERT only (immutable ledger).
--     Sync Server Actions insert under the user session; F6 extractor inserts
--     via service_role. No UPDATE/DELETE.
-- ----------------------------------------------------------------------------
create policy "ai_usage_ledger_select_own_workspace" on "ai_usage_ledger" for select to authenticated
  using (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint
create policy "ai_usage_ledger_insert_own_workspace" on "ai_usage_ledger" for insert to authenticated
  with check (workspace_id in (select id from workspaces where owner_id = (select auth.uid())));--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 14. ai_model_manifest — public read (curated shared catalog). using(true)
--     for authenticated; no INSERT/UPDATE/DELETE policies => writes only via
--     service_role.
-- ----------------------------------------------------------------------------
create policy "ai_model_manifest_public_read" on "ai_model_manifest" for select to authenticated
  using (true);--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 15. stripe_webhook_events — DENY-ALL: RLS on, ZERO policies. No user-session
--     access at all; service_role bypasses RLS for idempotent webhook writes.
--     (RLS-on/zero-policies silences the Supabase "RLS disabled" advisor.)
-- ----------------------------------------------------------------------------
-- (no policies by design)

-- ----------------------------------------------------------------------------
-- 16. M6 — column-level SELECT allowlist on ai_provider_configs.
--     RLS is row-level; column secrecy needs column GRANT/REVOKE, which
--     PostgREST honors. Supabase grants a TABLE-WIDE `select` to authenticated
--     and anon by default — a bare column REVOKE against that wide grant is a
--     NO-OP. So we first REVOKE the table-wide select, then GRANT select only
--     on the non-secret column allowlist. The envelope columns (encrypted_key,
--     key_iv, key_tag, encrypted_dek) are deliberately excluded, so any
--     user-session select touching them ERRORS (no silent leak). service_role
--     is untouched and reads all columns for decryption in Server Actions /
--     Inngest. INSERT/UPDATE/DELETE table grants are left intact so RLS still
--     governs writes (the user writes the encrypted blob it produced).
-- ----------------------------------------------------------------------------
revoke select on "ai_provider_configs" from authenticated, anon;--> statement-breakpoint
grant select (id, workspace_id, provider, key_validated_at, last_used_at, created_at)
  on "ai_provider_configs" to authenticated, anon;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 17. N5 — Realtime publication + replica identity for cases and jobs.
--     REPLICA IDENTITY FULL makes UPDATE/DELETE change events carry the full
--     OLD row (required for Realtime RLS row filtering and complete payloads).
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table "cases";--> statement-breakpoint
alter publication supabase_realtime add table "jobs";--> statement-breakpoint
alter table "cases" replica identity full;--> statement-breakpoint
alter table "jobs" replica identity full;