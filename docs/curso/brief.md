# Brief de la Lección: Tendr · SaaS fullstack con Next.js + Supabase + multi-provider AI

## Metadatos

- **ID:** M5/L17
- **Módulo:** M5 · Track Fullstack
- **Lección:** L17 · Tendr · SaaS fullstack con stack profesional gratuito
- **Tipo:** caso-práctico (todas las clases C1–C10 con frontmatter `tipo: caso-práctico`)
- **Descripción del syllabus (actualizada):** Caso práctico completo en el que el alumno construye **Tendr**, un mini-CRM con IA para perfiles B2B junior (customer success, account managers, ventas junior, consultores, project managers, freelances). El alumno escribe el spec del producto, decide la arquitectura, monta el modelo de datos con RLS desde el primer día, implementa auth con patrón anónimo a autenticado, construye el workspace core (clientes, casos, Kanban), integra upload de documentos con extractor IA asíncrono, monta editor de plantillas con AI multi-provider y BYO key (envelope encryption AES-256-GCM), añade pagos con Stripe sandbox + webhooks signed + idempotencia, hace QA visual + E2E con Playwright, y despliega con CI/CD agéntico + observabilidad multicapa (Sentry + Langfuse + jobs persistidos).
- **Verificado:** 2026-05-19
- **Producto del caso:** **Tendr** (la app que vende la landing de L16).
- **Conexión con L16:** comparten identidad visual (`design.md` heredado), pricing tiers (Free / Pro €9 / Team €29 "próximamente") y la Skill multicapa de auditoría. Decisiones compartidas en `../_compartido/tecnico/preguntas-compartidas.md`.
- **Coherencia landing/app:** la landing presenta los tres tiers de forma aspiracional (pre-lanzamiento, antes de que la app exista). La app implementa lo construido en este caso: Free es el CRM completo sin IA y Pro añade las features IA con la API key del propio usuario. La landing queda como está (aspiracional); este caso solo cuadra qué entrega cada tier dentro de la app.
- **Clases a generar:** 11 (C0, C1, C2, C3, C4, C5, C6, C7, C8, C9, C10). C0 es guion corto del vídeo intro; C1–C10 son las fases del proyecto.

## Contexto de la lección

Segunda lección del track Fullstack. El alumno construye, de principio a fin, un SaaS real con autenticación, base de datos con seguridad por fila, dashboard, features IA y plan de pago. El foco no es el dominio del SaaS en sí: es el **patrón profesional de construir un producto fullstack con IA en 2026** apoyándose en un BaaS moderno (Supabase) y un agente, donde:

- La seguridad de datos vive en la base de datos (RLS), no solo en la lógica de aplicación.
- La auth es **decisión de producto** (patrón anónimo a autenticado al estilo Linear/Notion/Figma), no checkbox.
- La IA es **multi-provider con BYO key** (OpenAI, Anthropic, Google, DeepSeek, Kimi), patrón premium B2B que transfiere el coste al usuario y enseña abstracción real + envelope encryption.
- El trabajo IA largo se gestiona con **jobs persistidos + Realtime** (patrón que se usa en producción seria), no como Server Action que se cuelga.
- La observabilidad es **multicapa** (Sentry para app, Langfuse para LLM, tabla `jobs` para negocio).
- La validación es **disciplina dual**: hábito por el camino (cierre visual de cada fase) y gate antes de deploy (QA E2E + a11y + responsive + cross-browser).
- El CI/CD integra al agente como **actor del pipeline** (claude-code-action revisando PRs), no como asistente externo.

El proyecto termina desplegado en Vercel con dominio propio, Stripe en sandbox y un patrón replicable que el alumno puede usar para llegar a MVP en días, no en meses, sin sacrificar fundamentos.

## Output esperado del alumno

Al completar las guías de esta lección, el alumno será capaz de:

- Escribir un `spec.md` defendible que el agente use como contexto persistente, con anti-scope explícito y modelo de monetización claro.
- Justificar la elección de Vercel + Supabase + Inngest + Langfuse + Stripe documentando ADRs y delegando la lectura crítica del ToS al agente.
- Diseñar un schema en Postgres con RLS activada desde el primer commit, escribir policies por `workspace_id` con tests reales (Vitest + Supabase local + RLS Tester preview), y conocer los gotchas críticos (views sin `security_invoker`, UPDATE sin SELECT silencioso, Storage upsert, delete user sin revoke session).
- Implementar el **patrón anónimo a autenticado** de Supabase con magic link, preservando `auth.uid()` y migrando data sin esfuerzo manual.
- Construir un workspace core con Server Components + Server Actions + `useOptimistic` + DnD Kit accesible + suscripciones Realtime filtradas por `workspace_id`.
- Integrar Supabase Storage con signed URLs (TTL 1h) y construir el **patrón de jobs persistidos + Realtime** para trabajo IA asíncrono (extractor de documentos con Inngest).
- Implementar el sistema completo de **AI multi-provider con BYO key**: Vercel AI SDK como abstracción, envelope encryption AES-256-GCM para keys, manifest curado de modelos con capabilities, per-feature model picker, cost budget con middleware, streaming y `generateObject` con Zod.
- Integrar Stripe sandbox con Checkout + webhook signed (`stripe.webhooks.constructEvent`) + idempotencia con `stripe_webhook_events` + middleware de gating por plan.
- Diseñar y ejecutar una fase de **QA visual + E2E + a11y + responsive + cross-browser** con Playwright y `@axe-core/playwright`, como gate antes de deploy.
- Montar CI/CD agéntico con GitHub Actions + `claude-code-action` + smoke tests + Sentry + Langfuse activados.

---

## Contexto previo (lo que el alumno ya sabe al llegar aquí)

### Conceptos asumidos

El alumno ha completado el tronco común (M0–M4) y la lección anterior del track Fullstack (L16). Asumido:

- **Trabajo con agente operativo:** instalación, autenticación, sesión, permisos y `AGENTS.md` / `CLAUDE.md` (L0, L3, L4).
- **Paradigma agéntico:** harness, loop ReAct, ventana de contexto, coste por sesión (L2).
- **Context engineering:** preload de información crítica, just-in-time retrieval, archivos de contexto del proyecto (L3).
- **Bucle de trabajo:** plan, ejecuta, verifica, corrige (L4).
- **Git en flujo agéntico:** commits atómicos, ramas, PRs, `.gitignore`, exclusión de secretos (L4).
- **MCPs:** instalación, primitivas (tools, resources, prompts) y criterio de mínimo privilegio (L7).
- **Skills y slash commands:** empaquetar comportamiento reutilizable del agente (L6).
- **Diseño técnico previo:** ADRs, decisiones de stack, structure del repo (L9).
- **Spec-Driven Development:** escribir spec antes que código cuando aplica (L10).
- **Construcción con agente:** trabajar sobre código existente, construir features, debugging, refactor (L11).
- **Testing con agente:** unitarios, integración, e2e, criterio de qué testear (L12).
- **Seguridad:** vulnerabilidades frecuentes en código generado por IA, calibración de permisos (L13).
- **Deployment con agente:** CI/CD, configuración de pipelines, versionado de prompts y secretos (L14).
- **Observabilidad:** logs, trazas, pipeline de calidad (L15).
- **Landing con Next.js + Tailwind + shadcn:** stack web base, `design.md`, GEO 2026, captura con Server Actions, Vercel, dominio, Skill multicapa de auditoría (L16).

### Herramientas ya configuradas

- Claude Code, Codex CLI y OpenCode operativos con sus archivos de contexto.
- Git + GitHub CLI (`gh`).
- pnpm o bun como package manager.
- Node.js ≥22 LTS.
- Cuenta de GitHub y Vercel (creadas en L16 si no existían).
- Stack Next.js 16 + Tailwind v4 + shadcn/ui asentado en L16.
- `design.md` versionado del producto Tendr (producido en L16 C3) reutilizable en este caso.
- Skill `landing-auditor` reutilizable para auditar la app antes del deploy final.

### Convenciones del programa ya introducidas

- `AGENTS.md` como contexto compartido entre herramientas.
- Commits atómicos con mensajes redactados por el agente bajo revisión humana.
- Trunk-based development con PRs cuando el cambio lo justifique.
- ADRs en `docs/decisions/` para decisiones de arquitectura.
- Pipeline de calidad: linter, formateador, tests automáticos en CI.
- Higiene de secretos: `.env.local` fuera del repo, secretos en el dashboard del proveedor.
- `design.md` como fuente narrativa del sistema de diseño (heredado de L16).

### Lo que aún NO se ha introducido (no asumir)

- **App móvil, React Native, Expo:** se introduce en L18. Aquí todo es web.
- **RAG, embeddings, vector stores:** track de AI Engineering (L19–L20). No aplica; aquí el LLM se llama por API con prompt + contexto, sin recuperación vectorial.
- **Agentes con tool use complejos en runtime de la app, planning/memory multi-step:** L19–L20. Aquí el agente es solo herramienta de desarrollo, no parte del producto.
- **Broadcast y presence de Supabase Realtime:** mencionables pero no eje. Aquí se usa Realtime para fanout de cambios de tabla, no para chat colaborativo.
- **Edge Functions de Supabase para lógica server-side compleja:** mencionables como alternativa a Server Actions, no se desarrolla a fondo.

**Implicación práctica:** Tendr es una app web multi-tenant (cada usuario tiene su workspace) con CRUD, features IA y pagos. La IA se llama por API (no es agente con tool use). Todo vive entre Next.js (Vercel) + Supabase + Inngest + Stripe + el provider de IA elegido por el usuario.

---

## Qué es Tendr

Aplicación para gestionar **clientes externos**. Pensada para perfiles B2B junior que entran a la empresa a roles de customer success, account management, ventas junior, project management, consultoría, o que freelancean en paralelo.

### Funcionalidades

| Bloque | Detalle |
|---|---|
| Clientes | CRUD con info, contactos, etiquetas, estado activo/archivado |
| Casos / oportunidades | Por cliente, con pipeline (prospect → propuesta → en curso → cerrado) |
| Kanban global | Vista transversal de todos los casos por estado, drag-and-drop |
| Notas | Por cliente y por caso, markdown |
| Documentos | Por cliente, subidos a Supabase Storage |
| Plantillas de email | Con la marca propia, variables y preview |
| AI features | Adapta plantillas, resume relación, sugiere acción, extrae info de documentos |
| Pagos | Free / Pro / Team con Stripe en sandbox |

### Pricing (compartido con L16)

| Plan | Precio | Incluye | Estado en MVP |
|---|---|---|---|
| Free | 0 | CRM completo (clientes, casos, Kanban, plantillas) sin IA | Implementado |
| Pro | €9/mes | CRM completo + features IA (con BYO key del usuario) | Implementado |
| Team | €29/mes | Pro + colaboradores | Roadmap visible como "próximamente" |

### Audiencia objetivo

| Perfil del alumno | Por qué le aporta |
|---|---|
| Customer success / account manager junior | Reconoce el modelo Salesforce/HubSpot desde dentro |
| Ventas junior / BD | Practica el modelo de oportunidades + pipeline |
| Project manager junior | Aprende el patrón de casos + Kanban |
| Consultor junior | Plantillas de onboarding, propuestas, comunicación |
| Marketing ops | Sistema de plantillas con marca y variables |
| Freelance en paralelo | Lo usa de verdad como herramienta personal |

---

## Decisiones clave fijadas para el caso

| Decisión | Detalle | Razón |
|---|---|---|
| Producto concreto, no genérico | Tendr aterrizado a B2B junior | Motivación + modelo de datos rico |
| IA adapta, no genera | Plantillas con voz del usuario + contexto del cliente | Diferenciador vs tutoriales superficiales |
| **Multi-provider con BYO key** | Vercel AI SDK abstrae OpenAI, Anthropic, Gemini, DeepSeek, Kimi. Cada workspace mete su API key cifrada y elige modelo por feature | Patrón premium B2B (Cursor, Linear, Notion AI). Best practice 2026. Enseña envelope encryption + abstracción real |
| Auth anónimo a autenticado | Patrón nativo Supabase, promoción preserva `auth.uid()` | Patrón premium (Linear, Notion, Figma); enseña auth como decisión de producto |
| Jobs persistidos con Realtime | Tabla `jobs` + Inngest + Supabase Realtime | Patrón de producción real traducido a stack gratuito |
| Observabilidad multicapa | Sentry (app) + Langfuse (LLM) + tabla `jobs` (negocio) | Las llamadas a IA son recursos contables |
| Vercel Hobby + disclaimer ToS | Asumido y documentado | Lectura crítica de ToS como momento pedagógico |
| Pagos en L17, no en L16 | Stripe Checkout en test mode + webhook signed + idempotencia | Encaja con auth + BD ya existentes |
| Stack 100% gratuito (excepto IA del usuario) | Vercel + Supabase + Inngest + Langfuse + Stripe test. Coste IA: del usuario con su key | Replicable por el alumno sin barreras |
| Fase dedicada de QA visual + E2E | Playwright + axe-core, gate antes de deploy | Validación al cerrar cada fase + gate al final |
| CI/CD agéntico | `claude-code-action` en PR + smoke check + auto-migrate | Agente como actor del pipeline |

---

## Stack final verificado (mayo 2026)

| Capa | Herramienta | Free tier | Caveat |
|---|---|---|---|
| Framework | Next.js 16.x | Open source | App Router, Server Actions, `proxy.ts` (renombrado desde `middleware.ts` en Next.js 16) |
| Hosting | Vercel Hobby | 100GB transfer, 1M function invocations, 1M edge requests, 1GB Blob | Prohíbe uso comercial. Disclaimer en README |
| BD + Auth + Storage + Realtime | Supabase | 500MB Postgres, 1GB Storage, 50k MAU, 5GB egress | Pausa tras 1 semana de inactividad. Despausa en 1 click |
| Cliente Supabase | `@supabase/ssr` | Open source | `@supabase/auth-helpers` está deprecado |
| Background jobs | Inngest | 50k runs/mes | Suficiente para SaaS de aprendizaje |
| Email transaccional (opcional) | Resend | 3.000/mes, 100/día | Requiere DNS para dominio |
| Pagos sandbox | Stripe test mode | Indefinido, sin verificación | Test cards (`4242 4242 4242 4242`) |
| LLM observability | Langfuse Cloud | 50k observations/mes, 30 días retención | Adquirida por ClickHouse enero 2026, MIT confirmada |
| App errors | Sentry | 5k errores/mes | Suficiente |
| CI/CD | GitHub Actions | 2.000 min/mes private | Sobra |
| **AI abstraction layer** | **Vercel AI SDK** (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/deepseek`) | Open source, gratuita | Unifica providers. Streaming, tool calling, `generateObject` con Zod, file input |
| IA providers soportados | OpenAI, Anthropic, Google Gemini, DeepSeek, Kimi (Moonshot) | Pago por el usuario con su key | Único coste real, traspasado al usuario vía BYO key |
| ORM | Drizzle + drizzle-kit | Open source | Schema-first, migraciones, generación de tipos |
| Validación | Zod | Open source | Estándar de boundaries en TS |
| Linter / Formato | Biome (recomendado) | Open source | Reemplaza ESLint+Prettier |

**Cambio crítico en Next.js 16:** `middleware.ts` se renombró a `proxy.ts` (la función exportada pasa de `middleware` a `proxy`). En 2026 esto es el patrón actual; tutoriales viejos muestran `middleware.ts`. Avisar al alumno explícitamente.

**Cambio crítico en Supabase 2026:** las claves `anon` y `service_role` funcionan hasta finales de 2026, pero el nuevo formato es `sb_publishable_xxx` y `sb_secret_xxx`. Usar las nuevas desde el primer día.

---

## Arquitectura (diagrama lógico)

```
┌──────────────────────────────────┐
│ Next.js 16 (App Router)          │
│ Vercel Hobby                     │
│  - Pages (RSC + Server Actions)  │
│  - Route Handlers (API + webhooks)│
│  - proxy.ts (auth + plan gating) │
│  - Cron (recordatorios diarios)  │
└──────────┬───────────────────────┘
           │
           ├── Supabase ───────────────────┐
           │   ├── Postgres + RLS          │
           │   ├── Auth (anon → email)     │
           │   ├── Storage (documentos)    │
           │   └── Realtime (jobs + kanban)│
           │                               │
           ├── Inngest (background jobs)   │
           │   - extracción documentos     │
           │   - resúmenes diferidos       │
           │   - recordatorios programados │
           │                               │
           ├── Stripe (test mode)          │
           │   - Checkout sessions         │
           │   - Webhooks signed           │
           │                               │
           ├── Vercel AI SDK ──────────────│
           │   - OpenAI / Anthropic / ...  │
           │   - BYO key por workspace     │
           │                               │
           ├── Langfuse (LLM traces)       │
           ├── Sentry (app errors)         │
           └── GitHub Actions (CI/CD)      │
```

**Principios del proyecto referencia (`ai-learning-engine`) traducidos a stack gratuito:**

| Principio del referente | Traducción a L17 |
|---|---|
| Separación de responsabilidades (Studio + API + Generator) | Next.js (UI + API) + Inngest functions (workers IA) |
| Jobs persistidos en DB (`generation_jobs`) | Tabla `jobs` en Supabase con `status`, `progress`, `error` |
| Pub/sub para realtime UI (Redis SSE fanout) | Supabase Realtime (suscripción a `jobs` filtrada por workspace) |
| Storage con signed URLs | Supabase Storage signed URLs (1h TTL) |
| Schema-first con migraciones (Drizzle) | Drizzle ORM + drizzle-kit, migraciones en CI |
| Secretos fuera de Git | `.env.local` + Vercel env vars |
| Permisos mínimos por componente | RLS estricto en Supabase |
| CI/CD declarativo | GitHub Actions + integraciones Vercel/Supabase |
| Observabilidad por DB (`generation_jobs`) | Tabla `jobs` + Langfuse + Sentry |

---

## Investigación por clase

### C0. Introducción

**Descripción del syllabus:** Vídeo que engloba y contextualiza la lección.

**Puntos clave del guion:**
1. Por qué un SaaS es el siguiente paso natural tras la landing: pasa de "captar atención" a "operar producto", con todo lo que implica (login, datos del usuario, dinero, IA real).
2. Qué hace distinto a Tendr: no es un wrapper de Claude. Es un producto B2B con **auth como decisión de producto** (anónimo a autenticado), **multi-provider BYO key** (patrón premium 2026), **jobs persistidos** para trabajo IA largo, **observabilidad multicapa** y **CI/CD donde el agente revisa los PRs**.
3. Qué construye el alumno al terminar: un SaaS real en producción con auth, BD segura, workspace, documentos con extractor IA, plantillas adaptables, pagos en sandbox y CI/CD profesional. El esqueleto que puede convertir cualquier idea en producto facturable.

**Ejemplo de negocio:**

> Tendr es la app que vende la landing que construiste antes. Cuando termines esta lección, tienes un SaaS real desplegado con auth, BD segura por workspace, features IA con tu propia API key, pagos en sandbox y CI/CD donde el agente revisa los PRs. El esqueleto que un equipo de producto serio usa para llegar a MVP en días.

Duración objetivo: 2–4 minutos.

---

### C1. Spec del producto y mentalidad MVP

**Tipo:** Conceptual · **Artefacto:** `spec.md` versionado + `tasks.md` con priorización.

**Puntos clave técnicos:**

1. **SDD en directo aplicado a producto.** El alumno escribe el spec antes de tocar código. Define qué hace el producto, qué no hace, criterios de éxito, alcance MVP vs roadmap, restricciones (free tier, ToS de Vercel) y **modelo de costes de IA (BYO key)**.
2. **Decisión de producto clave que se toma aquí:** Tendr funciona con **multi-provider BYO key**. Cada workspace mete su API key de OpenAI, Anthropic, Gemini, DeepSeek o Kimi, y elige qué modelo usa cada feature. Esto se decide aquí porque condiciona el modelo de datos (C3) y toda la arquitectura IA (C7). Razones:
   - Patrón premium B2B que el alumno verá en Cursor, Linear, Notion AI.
   - Transfiere el coste de IA al usuario (el producto no factura tokens).
   - Enseña abstracción real sobre providers + envelope encryption (best practice 2026).
   - Da control de privacidad al usuario (su key, su data).
3. **Spec corto, no documento de 40 páginas.** Estructura mínima: problema, usuario, casos de uso prioritarios, criterios de aceptación, **anti-scope** (qué queda fuera), modelo de monetización.
4. **El spec como contexto persistente del agente:** se referencia desde `AGENTS.md` (`@spec.md`) para que el agente lo cargue al inicio de cada sesión relevante.
5. **Anti-scope explícito de Tendr MVP:**
   - Realtime colaborativo en notas (con presence). Solo Realtime fanout para jobs y Kanban.
   - App móvil acompañante.
   - Embeddings / RAG (track AI Engineering).
   - Integraciones externas (Slack, Gmail) más allá de email transaccional de Resend.
   - Plan Team operativo en MVP (visible en landing como "próximamente").

**Cómo se ve en práctica:**

1. `sdd-explore` con prompt "construir mini-CRM para gestionar clientes externos B2B".
2. `sdd-propose` genera 2-3 propuestas, el alumno elige una.
3. `sdd-spec` formaliza el alcance con criterios de éxito medibles.
4. `sdd-tasks` parte en tareas priorizadas.
5. Revisión del alumno: ¿está claro qué entra y qué no? ¿Hay criterio de éxito medible? ¿Las dependencias entre tareas son razonables?

**Herramientas recomendadas:**

| Herramienta | Versión | Por qué aquí | Fuente |
|---|---|---|---|
| Skills `sdd-explore`, `sdd-propose`, `sdd-spec`, `sdd-tasks` | Ecosistema gentle-ai u OpenSpec | SDD aplicado a producto | HERRAMIENTAS_VALIDADAS §Skills |
| Slash command propio `/spec` (opcional) | N/A | Estandarizar la generación de spec | HERRAMIENTAS_VALIDADAS §Skills |

**Ejemplo de negocio sugerido:**

> Vas a construir Tendr para perfiles B2B junior. En 90 minutos escribes el spec con el agente, lo firmas y empiezas a construir con norte claro. El spec se queda como contexto que el agente carga en cada sesión.

**Trade-offs clave:**

1. **Spec corto vs exhaustivo:** corto (1–2 páginas) para MVP; exhaustivo se desactualiza antes de implementarse.
2. **Spec antes que ADR de stack vs al revés:** spec primero porque las restricciones del producto guían la elección del stack (aunque el track lo fije implícitamente).

**Mentalidad senior a transmitir:**
- Lo que dejas fuera del spec define el producto tanto como lo que incluyes.
- El spec no se escribe para impresionar a un PM: se escribe para que el agente y tú tengáis una referencia común sobre la que iterar.
- Un criterio de aceptación que no se puede verificar no es un criterio: es una intención.

**Qué NO delegar al agente:**
- Los casos de uso prioritarios (el agente inventaria, tú decides cuáles entran).
- El modelo de monetización.

**Pitfalls a evitar:**
- Spec ambicioso (todo el roadmap dentro del MVP).
- Spec vago ("la app gestiona clientes" sin criterios accionables).
- No priorizar (todas las tareas con el mismo peso).
- No documentar lo que NO entra.

**Colisiones a mencionar:**
- `spec.md` y `design.md` conviven en el repo. Primero describe qué hace el producto; segundo, cómo se ve.

**Notas adicionales para el agente generador-guia:**
- Incluir plantilla completa de `spec.md` para Tendr (problema, usuario, casos de uso, criterios, anti-scope, monetización BYO key) que el alumno copia y adapta.

**Recursos visuales sugeridos:**
- Tabla de secciones del `spec.md` con ejemplo breve.
- Diagrama Mermaid del flujo: `spec.md` → ADR de stack → schema → features → deploy.

---

### C2. Arquitectura y stack (ADRs + lectura de ToS)

**Tipo:** Decisión · **Artefacto:** ADRs de arquitectura + diagrama lógico + nota de ToS de Vercel + ADR específico de Vercel AI SDK.

**Puntos clave técnicos:**

1. **Por qué Next.js 16 + Supabase para un SaaS pequeño-mediano:** integración madura (`@supabase/ssr`), Server Components + RLS dan defensa en profundidad, deploy en Vercel sin fricción, todo en TypeScript.
2. **Por qué Vercel AI SDK (se decide aquí explícitamente):**
   - Interfaz unificada para OpenAI, Anthropic, Google, DeepSeek, Kimi, Groq.
   - Streaming, tool calling, `generateObject` con Zod (structured output), file input nativo, reasoning mode.
   - TypeScript-first, encaja con Next.js sin fricción.
   - **DeepAgents (LangChain) queda fuera** porque su foco son agentes complejos con planning/memory/multi-step; Tendr tiene tareas IA cortas (adaptar, resumir, sugerir, extraer). Se referencia para el track AI Engineering.
   - **SDKs nativos por provider quedan fuera** porque obligan a duplicar lógica y rompen la abstracción.
3. **Por qué Inngest para jobs:** event-driven, retries, steps, free 50k runs/mes, MCP oficial. Alternativas: Trigger.dev (similar), BullMQ (self-host complejo).
4. **Por qué Langfuse para LLM observability:** OSS (MIT), self-host disponible, integración nativa con Vercel AI SDK, free 50k observations/mes, dashboard rico (traces, generations, costes, latencias).
5. **Patrón de leer ToS antes de comprometerse** (momento pedagógico):
   > Claude, lee los ToS de Vercel Hobby y Fair Use Guidelines. Dime explícitamente: ¿puedo monetizar Tendr aquí? ¿Qué constituye uso comercial? ¿Qué pasa si infrinjo?

   El agente devuelve resumen + cita textual. El alumno documenta en `docs/decisions/002-vercel-tos.md` con tres caminos de salida (Vercel Pro $20/dev/mes, Cloudflare Pages + `@opennextjs/cloudflare`, Netlify).
6. **Diagrama lógico en `docs/architecture.md`** (Mermaid).
7. **ADRs en `docs/decisions/`:**
   - 001 Stack base (Next.js 16 + Supabase).
   - 002 Hosting (Vercel Hobby con disclaimer + caminos de salida).
   - 003 AI abstraction (Vercel AI SDK vs DeepAgents vs SDKs nativos).
   - 004 BYO key (multi-provider con envelope encryption).
   - 005 Jobs queue (Inngest vs Trigger.dev vs BullMQ).
   - 006 Observabilidad (Sentry + Langfuse + tabla `jobs`).

**Herramientas recomendadas:**

| Herramienta | Versión | Por qué aquí | Fuente |
|---|---|---|---|
| Next.js | 16.x | Framework fullstack de referencia con `proxy.ts` | HERRAMIENTAS_VALIDADAS §Web/Fullstack |
| Supabase | Plataforma 2026 | Postgres + Auth + RLS + Storage + Realtime en un BaaS | HERRAMIENTAS_VALIDADAS §Web/Fullstack |
| `@supabase/ssr` | Actual 2026 | Cliente con cookies httpOnly para SSR | [https://supabase.com/docs/guides/auth/server-side/creating-a-client](https://supabase.com/docs/guides/auth/server-side/creating-a-client). Verificada 2026-05-19 |
| Vercel AI SDK | Actual 2026 (`ai` ≥4.x) | Abstracción multi-provider, streaming, `generateObject` | [https://sdk.vercel.ai/docs](https://sdk.vercel.ai/docs). Verificada 2026-05-19 |
| Inngest | Actual 2026 | Background jobs event-driven con retries y steps | [https://www.inngest.com/](https://www.inngest.com/). Verificada 2026-05-19 |
| Langfuse Cloud | Actual 2026 | LLM observability OSS con SDK Next.js | [https://langfuse.com/](https://langfuse.com/). Verificada 2026-05-19 |
| Stripe | Test mode | Pagos en sandbox, MCP oficial | HERRAMIENTAS_VALIDADAS §Web/Fullstack |
| Sentry | Actual 2026 | App errors, MCP oficial con Seer analysis | HERRAMIENTAS_VALIDADAS §Observabilidad |
| Drizzle | 0.3x | ORM type-safe sobre Postgres | HERRAMIENTAS_VALIDADAS §Web/Fullstack |

**Ejemplo de negocio sugerido:**

> Decides la arquitectura en una sesión: una hora con el agente listando opciones, viendo precios reales y firmando los ADRs. Sales con el diagrama lógico, la nota explícita sobre el ToS de Vercel y la lista priorizada de tareas.

**Trade-offs clave:**

1. **Supabase vs Firebase:** Supabase por Postgres estándar, SQL real, RLS auditable, exportable. Firebase por NoSQL y mejor para datos jerárquicos sin relaciones.
2. **Vercel AI SDK vs DeepAgents vs SDKs nativos:** AI SDK por abstracción real con streaming y structured output. DeepAgents para agentes multi-step complejos (no es nuestro caso). SDKs nativos duplican lógica.
3. **Inngest vs Trigger.dev vs BullMQ:** Inngest por event-driven y MCP oficial. BullMQ obliga a Redis self-host.

**Mentalidad senior a transmitir:**
- Las decisiones arquitectónicas son las más caras de revertir. Migrar de Supabase cuesta semanas.
- Leer ToS antes de comprometerse es ingeniería, no paranoia.
- "Free" tiene letra pequeña. Documentar los caminos de salida desde el inicio.

**Qué NO delegar al agente:**
- La elección final del stack (firma humana de los ADRs).
- La interpretación legal del ToS (resumen del agente + criterio humano).

**Pitfalls a evitar:**
- Copiar stack sin entender tradeoffs.
- Saltarse la lectura de ToS.
- No documentar las decisiones.
- Elegir herramientas con free tier sin documentar la ruta de salida.

**Referencias web verificadas:**
- Vercel AI SDK: [https://sdk.vercel.ai/docs](https://sdk.vercel.ai/docs). Verificada 2026-05-19.
- Supabase pricing: [https://supabase.com/pricing](https://supabase.com/pricing). Verificada 2026-05-19.
- Inngest: [https://www.inngest.com/](https://www.inngest.com/). Verificada 2026-05-19.
- Langfuse: [https://langfuse.com/](https://langfuse.com/). Verificada 2026-05-19.
- Vercel ToS: [https://vercel.com/legal/terms](https://vercel.com/legal/terms). Verificada 2026-05-19.

**Recursos visuales sugeridos:**
- Diagrama lógico en Mermaid (el de arriba).
- Tabla de ADRs con decisión y razón en una línea.

---

### C3. Scaffolding + modelo de datos + RLS + migraciones

**Tipo:** Tutorial · **Artefacto:** schema completo + policies RLS + migraciones + tests de RLS.

**Puntos clave técnicos:**

1. **Scaffolding del proyecto:**
   ```
   pnpm create next-app@latest tendr --typescript --tailwind --app
   cd tendr
   pnpm add @supabase/supabase-js @supabase/ssr drizzle-orm zod
   pnpm add -D drizzle-kit
   pnpm dlx shadcn@latest init
   ```
   Estructura: `utils/supabase/client.ts` (browser), `utils/supabase/server.ts` (server), `proxy.ts` en raíz (atención al cambio de nombre en Next.js 16).
2. **`AGENTS.md` específico del proyecto:** RLS siempre activa, claves nuevas `sb_publishable_xxx` / `sb_secret_xxx`, `proxy.ts` no `middleware.ts`, Server Actions para mutaciones por defecto, validar con Zod en boundaries, `service_role` solo en server.
3. **Schema completo** con Drizzle, incluyendo tablas IA específicas:

   **Tablas core (CRUD):** `workspaces`, `clients`, `cases`, `notes`, `documents`, `templates`.

   **Tablas operativas:** `jobs`, `subscriptions`, `stripe_webhook_events`, `audit_log`.

   **Tablas IA (introducidas aquí, usadas en C6 y C7):**

   | Tabla | Propósito | Campos clave |
   |---|---|---|
   | `ai_provider_configs` | API keys cifradas por workspace y provider | `workspace_id`, `provider` (openai/anthropic/google/deepseek/moonshot), `encrypted_key` (AES-256-GCM), `key_iv`, `key_tag`, `encrypted_dek`, `key_validated_at`, `last_used_at` |
   | `ai_feature_model_mapping` | Qué modelo usa cada feature en cada workspace | `workspace_id`, `feature` (adapt_template / summarize / suggest / extract_document), `provider`, `model_id` |
   | `ai_model_manifest` | Manifest curado de modelos + capabilities | `provider`, `model_id`, `display_name`, `supports_multimodal`, `supports_pdf`, `supports_image`, `supports_streaming`, `max_input_tokens`, `cost_per_1k_input`, `cost_per_1k_output`, `deprecated_at` |
   | `ai_usage_ledger` | Tracking de coste por workspace y feature | `workspace_id`, `feature`, `provider`, `model_id`, `tokens_in`, `tokens_out`, `cost_cents`, `created_at` |

4. **RLS policies** por `workspace_id` para todas las tablas operativas. `ai_model_manifest` es lectura pública (mismo manifest para todos los workspaces). **Aviso crítico de seguridad:** `encrypted_key` no se devuelve nunca al cliente; solo se usa server-side dentro de Server Actions o Inngest functions.
5. **Entornos:** un único proyecto Supabase (`tendr-app-dev`) más Supabase local para tests. Supabase Branching (persistent branch `dev` + preview branches por PR) requiere plan Pro y queda fuera del curso; en un caso real, segundo proyecto Free o plan Pro con Branching.
6. **Tests de RLS con dos herramientas complementarias:**
   - **RLS Tester preview del Supabase Dashboard** (lanzado abril 2026): UI que ejecuta SQL como roles distintos (logged in / logged out / specific user) y muestra qué policies se evalúan. Ideal para iterar policies rápido.
   - **Vitest contra Supabase local** (vía CLI): crear 2 usuarios reales, cada uno crea data, intentar acceder cruzado, verificar que falla. Esto va en CI.
7. **Security gotchas críticos** (documentados por Supabase Agent Skills):

| Gotcha | Consecuencia silenciosa | Mitigación |
|---|---|---|
| **Views bypass RLS por defecto** | Vista expone data de otros tenants sin error | `create view ... with (security_invoker = true)` siempre |
| **UPDATE sin SELECT policy** | UPDATE devuelve 0 rows sin error; el código piensa que funcionó | Toda tabla con UPDATE policy necesita SELECT policy también |
| **Storage upsert sin INSERT+SELECT+UPDATE** | Upsert de archivos falla silenciosamente | Otorgar los tres permisos en el bucket |
| **Delete user no revoca JWT** | Token sigue válido hasta expiración | Revocar sessions explícitamente antes del delete |
| **Default grants en tablas nuevas** | Permisos demasiado abiertos por defecto | A partir de 30 mayo 2026 es opt-out por defecto |

**Herramientas activas durante esta fase:**

- **Supabase MCP** (oficial, 32 tools): tool groups `database`, `account`, `docs`.
- **Supabase Agent Skills** (oficial, mayo 2026): playbooks de Auth + RLS + Storage inyectados en el contexto del agente.
- **Drizzle Studio** (`pnpm drizzle-kit studio`) para inspeccionar el schema.
- Context7 MCP activo para docs de `@supabase/ssr` y Drizzle.

**Trade-offs clave:**

1. **Drizzle ORM vs cliente Supabase puro:** Drizzle para queries complejas con tipos; cliente Supabase para queries simples con RLS. Aquí los dos conviven.
2. **`audit_log` desde el inicio vs después:** desde el inicio porque añadirlo después obliga a backfill.
3. **Branches Supabase vs un solo proyecto:** un solo proyecto. Branching requiere plan Pro y factura cómputo por branch; en Free el aislamiento lo dan Supabase local para tests y, en un caso real, un segundo proyecto.

**Mentalidad senior a transmitir:**
- Los datos definen el producto. RLS sin tests no es RLS funcional.
- Schema → policies → tests como hábito profesional, no como buena intención.
- Si la seguridad falla en C3, falla todo el resto.

**Qué NO delegar al agente:**
- La revisión final de las policies (el agente las genera, tú las lees línea a línea).
- Cualquier consulta con `service_role` (solo en server, jamás en client).

**Pitfalls a evitar:**
- Olvidar RLS en una tabla (full leak entre tenants).
- Tests débiles que no prueban aislamiento real.
- Migraciones no reversibles.
- Usar `service_role` en código que llega al cliente.
- Crear vistas sin `security_invoker = true`.
- Confiar en que UPDATE falla con error si no hay permiso.
- Correr operaciones destructivas (db reset, tests) contra el proyecto cloud en lugar de Supabase local.

**Referencias web verificadas:**
- Supabase RLS: [https://supabase.com/docs/guides/database/postgres/row-level-security](https://supabase.com/docs/guides/database/postgres/row-level-security). Verificada 2026-05-19.
- Supabase Branches: [https://supabase.com/docs/guides/platform/branching](https://supabase.com/docs/guides/platform/branching). Verificada 2026-05-19. **Re-verificada 2026-06-06: requiere plan Pro; descartada para el curso (plan Free).**
- Drizzle docs: [https://orm.drizzle.team/](https://orm.drizzle.team/). Verificada 2026-05-19.
- Supabase Agent Skills: [https://supabase.com/docs/guides/getting-started/ai-prompts](https://supabase.com/docs/guides/getting-started/ai-prompts). Verificada 2026-05-19.

**Recursos visuales sugeridos:**
- ERD del schema completo (Mermaid).
- Tabla de gotchas RLS con consecuencia y mitigación.

---

### C4. Auth con patrón anónimo a autenticado

**Tipo:** Decisión + Tutorial · **Artefacto:** `proxy.ts` + helpers de sesión + flujo magic link + migración de datos al promocionar.

**Puntos clave técnicos:**

1. **Por qué se replantea la auth.** "Login, signup y sesiones en App Router" plano es un tutorial de la doc de Supabase. El agente lo genera en 10 minutos, el alumno copia formularios, no hay criterio. **Patrón anónimo a autenticado** sí enseña auth como decisión de producto.
2. **Flujo adoptado:**
   - Usuario abre Tendr y puede crear 1 cliente con 1 caso **sin registrarse**. Supabase crea sesión anónima con `auth.uid()` válido.
   - Actividad anónima persiste con `user_id = uid anónimo`. RLS aplica igual.
   - Cuando el usuario quiere persistir entre dispositivos, se le pide email (magic link, sin password).
   - Al confirmar, Supabase **promociona** la sesión: `auth.uid()` pasa de anónimo a autenticado **manteniendo el UID**. Data migra automáticamente.
3. **Cómo se ve en práctica:**
   - Activar **Supabase Agent Skills**: `npx skills add supabase/agent-skills`. Playbook oficial de Auth: signup, magic link, OAuth, session revocation, JWT lifecycle, anonymous → authenticated promotion.
   - **`proxy.ts`** con `createServerClient` de Supabase + helpers `@supabase/ssr`. Protege rutas autenticadas, deja libres `/`, `/login`, `/auth/callback`, `/api/webhooks/*`.
   - **`app/login/page.tsx`** con form de magic link (un campo email + botón). `useFormStatus` para loading. Manejo de error sin filtrar info sensible.
   - **`app/auth/callback/route.ts`** route handler que procesa el callback, intercambia el code por session, redirige al `/`. Si el usuario era anónimo, dispara la promoción con `supabase.auth.linkIdentity({ provider: 'email' })`.
   - **`lib/auth/get-current-workspace.ts`** helper server-side: lee la sesión, busca workspace del user (asumiendo 1:1 en MVP), devuelve `{ user, workspaceId }`.
4. **Promoción de sesión anónima → autenticada:** Supabase preserva el `auth.uid()` al usar `linkIdentity`. La data anónima migra sin migración manual gracias a RLS por `user_id`.
5. **Tests del flujo (Vitest + Supabase local):**
   - Sesión anónima crea workspace + cliente + caso.
   - Promoción a email vía magic link.
   - Verificar que workspace, cliente y caso siguen accesibles tras promoción.
   - Crear otro usuario, intentar leer data del primero, RLS bloquea.
6. **Anti-gotchas (de Supabase Agent Skills):**
   - Logout: llamar a `auth.signOut({ scope: 'global' })` para revocar TODAS las sessions del user.
   - Delete user: revocar sessions primero con `auth.admin.signOut(userId)` antes de `auth.admin.deleteUser(userId)`.
   - Cookies en App Router: leer y escribir vía `cookies()` de Next.js, no via `document.cookie`.

**Cambio crítico en Next.js 16 (recordatorio):** `middleware.ts` se renombró a `proxy.ts`. La función exportada se llama `proxy`, no `middleware`. Tutoriales viejos siguen mostrando `middleware.ts`; corregir.

**Cambio crítico en Supabase 2026 (recordatorio):** claves nuevas `sb_publishable_xxx` (pública) y `sb_secret_xxx` (server-only). `service_role` legacy funciona pero se migra durante 2026.

**Herramientas activas:**
- Supabase MCP (tool group `account` para gestionar users; `docs` para ver patrones).
- Supabase Agent Skills (playbooks de Auth).
- `@supabase/ssr` (cliente con cookies httpOnly).

**Trade-offs clave:**

1. **Magic link vs password vs OAuth:** magic link sin password reduce fricción y elimina la categoría "olvido de password". OAuth (Google, GitHub) se añade como mejora más adelante. Password queda fuera del MVP por reducir superficie de ataque.
2. **Anónimo a autenticado vs login obligatorio:** anónimo a autenticado por UX premium (Linear, Notion, Figma). Login obligatorio si la app es B2B serio y no quieres anónimos.
3. **`@supabase/ssr` vs `@supabase/auth-helpers` (deprecado):** ssr siempre.

**Mentalidad senior a transmitir:**
- La auth típica ("monta login form") no enseña criterio.
- Cookies httpOnly siempre. Localstorage para tokens es vulnerabilidad XSS.
- Autenticación (¿quién eres?) y autorización (¿qué puedes hacer?) no son lo mismo. La autenticación va aquí; la autorización va en `proxy.ts` + RLS + plan gating de C8.

**Qué NO delegar al agente:**
- La revisión del flujo de promoción (puede fallar silenciosamente y perder data).
- La configuración de email templates en Supabase (UX y branding humano).

**Pitfalls a evitar:**
- Gestionar tokens en client (mal; deben ser cookies httpOnly).
- Olvidar `proxy.ts` de protección en rutas autenticadas.
- Mezclar auth con autorización.
- No probar el flujo de promoción.
- Confundir `middleware.ts` (legacy) con `proxy.ts` (Next.js 16).

**Referencias web verificadas:**
- `@supabase/ssr`: [https://supabase.com/docs/guides/auth/server-side/creating-a-client](https://supabase.com/docs/guides/auth/server-side/creating-a-client). Verificada 2026-05-19.
- Supabase anonymous to authenticated: [https://supabase.com/docs/guides/auth/auth-anonymous](https://supabase.com/docs/guides/auth/auth-anonymous). Verificada 2026-05-19.
- Next.js 16 `proxy.ts`: [https://nextjs.org/docs/app/api-reference/file-conventions/proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy). Verificada 2026-05-19.

**Recursos visuales sugeridos:**
- Diagrama Mermaid del ciclo de vida de sesión: anónimo → magic link → autenticado → logout.
- Tabla de helpers de auth con su responsabilidad.

---

### C5. Workspace core: clientes, casos y Kanban

**Tipo:** Tutorial · **Artefacto:** páginas funcionales de clientes y casos + Kanban con DnD + sincronía Realtime + validación visual de cierre de fase.

**Puntos clave técnicos:**

1. **El core funcional del producto.** CRUD de clientes y casos, Kanban global con DnD Kit, sincronía optimista + Realtime para multi-tab.
2. **Estructura de rutas:**
   - `/clients` (lista filtrable).
   - `/clients/[id]` con tabs (Casos / Notas / Documentos / Plantillas).
   - `/kanban` con columnas por estado (`prospect`, `proposal`, `active`, `closed_won`, `closed_lost`).
3. **Server Actions con `useOptimistic`:**
   - `createClient(formData)`, `updateClient(id, formData)`, `moveCase(caseId, newStatus)`.
   - `useOptimistic` en client component para UX instantánea; rollback si la Server Action falla.
4. **Suscripción Realtime de Supabase** (multi-tab):
   ```typescript
   supabase.channel(`workspace:${workspaceId}`)
     .on('postgres_changes', {
       event: '*',
       schema: 'public',
       table: 'cases',
       filter: `workspace_id=eq.${workspaceId}`,
     }, handlePayload)
     .subscribe()
   ```
   **Filtrar por `workspace_id` es OBLIGATORIO; sin filtro hay leak entre tenants.**
5. **DnD Kit accesible:** `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`. Keyboard nav (`tabIndex`, `aria-label`, navegación con flechas).
6. **Tests de Vitest** de cada Server Action: happy path, RLS bloquea cross-tenant, validación Zod falla bien.

**Skills activas durante esta fase:**
- `shadcn` (Skill oficial) para `<Table>`, `<Tabs>`, `<Dialog>`, `<DropdownMenu>`.
- `vercel-react-best-practices` para evitar re-renders y waterfalls.
- `design-taste-frontend` calibrada en prosa para un dashboard productivo (coherencia visual sobre variedad, motion sutil, densidad alta de información).
- `animate` para transiciones del Kanban (cards que "se sienten", se mueven con intención en vez de teleportarse).
- `ui-ux-pro-max` para guidelines de tablas, modales, kanban.
- `Supabase Agent Skills` activa (heredada de C4).

**Validación visual de cierre de fase:**
- Happy path completo (crear cliente → crear caso → mover en Kanban → editar nota).
- Empty states (workspace sin clientes), loading states (skeleton), error states (red simulada).
- Mobile responsive del Kanban (usable o degrada bien).
- Keyboard nav del DnD Kit.

**Ejemplo de negocio sugerido:**

> Un consultor freelance tiene 12 clientes activos y 5 propuestas en distintos estados. Necesita ver de un vistazo qué propuesta está cerrando esta semana y cuál lleva 3 meses parada. El Kanban global de Tendr se lo da, con DnD para mover el estado, optimistic updates para sentir respuesta instantánea, y Realtime para que si tiene la app abierta en móvil y portátil, los cambios se sincronicen.

**Trade-offs clave:**

1. **Server Actions vs Route Handlers para mutaciones:** Server Actions por menos boilerplate y type-safety. Route handlers para webhooks o endpoints públicos.
2. **`useOptimistic` vs revalidación normal:** optimistic para UX premium. Revalidación normal cuando el feedback inmediato no aporta.
3. **DnD Kit vs HTML5 drag and drop nativo:** DnD Kit por accesibilidad y mejor API. Nativo si solo se quiere drag muy simple sin touch.

**Mentalidad senior a transmitir:**
- Kanban sin optimistic updates se siente lag.
- Realtime sin filtrar por workspace es la receta para un leak entre tenants.
- Empty / loading / error states son ciudadanos de primera clase.

**Qué NO delegar al agente:**
- La revisión del filtro Realtime (es un punto donde un bug del agente cuesta data leak).
- El criterio de qué estado de caso necesita más o menos visibilidad.

**Pitfalls a evitar:**
- Kanban sin optimistic updates (lag perceptible).
- No gestionar conflictos de Realtime (último gana puede perder data).
- Todo en client component (no aprovecha RSC).
- Olvidar accesibilidad del DnD.
- Saltarse empty/loading/error states.
- No filtrar Realtime por `workspace_id`.

**Referencias web verificadas:**
- Supabase Realtime: [https://supabase.com/docs/guides/realtime](https://supabase.com/docs/guides/realtime). Verificada 2026-05-19.
- DnD Kit: [https://docs.dndkit.com/](https://docs.dndkit.com/). Verificada 2026-05-19.
- `useOptimistic`: [https://react.dev/reference/react/useOptimistic](https://react.dev/reference/react/useOptimistic). Verificada 2026-05-19.

**Recursos visuales sugeridos:**
- Diagrama Mermaid del flujo Server Action + Realtime fanout.
- Tabla de estados del caso con UX por estado.

---

### C6. Documentos con Storage + AI extractor (job persistido)

**Tipo:** Tutorial · **Artefacto:** upload funcional + signed URLs + Inngest function + job visible en UI + validación visual de cierre de fase.

**Puntos clave técnicos:**

1. **Patrón crítico de la lección.** Trabajo IA largo persistido + Realtime fanout. Es exactamente lo que enseña el proyecto referencia (`ai-learning-engine`) con `generation_jobs`. **Sin esto el alumno no aprende cómo se gestiona trabajo IA en producción real.**
2. **Flujo completo:**
   - Usuario sube PDF → Server Action crea row en `documents` y row en `jobs` con `status: pending, type: extract_document` → dispara Inngest event.
   - Inngest function `extractDocument` levanta el job, marca `running`, **capability routing** (lee qué modelo eligió el workspace para `extract_document` desde `ai_feature_model_mapping`; si soporta PDF nativo pasa el PDF directo, si no extrae texto antes con `pdf-parse`), llama a `generateObject` con schema Zod para output estructurado (`fechasClave`, `importes`, `partesImplicadas`), persiste resultado en `documents.extracted_metadata`, inserta row en `ai_usage_ledger` con coste calculado, marca `jobs.status = completed`.
   - Supabase Realtime hace fanout de cambios filtrado por `workspace_id`.
   - UI muestra spinner → progreso → resultado.
3. **Storage policies** por bucket y path pattern `{workspace_id}/{client_id}/{document_id}.{ext}`. Bucket `documents` privado. Validar size (max 10MB) y type (PDF) en Server Action antes de subir.
4. **Signed URLs con TTL 1h** para descarga (`supabase.storage.from('documents').createSignedUrl(path, 3600)`).
5. **Capability routing detallado:**
   - Manifest (`ai_model_manifest`) declara `supports_pdf` por modelo.
   - Si modelo elegido (ej: Gemini 3.1 Pro, GPT-5.5) soporta PDF nativo → pasar el PDF directo.
   - Si no soporta (ej: DeepSeek, Kimi, Claude sin PDF) → extraer texto con `pdf-parse` y mandar solo texto.
   - Si el modelo no puede ejecutar la feature → bloquear desde UI con tooltip.
6. **Structured output con `generateObject` del Vercel AI SDK:** schema Zod garantiza JSON válido sin parsing manual.
7. **Trace con Langfuse:** `trace` por user-facing operation, `generation` por llamada al modelo, metadata rica (`userId`, `workspaceId`, `feature`, `provider`, `model`).
8. **Hook React `useJob(jobId)`** que suscribe a Realtime y devuelve estado actual.

**Activar Inngest MCP:** `inngest dev` en una terminal aparte. El MCP queda disponible automáticamente para invocar functions y leer ejecuciones desde Claude.

**Activar Langfuse SDK + opcional Langfuse MCP** para que el agente pueda interpretar traces durante el debug.

**Gotchas de Supabase Storage** (de Supabase Agent Skills):
- Storage upsert necesita INSERT + SELECT + UPDATE. Si vas a hacer upsert, otorga los tres.
- Tool group `storage` está disabled por defecto en Supabase MCP; activarlo explícitamente.

**Validación visual de cierre de fase:**
- Subir un PDF de prueba; ver job en `pending` → `running` → `completed`.
- Verificar que la extracción persiste tras refresh.
- Probar con PDF inválido (no es PDF, demasiado grande) y mensaje de error claro.
- Probar con PDF corrupto y job marca `failed` sin colgar la UI.
- Verificar signed URL caduca tras 1h.

**Trade-offs clave:**

1. **Server Action vs Inngest job para extracción:** Server Action sirve si el trabajo tarda < 5s. La extracción de PDF con LLM tarda > 5s (Vercel timeout). Por eso Inngest.
2. **Sync polling vs Realtime para progreso:** Realtime por UX premium y menor coste de red.
3. **`generateObject` con Zod vs parsing manual:** Zod siempre. Parsing manual de respuestas LLM es bug magnet.

**Mentalidad senior a transmitir:**
- Trabajo IA largo en Server Action = timeout de Vercel a los 10s.
- Sin persistir el job, un fallo de Inngest pierde la operación sin rastro.
- Capability routing es producto, no detalle técnico: el modelo equivocado puede romper la feature silenciosamente.

**Qué NO delegar al agente:**
- La elección de `supports_pdf` en el manifest (validar con el provider antes de marcar).
- El criterio de qué tamaño máximo aceptar (depende del producto y del coste).

**Pitfalls a evitar:**
- Upload sin validar tamaño/tipo (DoS o tipos maliciosos).
- Signed URLs sin TTL.
- Trabajo IA en Server Action (timeout).
- No persistir errores de Inngest.
- No filtrar Realtime por `workspace_id`.
- No probar el camino del error (job `failed`).

**Referencias web verificadas:**
- Inngest Next.js: [https://www.inngest.com/docs/sdk/serve](https://www.inngest.com/docs/sdk/serve). Verificada 2026-05-19.
- Supabase Storage: [https://supabase.com/docs/guides/storage](https://supabase.com/docs/guides/storage). Verificada 2026-05-19.
- Vercel AI SDK `generateObject`: [https://sdk.vercel.ai/docs/reference/ai-sdk-core/generate-object](https://sdk.vercel.ai/docs/reference/ai-sdk-core/generate-object). Verificada 2026-05-19.
- Langfuse Vercel AI SDK integration: [https://langfuse.com/docs/integrations/vercel-ai-sdk](https://langfuse.com/docs/integrations/vercel-ai-sdk). Verificada 2026-05-19.

**Recursos visuales sugeridos:**
- Diagrama Mermaid del flujo: upload → Server Action → jobs → Inngest → AI SDK → Langfuse → Realtime → UI.
- Tabla de estados del job con UX por estado.

---

### C7. Plantillas con AI + multi-provider BYO key + observabilidad LLM

**Tipo:** Tutorial · **Artefacto:** editor de plantillas + adapter con streaming + UI de settings AI con BYO key + capability validation + cost budget + Langfuse trazando todo. La fase más densa de la lección.

**Puntos clave técnicos:**

Esta fase tiene **dos piezas grandes que se montan juntas**:

1. **Feature de plantillas con AI** (markdown + variables + preview + adapter síncrono con streaming).
2. **Sistema de AI provider settings + BYO key + model picker per-feature**, que sirve a TODAS las features IA del producto (esta + las de C6).

#### Bloque A · Settings AI + BYO key

1. **Página `/settings/ai` con tres tabs:**
   - **Providers:** lista de OpenAI / Anthropic / Google / DeepSeek / Kimi con estado (configurado / no). Click abre formulario para meter API key.
   - **Models per feature:** tabla con cada feature (`Adaptar plantilla`, `Resumir relación`, `Sugerir acción`, `Extraer documento`) y dropdown del modelo. Modelos sin capability requerida aparecen disabled con tooltip.
   - **Usage & budget:** gráfico de coste por feature + budget mensual editable + warnings.
2. **Server Action `saveProviderKey(provider, plaintextKey)`:**
   - Validación de la key con llamada test al provider (`models.list()` o ping).
   - Si válida, cifrado con **envelope encryption AES-256-GCM**:
     - Generar DEK random (32 bytes).
     - Cifrar la key con DEK (AES-256-GCM).
     - Cifrar el DEK con KEK (env var `AI_KEY_KEK`, también 32 bytes).
     - Guardar `encrypted_key`, `key_iv`, `key_tag`, `encrypted_dek` en `ai_provider_configs`.
   - **Plaintext key nunca persiste en logs ni en BD.**
3. **Helper server-side `getProviderClient(workspaceId, provider)`:**
   - Recupera row de `ai_provider_configs`.
   - Descifra DEK con KEK.
   - Descifra key con DEK.
   - Devuelve cliente del provider con la key (en memoria, no persiste).
   - Tras la llamada, la key se descarta.

**Por qué envelope encryption y no cifrado directo:** envelope permite rotar la KEK sin re-cifrar todas las keys de usuarios (basta con re-cifrar los DEKs). Cifrado directo con KEK obliga a re-cifrar cada key cuando rotas la KEK, operación cara y arriesgada.

#### Bloque B · Manifest curado de modelos

4. **Tabla `ai_model_manifest`** poblada inicialmente con un seed (~20 modelos top de 2026 con sus capabilities).
5. **Job programado (Vercel Cron semanal)** que combina `models.list()` de cada provider con curación humana para detectar nuevos modelos y deprecar los retirados.
6. **Helper `getAvailableModels(provider, featureRequirements)`** que filtra el manifest según capabilities requeridas.

#### Bloque C · Adaptador de plantillas con Vercel AI SDK

7. **Schema `templates`** con `body_markdown` y `variables[]`.
8. **UI:** editor markdown con preview a la derecha (tipo Stripe Atlas).
9. **Server Action `adaptTemplate`:**
   - Carga `model_id` y `provider` desde `ai_feature_model_mapping` para `adapt_template`.
   - Obtiene cliente con `getProviderClient(workspaceId, provider)`.
   - Llama con `streamText` del Vercel AI SDK (streaming).
   - Traza con el SDK v4 de Langfuse (OTEL): `startObservation` de `@langfuse/tracing` con `asType: 'generation'`, metadata completa y `usageDetails` con `inputTokens`/`outputTokens`/`totalTokens`; el `LangfuseSpanProcessor` se inicializa una vez en la instrumentación.
   - Tras completar, inserta row en `ai_usage_ledger` con tokens y coste calculado.

#### Bloque D · Cost budget tracker

10. **Middleware** en route handlers de features IA: antes de ejecutar, consulta `ai_usage_ledger` del mes actual del workspace, compara con budget en `workspaces.ai_monthly_budget_cents`. Si se superó, devuelve 429 con mensaje claro.
11. UI muestra warning a 80% del budget, bloqueo a 100%.
12. Reset mensual con cron.

#### Bloque E · Gating de plan Pro + validación visual

13. Middleware Pro de C8 chequea que el workspace tiene plan Pro/Team antes de permitir features IA.
14. **Validación visual de cierre de fase.** Crear plantilla con variables; configurar provider (OpenAI), meter API key, validar; elegir GPT-4o para `adapt_template`; adaptar plantilla para un cliente; verificar streaming en UI; abrir Langfuse y comprobar trace con tokens y coste; abrir `ai_usage_ledger` y comprobar row; cambiar a otro provider/modelo y repetir; intentar elegir un modelo sin PDF para `extract_document` → debe aparecer disabled; superar budget simulado → bloqueo correcto; key inválida → error claro sin filtrar la key; probar como Free → redirect a upgrade.

**Herramientas activas durante esta fase:**

- **Context7 MCP** imprescindible: las APIs de Vercel AI SDK cambian rápido.
- **Langfuse Skill oficial** + Langfuse MCP.
- **Supabase MCP** (tool group `database`) para las tablas IA.
- **`claude-api` Skill** para integración.

**Trade-offs clave:**

1. **Envelope encryption vs cifrado directo:** envelope siempre para rotación realista.
2. **Manifest curado vs confiar en `models.list()` de providers:** manifest curado porque la API de cada provider no expone capabilities uniformes.
3. **Capability validation client + server vs solo server:** los dos. Solo server da mal UX (el modelo aparece pero falla al usar).
4. **Streaming vs response completa:** streaming siempre para UX premium en operaciones síncronas.
5. **`generateObject` con Zod vs parsing manual:** Zod siempre.

**Mentalidad senior a transmitir:**
- Manejar API keys de usuario es responsabilidad seria: cifrado, rotación, audit log, validación.
- Coste de IA no es magia: es presupuesto que se traza, se imputa al usuario correcto, se limita.
- Las capabilities de modelos cambian con cada release; sin manifest curado el producto se rompe.

**Qué NO delegar al agente:**
- La generación del KEK (debe ser secret de alta entropía).
- El criterio de qué modelos meter en el manifest seed (decisión de producto).
- La validación de la implementación de envelope encryption línea por línea.

**Pitfalls a evitar:**
- Guardar API key en plaintext en BD o en logs.
- Devolver la key cifrada al cliente.
- No validar la key antes de guardar.
- Olvidar el envelope encryption (cifrar directo con KEK rompe rotación).
- Confiar en `models.list()` para capabilities.
- Olvidar el cost budget (factura del usuario explota silenciosamente).
- No trazar con metadata estructurada.
- Capability validation solo en backend.
- Streaming sin manejar cancelación (user cierra pestaña, llamada sigue gastando tokens).
- No probar con múltiples providers (cada uno tiene semántica de error distinta).

**Referencias web verificadas:**
- Vercel AI SDK streaming: [https://sdk.vercel.ai/docs/ai-sdk-core/streaming](https://sdk.vercel.ai/docs/ai-sdk-core/streaming). Verificada 2026-05-19.
- Vercel AI SDK provider support: [https://sdk.vercel.ai/providers](https://sdk.vercel.ai/providers). Verificada 2026-05-19.
- Node crypto AES-256-GCM: [https://nodejs.org/api/crypto.html](https://nodejs.org/api/crypto.html). Verificada 2026-05-19.
- Langfuse SDK: [https://langfuse.com/docs/sdk](https://langfuse.com/docs/sdk). Verificada 2026-05-19.

**Recursos visuales sugeridos:**
- Diagrama Mermaid del flujo de envelope encryption (DEK + KEK).
- Tabla de modelos en el manifest con capabilities.
- Diagrama del flujo `adaptTemplate` end-to-end con Langfuse y `ai_usage_ledger`.

---

### C8. Pagos con Stripe sandbox

**Tipo:** Tutorial · **Artefacto:** Stripe Checkout funcional + webhook signed + idempotencia + middleware de gating + validación visual de cierre de fase.

**Puntos clave técnicos:**

1. **Cuenta Stripe + test mode** (gratis, instantánea, sin verificación de empresa).
2. **Stripe MCP activo** (`claude mcp add --transport http stripe https://mcp.stripe.com`). Crear productos vía Claude: "crea producto 'Tendr Pro' con precio €9/mes recurring; crea 'Tendr Team' con precio €29/mes". El MCP los crea y devuelve `price_id` que el alumno mete en `.env.local` como `STRIPE_PRICE_PRO`, `STRIPE_PRICE_TEAM`.
3. **Server Action `createCheckoutSession({ priceId })`** que devuelve URL de Stripe Checkout. Pasa `client_reference_id: workspaceId` para correlacionar en el webhook.
4. **Webhook handler en `/api/webhooks/stripe/route.ts`:**
   - Recibe raw body (no JSON parsed automáticamente).
   - Verifica firma con `stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET)`. Si firma inválida → 400.
   - **Idempotencia:** intentar insertar en `stripe_webhook_events` con `event_id` como PK. Si conflict, `return 200 'already processed'`.
   - Switch por `event.type`: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
   - Actualizar `subscriptions` en transacción atómica (Drizzle `db.transaction`).
5. **Helper `requirePlan('pro')`** (en Server Actions) que consulta `subscriptions` por `workspace_id`, valida `status='active'` y `current_period_end > now()`. Si free, redirige a `/upgrade`.
6. **Test local con Stripe CLI:**
   ```
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
   Copia el `webhook_secret` que imprime y mételo en `.env.local`. Disparar eventos manuales:
   ```
   stripe trigger checkout.session.completed
   stripe trigger customer.subscription.deleted
   ```
7. **Probar idempotencia explícitamente:** `stripe events resend evt_xxx` dos veces; verificar que la segunda no duplica row.
8. **Test card** `4242 4242 4242 4242` con cualquier CVC y fecha futura.

**Validación visual de cierre de fase:**
- Flujo completo: user Free intenta feature Pro → redirige a Checkout → completa pago con test card → vuelve a la app → feature Pro desbloqueada.
- Abrir `subscriptions` y verificar que el row está creado correcto.
- Ejecutar `stripe trigger customer.subscription.deleted` y verificar que el plan vuelve a Free.
- Reenviar el mismo webhook dos veces y verificar que no se duplica nada (idempotencia).
- Verificar UI durante el redirect a Stripe (loading state correcto).

**Trade-offs clave:**

1. **Stripe Checkout vs Payment Element:** Checkout (hosted) por simplicidad y compliance. Payment Element si necesitas integración inline avanzada.
2. **Webhook signed obligatorio:** sin firma, cualquiera puede disparar eventos falsos. No es opcional.
3. **Idempotencia con `event_id` como PK:** evita doble cobro o estado inconsistente si Stripe reintenta.

**Mentalidad senior a transmitir:**
- Webhook sin verificar firma es vulnerabilidad.
- Sin idempotencia, un retry de Stripe puede duplicar suscripciones.
- Gating en client es bypass trivial; siempre server-side (middleware + RLS).

**Qué NO delegar al agente:**
- La revisión del handler de webhook (es donde un bug del agente cuesta dinero).
- La configuración de productos en Stripe Dashboard si la cuenta ya tiene productos vivos.

**Pitfalls a evitar:**
- Webhook sin verificar firma.
- No idempotencia (cobro doble o estado inconsistente).
- Gating en client (bypass trivial).
- No probar con `stripe trigger` local antes de prod.
- Olvidar webhook secret en env.
- No probar el flow de downgrade.

**Referencias web verificadas:**
- Stripe webhooks: [https://docs.stripe.com/webhooks](https://docs.stripe.com/webhooks). Verificada 2026-05-19.
- Stripe Checkout: [https://docs.stripe.com/payments/checkout](https://docs.stripe.com/payments/checkout). Verificada 2026-05-19.
- Stripe MCP: [https://docs.stripe.com/mcp](https://docs.stripe.com/mcp). Verificada 2026-05-19.
- Stripe CLI: [https://docs.stripe.com/stripe-cli](https://docs.stripe.com/stripe-cli). Verificada 2026-05-19.

**Recursos visuales sugeridos:**
- Diagrama Mermaid del flujo Checkout + webhook + idempotencia.
- Tabla de eventos de Stripe que se procesan y qué actualizan en `subscriptions`.

---

### C9. Validación end-to-end y QA visual

**Tipo:** Tutorial · **Artefacto:** suite E2E con Playwright + reporte de a11y por pantalla + checklist de QA pasado.

**Puntos clave técnicos:**

1. **Por qué una fase dedicada al QA.** Cada fase anterior validó su parte aislada. Los SaaS reales fallan en los **flujos cruzados**: signup que rompe al crear el primer cliente, plantillas que fallan tras upgrade a Pro, jobs que no aparecen en realtime tras refresh.
2. **Donde corre la suite E2E:** en local contra Supabase local (`supabase start`); en CI contra el preview deploy de Vercel, que apunta al proyecto Supabase único del curso. Los datos de test son sintéticos y cada run borra los workspaces que creó. Con plan Pro, las preview branches por PR darían una BD aislada por PR y runs en paralelo; en Free, el aislamiento lo aporta la limpieza disciplinada.
3. **Configurar `e2e/` con Playwright + axe-core:**
   ```
   pnpm add -D @playwright/test @axe-core/playwright
   npx playwright install
   ```
4. **Listar flujos críticos (5–7 máximo, no más):**
   - Anon → crear primer cliente → promocionar a autenticado → data preservada.
   - Crear cliente → crear caso → mover en Kanban → editar nota.
   - Subir documento → ver job en progreso → ver extracción completa.
   - Crear plantilla → adaptar con IA → preview correcto.
   - User Free hit feature Pro → redirect a Checkout → completar pago test → desbloqueado.
5. **Viewports en `playwright.config.ts`:**
   ```typescript
   projects: [
     { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
     { name: 'tablet-chromium', use: { ...devices['iPad Mini'] } },
     { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
     { name: 'desktop-webkit', use: { ...devices['Desktop Safari'] } },
     { name: 'desktop-firefox', use: { ...devices['Desktop Firefox'] } },
   ]
   ```
6. **A11y audit integrado en cada test:**
   ```typescript
   import AxeBuilder from '@axe-core/playwright'
   const results = await new AxeBuilder({ page }).analyze()
   expect(results.violations).toEqual([])
   ```
7. **Visual review manual contra `design.md` heredado de L16:** el agente con `judgment-day` Skill hace revisión adversarial: "audita visualmente la app contra el `design.md` heredado y reporta deltas con criterio". Documentar findings en `docs/qa-checklist.md`.
8. **Reuso de la Skill `landing-auditor` de L16** para auditar también la app (al menos las páginas públicas como `/`, `/login`, `/upgrade`).
9. **Si hay findings:** arreglar antes de pasar a C10. La gate es estricta. Tras fix, re-run suite completa.

**Activar Supabase MCP** para verificar que el proyecto está migrado al schema actual.

**Trade-offs clave:**

1. **5–7 flujos críticos vs testear todo:** testear lo que mata el producto si falla. Testear todo produce suite lenta que nadie corre.
2. **E2E contra el proyecto cloud vs Supabase local:** local siempre que se pueda; contra el proyecto cloud solo con datos sintéticos y limpieza tras cada run.
3. **A11y automatizado vs revisión manual:** los dos. Automatizado captura el 80%; el 20% restante (navegación por teclado real, lector de pantalla) es humano.

**Mentalidad senior a transmitir:**
- E2E que testean implementación son frágiles. E2E que testean comportamiento son útiles.
- A11y no es opcional; es parte del producto desde el primer commit.
- Visual review "a ojo rápido" no es review; es opinión. La review se hace contra el `design.md`.

**Qué NO delegar al agente:**
- La elección de los flujos críticos (decisión de producto).
- La revisión humana de a11y con lector de pantalla.

**Pitfalls a evitar:**
- E2E que testean implementación, no comportamiento.
- Testear todo (suite lenta).
- Saltarse a11y porque "el agente lo hace bien".
- Olvidar empty/loading/error states.
- Test pasa en Chromium y rompe en WebKit.
- Tratar esta fase como opcional. Es la gate.

**Referencias web verificadas:**
- Playwright: [https://playwright.dev/](https://playwright.dev/). Verificada 2026-05-19.
- `@axe-core/playwright`: [https://www.npmjs.com/package/@axe-core/playwright](https://www.npmjs.com/package/@axe-core/playwright). Verificada 2026-05-19.

**Recursos visuales sugeridos:**
- Tabla de flujos críticos con paso a paso resumido.
- Tabla de viewports y browsers con justificación.

---

### C10. CI/CD agéntico + observabilidad completa + deploy

**Tipo:** Tutorial · **Artefacto:** GitHub Actions completo + Sentry + Langfuse activado + smoke check + deploy a producción.

**Puntos clave técnicos:**

1. **Activar MCPs de observabilidad** que se usarán en producción:
   - Sentry MCP (`claude mcp add --transport http sentry https://mcp.sentry.dev/mcp`).
   - Langfuse MCP (`claude mcp add --transport http langfuse https://cloud.langfuse.com/api/public/mcp`).
   - Langfuse Skill oficial.
2. **`.github/workflows/ci.yml`** disparado en PR:
   ```yaml
   jobs:
     validate:
       - run: pnpm install
       - run: pnpm lint
       - run: pnpm typecheck
       - run: pnpm test
       - run: pnpm drizzle-kit check
       - run: pnpm build
     preview:
       - Vercel preview deploy automático (integration)
       - BD del preview: proyecto Supabase único del curso (Branching requiere plan Pro)
     ai-review:
       - uses: anthropics/claude-code-action@v1
   ```
3. **`.github/workflows/deploy.yml`** disparado en push a `main`:
   - Supabase deployment workflow se dispara automáticamente (clone → pull migrations → health checks → migrate).
   - Vercel deploy production automático (integration).
   - Smoke check post-deploy con Playwright CLI.
4. **`instrumentation.ts` con Sentry init:**
   ```typescript
   import * as Sentry from '@sentry/nextjs'
   Sentry.init({
     dsn: process.env.SENTRY_DSN,
     environment: process.env.VERCEL_ENV ?? 'development',
     release: process.env.VERCEL_GIT_COMMIT_SHA,
     tracesSampleRate: 0.1,
   })
   ```
   Source maps subidos en build con `@sentry/cli`.
5. **Verificar Langfuse traces** en cloud: disparar manualmente un `adaptTemplate` + una extracción de documento desde producción. Abrir Langfuse, ver traces con metadata completa, coste, latencia.
6. **`e2e/smoke.spec.ts` con Playwright CLI** ejecutado contra producción: login → crear cliente → adaptar plantilla. Devuelve exit 1 si falla.
7. **Disclaimer ToS de Vercel en README** + tres caminos de salida documentados.
8. **Ejercicio explícito de ToS** (clave pedagógica): *"usa WebSearch y verifica si mi uso de Vercel Hobby para Tendr con Stripe activo viola los Fair Use Guidelines actuales"*. Documentar en README.
9. **Demostración del flujo de debug agéntico** (clave pedagógica):
   - Alumno simula un error en producción → Sentry lo captura → invoca *"usa Sentry MCP para leer el último issue del proyecto Tendr y diagnostica root cause"*. El agente lee stack trace + Seer analysis y propone fix.
10. **Demostración del flujo de debug de coste IA:** *"hay un workspace con coste anómalo; usa Langfuse MCP para encontrar los traces más caros del último día y diagnostica"*. El agente investiga + propone optimización (prompt más corto, cambio de modelo, cache).

**Trade-offs clave:**

1. **`claude-code-action` vs review manual:** el agente revisa todo PR como base; el humano sigue siendo decisor final.
2. **Sentry traces sample 10% vs 100%:** 10% basta para detectar tendencias sin coste; 100% solo en debugging puntual.
3. **Smoke test vs no smoke:** smoke siempre. Si falla el smoke, deploy se considera roto.

**Mentalidad senior a transmitir:**
- El agente como actor del pipeline, no asistente externo.
- El deploy no es el final, es el inicio del ciclo de feedback con Sentry + Langfuse + Vercel Analytics.
- Documentar las rutas de salida del free tier desde el inicio.

**Qué NO delegar al agente:**
- La protección de la rama `main`.
- La rotación de secretos si se filtra alguno.

**Pitfalls a evitar:**
- No proteger branch `main` (cualquiera push directo).
- No testear migraciones (rollback imposible si falla en prod).
- Saltarse smoke check.
- Olvidar source maps de Sentry (errores ilegibles).
- No probar `claude-code-action` configurado bien.

**Referencias web verificadas:**
- Claude Code Action: [https://github.com/anthropics/claude-code-action](https://github.com/anthropics/claude-code-action). Verificada 2026-05-19.
- Sentry Next.js: [https://docs.sentry.io/platforms/javascript/guides/nextjs/](https://docs.sentry.io/platforms/javascript/guides/nextjs/). Verificada 2026-05-19.
- Sentry MCP + Seer: [https://docs.sentry.io/product/integrations/mcp/](https://docs.sentry.io/product/integrations/mcp/). Verificada 2026-05-19.
- Vercel + Supabase integration: [https://vercel.com/integrations/supabase](https://vercel.com/integrations/supabase). Verificada 2026-05-19.

**Recursos visuales sugeridos:**
- Diagrama Mermaid del pipeline completo: PR → checks → preview → AI review → merge → migrate → deploy → smoke.
- Tabla de capas de observabilidad: Sentry / Langfuse / tabla `jobs` con qué captura cada una.

---

## Riesgos y mitigaciones del caso

| Riesgo | Mitigación |
|---|---|
| 10 fases pueden sentirse largo en grabación | C1, C2 y C9 son cortas; C5, C6 y C10 son densas. C9 (QA) se puede ejecutar en paralelo a la grabación |
| Supabase pausa el proyecto tras 1 semana sin actividad | Documentar despausa en 1 click; Neon como alternativa |
| Vercel ToS puede cambiar | Lección sobre revisión periódica |
| Inngest free tier suficiente pero finito | 50k runs/mes cubre; Trigger.dev como alternativa |
| Langfuse adquirido por ClickHouse | Licencia MIT confirmada; self-host disponible |
| Stripe test mode confunde con producción | Aclarar explícitamente: en test mode no hay riesgo financiero |
| Manejar API keys de usuario es responsabilidad seria | Envelope encryption + key nunca al cliente + audit log + validación al guardar + posibilidad de revocar |
| Capabilities de modelos cambian con cada release | Manifest curado + cron semanal + alertas si un modelo del manifest se deprecia |
| Costes de IA explotan en producción | Cost budget por workspace + warnings 80% + bloqueo 100% + dashboard |
| Diferencias semánticas de errores entre providers | Capa de error normalization en wrapper del Vercel AI SDK |
| Alumno no termina por longitud | MVP defendible en primeras 6 fases (C1–C5 + C8); C7 es la más densa pero la más diferenciadora; C9 y C10 son refuerzo profesional |

---

## Hacia dónde lleva esta lección

L17 cierra el track Fullstack del programa con un SaaS real desplegado en producción: producto B2B con IA multi-provider, auth premium, jobs persistidos, pagos en sandbox, observabilidad multicapa, QA visual + E2E y CI/CD agéntico. Es el esqueleto que el alumno puede convertir en cualquier idea facturable.

El siguiente paso natural del alumno depende de su track:

- **L18 (Mobile)** del propio M5 si quiere acompañar Tendr con app móvil (queda fuera de los proyectos del equipo actual).
- **Track AI Engineering (L19–L20)** si quiere profundizar en LLMs en runtime: RAG, agentes con tool use, evaluación, sistemas multi-agente.

Lo construido en L17 es el patrón fullstack moderno con IA en 2026: un SaaS multi-tenant con BYO key, jobs persistidos, observabilidad real y CI/CD donde el agente es actor del pipeline.

---

## Notas para el agente generador-guia

- **Formato caso-práctico:** las clases C1–C10 no siguen la estructura de secciones numeradas del tronco común. Se organizan por bloques del guion grabable.
- **Frontmatter:** `tipo: caso-práctico` en todas las clases C1–C10. C0 mantiene `tipo: introducción`.
- **Continuidad narrativa:** las clases cuentan un proyecto único de principio a fin con referencias cruzadas naturales ("el `spec.md` que escribiste antes", "el schema con RLS", "el patrón de jobs persistidos que aplicaste al extractor"), **sin notación interna del programa**.
- **Stack único, no comparativa:** este caso fija un stack y lo desarrolla. Las alternativas se mencionan en C2 como ADRs.
- **Producto fijado:** Tendr. Identidad visual heredada del `design.md` de L16. Pricing tiers Free / Pro €9 / Team €29 "próximamente".
- **Multi-provider BYO key con envelope encryption es la pieza diferenciadora:** integrarlo bien en C3 (tablas), C6 (uso en extractor) y C7 (sistema completo). No tratarlo como detalle técnico.
- **Patrón jobs persistidos + Realtime es el patrón más importante de la lección:** introducirlo bien en C6 y reusarlo en C7 si aplica.
- **Validación visual al cerrar cada fase de construcción (C5–C8) + gate dedicada en C9.** No saltar.
- **Cambios de Next.js 16 y Supabase 2026 son críticos:** `proxy.ts` no `middleware.ts`; claves `sb_publishable_xxx` y `sb_secret_xxx`. Avisar explícitamente y no copiar tutoriales viejos.
- **Código completo permitido** cuando hace falta para seguir el flujo.
- **Tono:** voz del formador-mentor que construye en directo. Primera persona del formador permitida. Sin perder rigor técnico.
- **Verificaciones operativas:** RLS verificada con tests, webhook firmado, idempotencia probada, envelope encryption correcta, capability validation server + client, cost budget activo, Langfuse trazando todo, suite E2E pasando, a11y AA en pantallas principales.
- **Idioma:** español neutro, sin voseo, sin guion largo retórico (excepto cabecera y pie del template), sin patrón "no es A, es B".
- **Notación interna:** prohibida en cuerpo de guía. Solo en cabecera y pie. No usar "track Fullstack" ni "M5" en cuerpo.
- **Decisiones compartidas con L16:** `../_compartido/tecnico/preguntas-compartidas.md`.
- **Reuso de L16:** `design.md` heredado para identidad visual; Skill `landing-auditor` reutilizable.
- **SDD aplicado a feature, no a producto entero:** ver `../_compartido/tecnico/sdd-framework-adapters.md`. Cada feature mayor (auth, workspace, documentos, plantillas, pagos) es un cambio SDD independiente que se ejecuta con `sdd-explore → sdd-propose → sdd-spec → sdd-design → sdd-tasks → sdd-apply → sdd-verify → sdd-archive`.
- **Per-phase model assignment (gentle-ai):** el alumno puede asignar modelos distintos a fases distintas. Opus para `sdd-design`, Sonnet para `sdd-apply`, Haiku para `sdd-archive`. Reduce coste sin sacrificar calidad.
