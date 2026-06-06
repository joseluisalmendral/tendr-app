# CLAUDE.md

Contexto del proyecto para Claude Code.

## Qué es este repo

Tendr SaaS: mini-CRM B2B para freelancers junior con extracción IA, plantillas multi-provider con BYO key y pagos Stripe. Construido en el módulo 5/L17 del curso de desarrollo agéntico.

## Material del curso

El material del módulo está copiado en `docs/curso/`. Incluye plan, brief, plantillas, ejemplos y snippets. Referenciar siempre desde ahí, no desde rutas externas.

## Stack (se cierra en F2)

Next.js 16 (App Router, RSC + Server Actions) + Supabase (Postgres + RLS + Storage + Realtime + Auth) + Drizzle ORM + Vercel AI SDK + Inngest + Langfuse + Stripe + PostHog Flags + pnpm 11+. Hosting Vercel Hobby.

## Convenciones

- Commits convencionales (`feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`). Sin Co-Authored-By.
- Tags `clase-N` por fase. Cada tag publica un GitHub Release con notas.
- ADRs en `docs/decisions/NNN-titulo.md`. ADR-007 se crea en F7 y se reabre en F10.
- Documentación del curso en `docs/curso/` (refrescable con `bash scripts/bootstrap-docs-curso.sh`).
- RLS profunda obligatoria: cada tabla con `workspace_id` tiene policies SELECT+INSERT+UPDATE+DELETE testeadas.
- BYO key con envelope AES-256-GCM: plaintext key nunca en BD, logs ni cliente.
