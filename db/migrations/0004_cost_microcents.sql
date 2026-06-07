-- ============================================================================
-- 0004_cost_microcents — sub-cent USD precision for the AI usage ledger
-- ============================================================================
-- F7c finding 1: the ledger stored whole `cost_cents` rounded UP per call, so a
-- real $0.013303 generation billed as $0.03 and the UI mislabelled USD as EUR.
-- We add `cost_microcents` (USD * 10000 -> $0.0001 granularity), keep money in
-- integers (no float drift in SUM, indexable, matches the existing integer
-- discipline) and stop the per-call ceil so the figure matches Langfuse.
--
-- Transition strategy (dual-write, design call 1):
--   - ADD the column NULLABLE first.
--   - BACKFILL every existing row from the legacy `cost_cents`
--     (cost_microcents = cost_cents * 10000) so historical spend is preserved
--     exactly at cent granularity.
--   - SET NOT NULL once every row has a value.
-- `cost_cents` is KEPT and dual-written by the application this change; a later
-- cleanup migration can drop it once all reads use microcents.
--
-- RLS: `ai_usage_ledger` is SELECT+INSERT-only for users (0001_rls_policies);
-- a column ADD inherits the table policies, so no policy change is needed. The
-- ledger has NO column allowlist (only ai_provider_configs revokes columns), so
-- no GRANT change is required for the new column either.
--
-- The monthly rollup index (ai_usage_ledger_workspace_month_idx) is unchanged:
-- it indexes (workspace_id, date_trunc('month', created_at at time zone 'UTC'))
-- and does not reference the cost columns.
-- ============================================================================

alter table "ai_usage_ledger" add column "cost_microcents" bigint;--> statement-breakpoint

update "ai_usage_ledger" set "cost_microcents" = "cost_cents"::bigint * 10000 where "cost_microcents" is null;--> statement-breakpoint

alter table "ai_usage_ledger" alter column "cost_microcents" set not null;
