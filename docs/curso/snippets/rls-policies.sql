-- RLS policies de referencia para Tendr SaaS · F3
--
-- Dos buenas prácticas de Supabase aplicadas en TODAS las policies:
--
-- 1. `(select auth.uid())` en vez de `auth.uid()` directo. Envolver la llamada
--    en un subselect hace que Postgres la trate como initPlan: la evalúa UNA
--    vez por query y cachea el resultado, en lugar de re-evaluarla fila a fila.
--    En tablas grandes la diferencia de rendimiento es de órdenes de magnitud.
--
-- 2. `to authenticated` (o `to anon` donde aplique) en cada policy. Restringe
--    la evaluación al rol correcto y corta la policy antes de evaluar el USING
--    para roles que no aplican. Sustituye al `auth.role()` deprecado, que
--    además falla con anonymous sign-ins porque los usuarios anónimos también
--    llevan el rol Postgres `authenticated`.
--
-- Patrón obligatorio adicional: toda tabla con UPDATE policy necesita SELECT
-- policy para el mismo rol. Si no, UPDATE devuelve 0 rows silenciosamente. Y
-- cada UPDATE policy lleva USING + WITH CHECK, para que un usuario no pueda
-- reasignar workspace_id a otro workspace.
--
-- Nota sobre roles: en Tendr las sesiones anónimas y autenticadas comparten el
-- rol Postgres `authenticated` (el usuario anónimo lo es a nivel de Postgres).
-- Por eso las policies de datos usan `to authenticated`: cubren los dos estados
-- y el aislamiento real lo da el predicado por workspace_id, no el rol.

-- ============================================================================
-- Workspaces · el anchor del multi-tenancy
-- ============================================================================
alter table workspaces enable row level security;

create policy "workspaces_select_own"
  on workspaces for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "workspaces_insert_own"
  on workspaces for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "workspaces_update_own"
  on workspaces for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- DELETE deliberadamente no se expone al usuario (lo hace cascade desde
-- auth.users al borrar la cuenta).

-- ============================================================================
-- Plantilla aplicable a TODAS las tablas con workspace_id
-- (clients, cases, notes, documents, templates, jobs, subscriptions,
--  audit_log, ai_provider_configs, ai_feature_model_mapping, ai_usage_ledger)
-- ============================================================================
-- Repite este bloque cambiando el nombre de la tabla.

alter table clients enable row level security;

create policy "clients_select_own_workspace"
  on clients for select
  to authenticated
  using (workspace_id in (
    select id from workspaces where owner_id = (select auth.uid())
  ));

create policy "clients_insert_own_workspace"
  on clients for insert
  to authenticated
  with check (workspace_id in (
    select id from workspaces where owner_id = (select auth.uid())
  ));

create policy "clients_update_own_workspace"
  on clients for update
  to authenticated
  using (workspace_id in (
    select id from workspaces where owner_id = (select auth.uid())
  ))
  with check (workspace_id in (
    select id from workspaces where owner_id = (select auth.uid())
  ));

create policy "clients_delete_own_workspace"
  on clients for delete
  to authenticated
  using (workspace_id in (
    select id from workspaces where owner_id = (select auth.uid())
  ));

-- ============================================================================
-- ai_model_manifest · LECTURA PÚBLICA (manifest curado compartido)
-- ============================================================================
alter table ai_model_manifest enable row level security;

create policy "ai_model_manifest_public_read"
  on ai_model_manifest for select
  to authenticated
  using (true);

-- Sin policies INSERT/UPDATE/DELETE: solo service_role puede modificarlo.

-- ============================================================================
-- ai_provider_configs · gotcha de seguridad CRÍTICO
-- ============================================================================
-- La columna encrypted_key NO debe ser accesible desde el cliente.
-- Las Server Actions y Inngest functions usan service_role para descifrar.
-- Esta policy SELECT está aquí para que el WORKSPACE OWNER pueda VER QUÉ
-- providers tiene configurados (existencia de la row, key_validated_at,
-- last_used_at), pero la columna encrypted_key se filtra a nivel aplicación
-- en cada SELECT del cliente (helper db.select({campo: ..., campo: ...})).
--
-- NUNCA hacer `select * from ai_provider_configs` desde el cliente.

alter table ai_provider_configs enable row level security;

create policy "ai_provider_configs_select_own_workspace"
  on ai_provider_configs for select
  to authenticated
  using (workspace_id in (
    select id from workspaces where owner_id = (select auth.uid())
  ));

create policy "ai_provider_configs_insert_own_workspace"
  on ai_provider_configs for insert
  to authenticated
  with check (workspace_id in (
    select id from workspaces where owner_id = (select auth.uid())
  ));

create policy "ai_provider_configs_update_own_workspace"
  on ai_provider_configs for update
  to authenticated
  using (workspace_id in (
    select id from workspaces where owner_id = (select auth.uid())
  ))
  with check (workspace_id in (
    select id from workspaces where owner_id = (select auth.uid())
  ));

create policy "ai_provider_configs_delete_own_workspace"
  on ai_provider_configs for delete
  to authenticated
  using (workspace_id in (
    select id from workspaces where owner_id = (select auth.uid())
  ));

-- ============================================================================
-- audit_log · solo lectura propia + INSERT desde service_role
-- ============================================================================
alter table audit_log enable row level security;

create policy "audit_log_select_own_workspace"
  on audit_log for select
  to authenticated
  using (workspace_id in (
    select id from workspaces where owner_id = (select auth.uid())
  ));

-- INSERT solo desde Server Actions con service_role (audit_log es append-only
-- y nadie debería poder modificarlo desde el cliente).
