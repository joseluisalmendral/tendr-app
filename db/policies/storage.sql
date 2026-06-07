-- ============================================================================
-- F6 storage.sql — private `documents` bucket + workspace-scoped object policies
-- ============================================================================
-- Storage RLS lives on `storage.objects`, NOT in the Drizzle schema, so it is
-- versioned here and applied to the LOCAL stack via `pnpm db:storage`
-- (db/policies/apply-storage.ts, privileged connection — same pattern as
-- db/migrate.ts). This file is idempotent so re-running is safe.
--
-- Object path convention (storage-upload action): {workspace_id}/{client_id}/{document_id}.pdf
-- so `(storage.foldername(name))[1]` is the owning workspace_id. Tenancy is the
-- F3 WS predicate — the first path segment must resolve to a workspace the
-- caller owns — NEVER the role alone (`to authenticated` is authn, not authz).
--
-- Policy set: SELECT + INSERT + UPDATE + DELETE. INSERT+UPDATE+SELECT are the
-- upsert triple (Supabase Storage gotcha: file replacement needs all three even
-- though the action uploads with upsert:false today, so a future replace path
-- does not silently fail). DELETE supports compensating removal / cleanup.
-- ============================================================================

-- Private bucket: never public. Re-runnable via ON CONFLICT.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do update set public = excluded.public;

-- Drop-and-recreate keeps the file idempotent without IF NOT EXISTS races.
drop policy if exists "documents_objects_select_own_workspace" on storage.objects;
drop policy if exists "documents_objects_insert_own_workspace" on storage.objects;
drop policy if exists "documents_objects_update_own_workspace" on storage.objects;
drop policy if exists "documents_objects_delete_own_workspace" on storage.objects;

-- SELECT: a caller may read an object only when its first path segment is a
-- workspace the caller owns. Cross-workspace reads return zero rows (denied).
create policy "documents_objects_select_own_workspace"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (
      select id::text from public.workspaces
      where owner_id = (select auth.uid())
    )
  );

-- INSERT: the uploaded object's first path segment must be the caller's
-- workspace, so a user cannot write into another tenant's prefix.
create policy "documents_objects_insert_own_workspace"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (
      select id::text from public.workspaces
      where owner_id = (select auth.uid())
    )
  );

-- UPDATE: USING + WITH CHECK with the identical predicate so an object can
-- neither be read-for-update from another tenant nor moved into one.
create policy "documents_objects_update_own_workspace"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (
      select id::text from public.workspaces
      where owner_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (
      select id::text from public.workspaces
      where owner_id = (select auth.uid())
    )
  );

-- DELETE: same WS predicate. Supports the compensating Storage.remove on tx
-- failure and future cleanup of expired documents.
create policy "documents_objects_delete_own_workspace"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (
      select id::text from public.workspaces
      where owner_id = (select auth.uid())
    )
  );
