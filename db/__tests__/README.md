# Tests de RLS — qué se prueba, cómo y por qué este sistema

Suite de 30 tests (5 archivos) que verifica el aislamiento multi-tenant por
`workspace_id` contra un stack de Supabase **local y real** (Postgres + Auth +
PostgREST), con dos usuarios reales y sus JWTs reales. Ninguna aserción usa
`service_role`. La fase F3 no se dio por cerrada hasta que esta suite estuvo
verde por razones reales (gate GREEN del verify, 2026-06-06).

## Ejecución rápida

1. `supabase start` (requiere Docker; levanta Postgres + Auth + Studio locales)
2. `pnpm db:migrate` con `DATABASE_URL` apuntando al Postgres local (aplica `0000` + `0001`)
3. `pnpm test` → esperado: `Test Files 5 passed · Tests 30 passed`

Las credenciales locales se leen en runtime de `supabase status -o env`;
no hay credenciales en archivos commiteados ni variables que apunten a remoto.

## Sistema propuesto (guion del curso) vs sistema implementado

| Aspecto | Propuesta original | Implementado | Por qué |
|---|---|---|---|
| Estructura | Un solo `rls.test.ts` | 5 archivos temáticos + `setup.ts` | Cada archivo cubre una dimensión de fallo; más fácil de auditar |
| Cobertura | `clients` y `cases` | Las 14 tablas de la matriz RLS | El aislamiento se rompe por la tabla que no testeaste |
| Creación de usuarios | `signUp` con dos emails | `auth.admin.createUser` confirmado + `signInWithPassword` real | `signUp` depende de la config de confirmación de email del stack (test frágil); admin solo se usa para fixtures |
| `service_role` | Prohibido en todo | Prohibido en **aserciones**; permitido en fixtures/teardown | Lo que prueba seguridad es la credencial con la que consultas, no con la que creaste el usuario |
| Punto 6 (envelope) | `encrypted_key` no legible por no-owner | No legible por **ningún** rol API, owner incluido | El REVOKE a nivel columna (M6) es más fuerte que el aislamiento por fila |
| Scripts | `"lint": "next lint"` | `"lint": "eslint"` | `next lint` fue eliminado en Next.js 16 |

Conclusión registrada: la propuesta era el plan correcto; el sistema
implementado es un superconjunto estricto. No se reescribió nada.

## Qué se prueba (por archivo)

| Archivo | Verifica |
|---|---|
| `rls-isolation.test.ts` | A ve 0 filas de B en **todas** las tablas con `workspace_id`; A no puede INSERT/UPDATE/DELETE en el workspace de B (la fila de B sobrevive) |
| `rls-gotcha.test.ts` | El gotcha UPDATE-sin-SELECT: un UPDATE cross-tenant devuelve **0 filas sin error** y el test lo detecta; `WITH CHECK` rechaza reasignar `workspace_id`/`owner_id` a otro tenant |
| `rls-columns.test.ts` | Las 4 columnas envelope de `ai_provider_configs` (`encrypted_key`, `key_iv`, `key_tag`, `encrypted_dek`) no son seleccionables por `authenticated`/`anon` — `select *` falla; `service_role` sí las lee |
| `rls-deviations.test.ts` | Desviaciones conscientes del template: `jobs` sin UPDATE/DELETE de usuario; `subscriptions` y `audit_log` solo SELECT; `ai_usage_ledger` SELECT+INSERT propio y nada cross-tenant; `stripe_webhook_events` deny-all |
| `rls-anon-manifest.test.ts` | Las sesiones anónimas (rol PG `authenticated`) tienen el mismo aislamiento; `ai_model_manifest` es legible por cualquier workspace (lectura pública curada) |

## Contratos reales, no mocks

- Usuarios creados contra la **Auth API real**; login real → **JWT real** por tenant.
- Cada aserción viaja por **PostgREST real** con la publishable key + el JWT del
  usuario: la policy se evalúa en el Postgres real, no en un stub.
- Cero mocks, cero JWTs fabricados, cero aserciones leyendo el texto del SQL.
- El verify (contexto fresco) auditó la suite contra esta regla y además lanzó
  probes adversariales propias fuera de la suite (INSERT cross-tenant y
  reasignación de `workspace_id` vía SQL crudo con claims reales): bloqueadas.

## Estado de la base de datos después de los tests

- **Fixtures**: cada run crea 2 usuarios (`rls-a-<uuid>@example.test`, `rls-b-…`)
  con su workspace + cliente. El teardown borra los usuarios vía admin y el
  `ON DELETE CASCADE` de `workspaces.owner_id` (fix G4) arrastra workspace,
  clients, cases y todo lo colgado. **No queda residuo de fixtures.**
- **Lo que sí persiste**: el seed de `ai_model_manifest` (12 modelos) — es dato
  curado de la app, no fixture de test.
- **Remoto intocable por construcción**: las credenciales salen de
  `supabase status -o env` (stack local). La suite no puede apuntar a
  `tendr-app-dev` aunque `DATABASE_URL` remota exista en `.env.local`.
  Pendiente recomendado: `.env.test` local-only para que `db:migrate` tampoco
  pueda tocar remoto por accidente.

## Cómo se llegó a este sistema

Flujo SDD con aprobación humana en cada artefacto (trazas en engram,
`sdd/tendr-f3-schema-rls/*`): exploración del plan F4-F8 → análisis de gaps
re-verificado adversarialmente con un segundo agente → propuesta aprobada
(G1-G5, M1-M6, N1-N5) → spec + design → 33 tareas → apply (4 commits) →
verify con contexto fresco: rebuild virgen del stack, suite completa,
advisors y catálogo (`pg_catalog`) → **GREEN, 0 critical, 0 warnings**.

## Descubrimientos durante la construcción

| # | Descubrimiento | Consecuencia |
|---|---|---|
| 1 | Un `REVOKE SELECT (cols)` a secas es un **no-op** frente al GRANT de tabla completa que Supabase da a `authenticated` | M6 real = `REVOKE SELECT` total + `GRANT SELECT` de allowlist de columnas |
| 2 | UPDATE sin policy SELECT devuelve 0 filas **en silencio** | Toda tabla con UPDATE lleva SELECT del mismo rol; test dedicado |
| 3 | Un stub ingenuo de `auth.users` en Drizzle hacía que `drizzle-kit` emitiera `CREATE SCHEMA auth` | `authUsers` de `drizzle-orm/supabase` + `schemaFilter: ["public"]` |
| 4 | `date_trunc('month', timestamptz)` no es IMMUTABLE (error 42P17 al indexar) | Índice mensual del ledger fijado con `AT TIME ZONE 'UTC'` |
| 5 | `ai_usage_ledger` necesita INSERT bajo sesión de usuario (las Server Actions síncronas de F7 escriben ahí), no era SELECT-only | Policy SELECT+INSERT propia; corrige una conclusión previa del orquestador |
| 6 | `stripe_webhook_events`: el snippet del curso dice "sin RLS", pero eso dispara el advisor de Supabase | RLS habilitado con cero policies (deny-all; `service_role` la bypassa) |
| 7 | En remoto existía `rls_auto_enable()` SECURITY DEFINER ejecutable por `anon` (legado de F2) | `REVOKE EXECUTE` aplicado vía MCP; el event trigger `ensure_rls` se conserva |
| 8 | El seed inicial traía modelos del knowledge cutoff (`gpt-4o`, `gemini-2.0-flash` — apagado el 2026-06-01) | Manifest re-verificado contra precios de junio 2026 |

## Checklist para futuras tablas

- [ ] La tabla nueva con `workspace_id` tiene sus policies en una migración SQL versionada
- [ ] Si tiene UPDATE, tiene SELECT del mismo rol y `USING` + `WITH CHECK`
- [ ] `workspace_id` indexado
- [ ] Caso añadido a `rls-isolation.test.ts` (y a `deviations` si no usa el template completo)
- [ ] `pnpm test` verde contra el stack local antes de aplicar a remoto

## Siguiente paso

F4 (auth anónimo→autenticado) reutiliza este harness: la paridad anónima ya
está cubierta en `rls-anon-manifest.test.ts` y el patrón de dos tenants sirve
para testear la promoción de sesión preservando `auth.uid()`.
