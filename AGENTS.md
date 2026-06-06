# AGENTS.md

Política de aislamiento y trabajo de agentes en este repo.

## Aislamiento

- Cada agente trabaja en una rama feature, nunca directo en `main`.
- PRs cerrados por el sénior, no auto-merge.
- Sin acceso a credenciales de producción; solo `.env.local` (gitignored).
- `AI_KEY_KEK` y demás secretos nunca aparecen en prompts ni en logs.

## Material del curso

Ver `docs/curso/`. Si un prompt referencia una plantilla, ejemplo o snippet, está ahí.

## Seguridad

- RLS en cada tabla con `workspace_id`. Sin policies testeadas, la tabla no se considera lista.
- Webhook de Stripe con `constructEvent` + idempotencia por `event_id`.
- Auth con patrón anónimo a autenticado de Supabase (cookies httpOnly, `signOut({ scope: 'global' })`).

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
