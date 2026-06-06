# Clase 3 — Scaffolding, modelo de datos y RLS

Fase fundacional de datos: del repo sin `package.json` a un schema de 14
tablas con aislamiento multi-tenant probado contra infraestructura real,
aplicado en local y en `tendr-app-dev`.

## Qué se construyó

- **Scaffolding**: Next.js 16.2.7 (App Router, TS, Tailwind 4, sin `src/`),
  pnpm 11 con settings de seguridad en `pnpm-workspace.yaml`
  (`strictDepBuilds`, `minimumReleaseAge` 24h, `blockExoticSubdeps`,
  `auditLevel high`, `preferFrozenLockfile`), shadcn/ui `radix-maia` con
  iconos Phosphor.
- **Schema Drizzle** (`db/schema/`, por dominio): 10 tablas core + 4 de IA,
  `pgEnum` para sets cerrados, tipos estrictos, índices en todas las FKs y
  compuestos por patrón de uso (`cases(workspace_id, status)` para el Kanban).
- **Migraciones**: `0000` estructural (generada) + `0001` de seguridad
  (artesanal, registrada en el journal): 38 policies RLS, REVOKE a nivel
  columna, publication de Realtime + `REPLICA IDENTITY FULL` en
  `cases`/`jobs`.
- **Seed del manifest IA**: 12 modelos de 5 providers con precios verificados
  a junio 2026 (no knowledge cutoff) y defaults por feature.
- **Suite de RLS**: 30 tests contra Supabase local real, sin mocks
  (detalle completo en `db/__tests__/README.md`).

## Decisiones clave

| Decisión | Razón |
|---|---|
| SDD solo para datos/RLS; scaffolding directo | Rigor donde está el riesgo, velocidad en lo mecánico |
| Todo el perímetro de seguridad en una sola migración SQL | Drizzle 0.45 no expresa REVOKE de columnas ni publications; dos fuentes de verdad invitan al drift |
| Policies divergentes del template por tabla (`jobs` S+I, `subscriptions`/`audit_log` solo SELECT, `ai_usage_ledger` S+I) | Dar las 4 policies a todas permitiría auto-asignarse plan Pro o falsear el audit trail |
| Keys nuevas de Supabase (`sb_publishable_`/`sb_secret_`) | Las legacy `anon`/`service_role` mueren a finales de 2026 |
| `workspaces.owner_id` UNIQUE + ON DELETE CASCADE | El 1:1 user→workspace de F4 y el borrado de cuenta no estaban garantizados por el DDL del guion |
| `audit_log` con `ON DELETE SET NULL` | El audit trail sobrevive al borrado del workspace |
| Sin branch `dev` de Supabase | Branching requiere plan Pro; seguimos local + `tendr-app-dev` |

## Descubrimientos (gotchas reales de esta clase)

1. **pnpm 11**: los settings ya no van en `.npmrc` (auth/registry only);
   `strictDepBuilds` exige `allowBuilds` explícito por paquete.
2. **`REVOKE SELECT (cols)` a secas es un no-op** frente al GRANT de tabla
   de Supabase → REVOKE total + GRANT de allowlist.
3. **UPDATE sin policy SELECT devuelve 0 filas en silencio** → toda tabla
   con UPDATE lleva SELECT del mismo rol + `USING`/`WITH CHECK`.
4. **`date_trunc` sobre `timestamptz` no es IMMUTABLE** → índice mensual
   del ledger con `AT TIME ZONE 'UTC'`.
5. Un stub ingenuo de `auth.users` hace que drizzle-kit emita
   `CREATE SCHEMA auth` → `authUsers` de `drizzle-orm/supabase` +
   `schemaFilter`.
6. El preset Maia trae HugeIcons, no Phosphor; `next lint` ya no existe en
   Next 16; la familia Gemini 2.0 fue apagada el 2026-06-01 (el seed del
   guion la referenciaba).
7. En remoto vivía `rls_auto_enable()` SECURITY DEFINER ejecutable por
   `anon` (legado de F2) → `REVOKE EXECUTE`, conservando el event trigger.

## Estado al cierre

- `pnpm build`, `pnpm typecheck` y `pnpm test` (30/30) verdes.
- Migraciones + seed aplicados a `tendr-app-dev`; advisors limpios
  (solo el INFO esperado del deny-all de `stripe_webhook_events`).
- Scripts de CI listos: `test`, `lint`, `typecheck`.
- Verify SDD con contexto fresco: gate **GREEN**, 0 critical, 0 warnings.
