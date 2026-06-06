-- ============================================================================
-- 0002_log_promotion — append-only promotion audit via SECURITY DEFINER RPC
-- ============================================================================
-- Anonymous → authenticated promotion writes ONE audit_log row through this
-- function. audit_log has no user INSERT policy by design (F3): the only write
-- path is service_role or a SECURITY DEFINER function. This RPC is that path
-- for the promotion event, constrained to inserting the CALLER's own row.
--
-- Security invariants (see supabase SKILL.md SECURITY DEFINER guidance):
--   - SECURITY DEFINER runs with the owner's (postgres) privileges → bypasses
--     RLS, so the body MUST gate on auth.uid() (no caller-supplied identity).
--   - `set search_path = ''` prevents schema hijack; every object is
--     fully-qualified (public.*, auth.*).
--   - EXECUTE is REVOKED from PUBLIC and GRANTED to `authenticated` ONLY.
--     Postgres grants EXECUTE to PUBLIC by default, but Supabase ALSO sets
--     ALTER DEFAULT PRIVILEGES that grant EXECUTE explicitly to anon,
--     authenticated and service_role. `revoke from public` does NOT remove
--     those explicit grants, so we revoke from anon and service_role
--     explicitly too — otherwise anon would still be able to call it.
--   - NO direct INSERT policy/grant on audit_log is created here — append-only
--     stays mediated solely through this function. service_role stays forbidden
--     in app runtime per F3 policy.
-- ============================================================================

create or replace function public.log_promotion()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ws  uuid;
begin
  -- Authorization gate: the SECURITY DEFINER bypass is constrained to the
  -- caller's own row. No authenticated user → reject (also blocks anon, which
  -- has no auth.uid()).
  if v_uid is null then
    raise exception 'log_promotion: no authenticated user';
  end if;

  -- Best-effort workspace association for the audit row (1:1 owner_id).
  select id into v_ws from public.workspaces where owner_id = v_uid limit 1;

  insert into public.audit_log (action, actor_id, resource_type, resource_id, workspace_id, metadata)
  values ('promote_user', v_uid, 'user', v_uid, v_ws, '{}'::jsonb);
end;
$$;--> statement-breakpoint

revoke execute on function public.log_promotion() from public;--> statement-breakpoint
revoke execute on function public.log_promotion() from anon;--> statement-breakpoint
revoke execute on function public.log_promotion() from service_role;--> statement-breakpoint
grant execute on function public.log_promotion() to authenticated;
