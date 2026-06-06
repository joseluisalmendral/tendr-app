-- ============================================================================
-- 0003_move_case — atomic case status move + audit via SECURITY DEFINER RPC
-- ============================================================================
-- A kanban drag changes a case's status. This RPC performs the status UPDATE
-- and the append-only audit_log INSERT in ONE transaction so they succeed or
-- fail together — there is no window where the status moved but the audit row
-- is missing (or vice versa). The simpler two-call path (RLS UPDATE then a
-- separate log RPC) can leave a half-state if the second call fails; this
-- single function avoids that and validates ownership exactly once.
--
-- Security invariants (see supabase SKILL.md SECURITY DEFINER guidance and the
-- 0002_log_promotion precedent):
--   - SECURITY DEFINER runs with the owner's (postgres) privileges → bypasses
--     RLS, so the body MUST gate on auth.uid() and on the case belonging to the
--     caller's own workspace. No caller-supplied identity is trusted.
--   - `set search_path = ''` prevents schema hijack; every object is
--     fully-qualified (public.*, auth.*).
--   - EXECUTE is REVOKED from PUBLIC and GRANTED to `authenticated` ONLY.
--     Postgres grants EXECUTE to PUBLIC by default, and Supabase ALSO sets
--     ALTER DEFAULT PRIVILEGES that grant EXECUTE explicitly to anon,
--     authenticated and service_role. `revoke from public` does NOT remove
--     those explicit grants, so we revoke from anon and service_role
--     explicitly too — otherwise anon would still be able to call it.
--   - The UPDATE inside the function is NOT RLS-protected (DEFINER bypass); the
--     function's internal ownership gate IS the protection. This runs under the
--     USER's identity (auth.uid()), NOT service_role, so the "ZERO service_role
--     in Server Actions" rule holds — moveCase only calls this RPC.
--
-- `cases` is ALREADY in the `supabase_realtime` publication with REPLICA
-- IDENTITY FULL (0001_rls_policies §17), so this migration does NOT touch the
-- publication; the kanban Realtime hook (batch 2) relies on that existing setup.
-- ============================================================================

create or replace function public.move_case(
  p_case_id uuid,
  p_to_status public.case_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_ws      uuid;
  v_from    public.case_status;
  v_case_ws uuid;
begin
  -- Authorization gate 1: require an authenticated caller (also blocks anon,
  -- which has no auth.uid()).
  if v_uid is null then
    raise exception 'move_case: no authenticated user';
  end if;

  -- Resolve the caller's workspace (1:1 owner_id → workspace).
  select id into v_ws from public.workspaces where owner_id = v_uid limit 1;
  if v_ws is null then
    raise exception 'move_case: no workspace';
  end if;

  -- Authorization gate 2: the case must exist AND belong to the caller's
  -- workspace. A foreign or non-existent case id is rejected — no status
  -- change, no audit row. This is the SECURITY DEFINER bypass's protection.
  select status, workspace_id
    into v_from, v_case_ws
    from public.cases
   where id = p_case_id;
  if v_case_ws is null or v_case_ws <> v_ws then
    raise exception 'move_case: case not in caller workspace';
  end if;

  -- Atomic: update status + provenance, then append the audit row. Both run in
  -- the function's single transaction.
  update public.cases
     set status     = p_to_status,
         updated_by = v_uid,
         updated_at = now()
   where id = p_case_id;

  insert into public.audit_log (action, actor_id, resource_type, resource_id, workspace_id, metadata)
  values (
    'move_case',
    v_uid,
    'case',
    p_case_id,
    v_ws,
    jsonb_build_object('from', v_from, 'to', p_to_status)
  );
end;
$$;--> statement-breakpoint

revoke execute on function public.move_case(uuid, public.case_status) from public;--> statement-breakpoint
revoke execute on function public.move_case(uuid, public.case_status) from anon;--> statement-breakpoint
revoke execute on function public.move_case(uuid, public.case_status) from service_role;--> statement-breakpoint
grant execute on function public.move_case(uuid, public.case_status) to authenticated;
