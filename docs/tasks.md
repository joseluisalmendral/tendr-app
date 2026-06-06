# Tasks · Tendr

> Tareas operativas que materializan el spec MVP. Agrupadas por fase del caso (F2 a F10) y priorizadas (P0 must / P1 should / P2 nice). Cada tarea es accionable en una sesión de trabajo.

---

## Resumen

- Total P0: 33
- Total P1: 1
- Total P2: 0

---

## Tabla de tareas

| Tarea | Fase | Prioridad | Notas |
|---|---|---|---|
| ADRs stack base + hosting con nota ToS | F2 | P0 | 001, 002 + caminos de salida |
| ADR AI abstraction + BYO key | F2 | P0 | 003, 004; condiciona F3 y F7 |
| ADR jobs + observabilidad + diagrama | F2 | P0 | 005, 006 + architecture.md |
| Scaffolding Next.js 16 + AGENTS.md | F3 | P0 | proxy.ts, claves sb_* nuevas |
| Schema core + migraciones Drizzle | F3 | P0 | workspaces, clients, cases, notes, documents, templates |
| Tablas operativas + IA con RLS | F3 | P0 | jobs, subscriptions, stripe_webhook_events, audit_log, ai_provider_configs, ai_feature_model_mapping |
| Tests RLS aislamiento cross-tenant | F3 | P0 | RLS sin tests no es RLS |
| Sesión anónima + proxy.ts | F4 | P0 | Crear cliente sin registro |
| Magic link + promoción de sesión | F4 | P0 | linkIdentity preserva uid |
| Tests flujo de promoción | F4 | P0 | Fallo silencioso = pérdida de data |
| CRUD clientes con tabs | F5 | P0 | /clients y /clients/[id] |
| CRUD casos + pipeline de estados | F5 | P0 | prospect → propuesta → en curso → cerrado |
| Kanban global con DnD accesible | F5 | P0 | Confirmado en alcance §3 |
| Notas markdown por cliente/caso | F5 | P0 | |
| Sincronía Realtime multi-tab | F5 | P0 | Filtrar por workspace_id obligatorio |
| Dashboard de inicio con contadores | F5 | P0 | §3.8: clientes activos, casos por estado, próximas acciones |
| Upload documentos + signed URLs | F6 | P0 | Bucket privado, TTL 1h |
| Extractor IA con job persistido | F6 | P0 | Inngest + generateObject + Zod |
| UI de progreso del job + camino de error | F6 | P0 | pending → running → completed/failed |
| BYO key con envelope encryption | F7 | P0 | AES-256-GCM, nunca al cliente |
| CRUD plantillas + variables + preview | F7 | P0 | |
| Adaptar plantilla con IA (streaming) | F7 | P0 | Feature núcleo del diferencial |
| Resumen de relación + sugerir acción | F7 | P0 | |
| Per-feature model picker | F7 | P0 | Pieza de la decisión §5.2 |
| Traces Langfuse en llamadas IA | F7 | P0 | Mide el criterio de éxito 4 del spec |
| Stripe Checkout Free/Pro | F8 | P0 | Test mode |
| Webhook signed + idempotencia | F8 | P0 | stripe_webhook_events |
| Plan gating por límites Free | F8 | P0 | 3 clientes / 5 plantillas / sin IA |
| Badge Team "próximamente" | F8 | P1 | UI mínima, sin lógica |
| E2E happy path con Playwright | F9 | P0 | Gate antes de deploy |
| a11y + responsive + cross-browser | F9 | P0 | axe-core |
| Deploy Vercel + dominio + env vars | F10 | P0 | |
| CI/CD con claude-code-action | F10 | P0 | Agente como actor del pipeline |
| Sentry + Langfuse activados en prod | F10 | P0 | |

---

## Reglas de la lista

- **P0 must:** sin esto, el MVP no cierra el contrato del `jtbd.md`. No negociable.
- **P1 should:** mejora sustancialmente la experiencia pero el MVP cierra sin esto. Hueco si el time-box aprieta.
- **P2 nice:** roadmap inmediato post-MVP. NO entra a la primera versión.

- **Una sola fase por tarea.** Si una tarea cruza fases, partir.
- **Una sesión de trabajo por tarea** (90-180 min). Si tarda más, partir.
- **Cero tareas sin prioridad asignada.** Plana de 40 items hace inservible el plan.

---

*Documento vivo. Cuando una tarea cierre, marcar tachado o mover a `done.md`.*
