# ADR-001 · Arquitectura de plataforma y stack por capa

> Decisión arquitectónica versionada. Cambios mayores requieren nuevo ADR que supersede a este.

---

## Estado

Aceptada

## Fecha

2026-06-06

## Contexto

Tendr es un mini-CRM B2B para perfiles junior, desarrollado como MVP de aprendizaje (curso M5/L17) sobre Next.js 16 App Router. El stack debe ser 100% gratuito —único coste real: la IA del usuario vía BYO key—, con RLS profunda por `workspace_id` como eje de seguridad, patrón anónimo→autenticado, trabajo IA largo (>5s) que no cabe en Server Actions (Vercel Hobby corta a 10s), pagos en sandbox (nunca dinero real) y gating Free/Pro €9. Alcance MVP: CRUD clientes/casos/kanban, documentos con extractor IA asíncrono, plantillas multi-provider BYO key y pagos sandbox. Fuera de alcance: plan Team operativo, RAG/embeddings, app móvil y realtime colaborativo con presence.

## Decisión

Se adopta un stack por capa, todo en plan gratuito, verificado en junio 2026:

| Capa | Elección | Cuota gratuita relevante |
|---|---|---|
| Hosting | Vercel Hobby | 100GB transfer, 1M invocations, 6.000 build min |
| BaaS | Supabase Free | 500MB DB, 1GB storage, 50k MAU, 5GB egress; Auth anónimo→autenticado (`linkIdentity` preserva `auth.uid()`), RLS, Storage signed URLs, Realtime |
| Background jobs | Inngest Free | 50k ejecuciones/mes, 5 steps concurrentes, retries declarativos, dev server local + MCP oficial; servido desde route de Next.js |
| Observabilidad LLM | Langfuse Cloud Free | 50k observations/mes, 30 días retención; integración oficial Vercel AI SDK; core MIT (self-host como salida) |
| Pagos | Stripe test mode | Sandbox indefinido sin verificación; Checkout + webhooks firmados (`constructEvent`) + idempotencia; 2.9% + $0.30 si fuera live |
| Feature flags | PostHog Free | 1M flag requests/mes + 1M eventos analytics/mes; gating por plan y kill-switch de features IA |

## Alternativas consideradas

| Opción | Tradeoff principal |
|---|---|
| Vercel Hobby (hosting, elegida) | Gana por integración nativa Next.js 16; ToS prohíbe uso comercial |
| Cloudflare Workers + @opennextjs/cloudflare v1.19.11 | Descartado: adaptador no first-party, límite 10ms CPU/request |
| Netlify | Descartado hoy: runtime Next.js 16 sin verificar |
| Supabase Free (BaaS, elegida) | Gana por Auth+RLS+Storage+Realtime integrados y promoción anónimo→autenticado nativa |
| Neon + Clerk | Descartado: composable pero sin Storage ni Realtime; Clerk free sin MFA; se pierde anónimo→autenticado nativo |
| Firebase Spark | Descartado: NoSQL elimina SQL/RLS auditable/Drizzle |
| Inngest Free (jobs, elegida) | Gana por cuota fija predecible y orquestación con steps/retries |
| Trigger.dev v4 | Descartado: ejecuta en infra propia (ventaja) pero free es $5 créditos/mes (menos predecible), logs 1 día |
| QStash | Descartado: solo delivery, sin orquestación |
| Langfuse Cloud Free (obs, elegida) | Gana por cuota e integración Vercel AI SDK; core MIT como salida |
| Helicone | Descartado: 10k requests/mes y 7 días retención (5x menos cuota); patrón proxy encaja mal con BYO key multi-provider |
| Stripe test mode (pagos, elegida) | Gana por sandbox indefinido sin verificación; no es Merchant of Record |
| Paddle | Documentado como salida si se monetiza (MoR, 5% + $0.50, sandbox propio) |
| Lemon Squeezy | Descartado: adquirida por Stripe y en migración a Stripe Managed Payments (riesgo de deprecación) |
| PostHog Free (flags, elegida) | Gana por cuota holgada y UI de targeting; un vendor más, SDK con peso en cliente |
| Vercel Flags SDK + Edge Config | Descartado: cero vendors nuevos pero 250 escrituras/mes en free se agotan iterando flags, sin UI de targeting |

## Tradeoffs aceptados

- **Vercel Hobby**: el ToS prohíbe uso comercial (verificado, actualización 2026-05-31; terminación sin aviso posible). Aceptado por ser proyecto de aprendizaje, con disclaimer en README y caminos de salida documentados (Vercel Pro $20/dev/mes y alternativas de la tabla).
- **Supabase**: pausa tras 1 semana de inactividad (mitigación: cron keep-alive o despausa en 1 click) y acoplamiento vendor (Auth+RLS+Realtime juntos encarecen una migración futura).
- **Inngest**: los workers ejecutan a través del endpoint en Vercel y heredan los límites por step (mitigado manteniendo steps cortos).
- **Langfuse**: la adquisición por ClickHouse (enero 2026) es un riesgo de roadmap a vigilar; Cloud opera standalone y el core sigue MIT (salida self-host real).
- **Stripe**: no es Merchant of Record; si la app facturara en serio en la UE, el IVA es responsabilidad propia.
- **PostHog**: un vendor adicional y SDK con peso en cliente (mitigación: evaluación de flags server-side).

## Consecuencias

Qué condiciona esta decisión en el resto del producto (fases F3–F10):

- **F3 (schema + RLS)**: toda tabla con `workspace_id` lleva policies SELECT+INSERT+UPDATE+DELETE testeadas (Vitest + Supabase local); claves nuevas `sb_publishable_`/`sb_secret_` desde el día 1.
- **F4 (auth)**: patrón anónimo→autenticado de Supabase con magic link; `proxy.ts` (no `middleware.ts`, renombrado en Next.js 16).
- **F5 (workspace core)**: Realtime filtrado por `workspace_id` obligatorio (sin filtro = leak entre tenants).
- **F6 (documentos + extractor)**: el trabajo IA vive en Inngest functions, nunca en Server Actions (timeout 10s de Hobby); jobs persistidos (tabla `jobs`) + Realtime fanout; trace Langfuse por operación.
- **F7 (AI multi-provider)**: Vercel AI SDK como abstracción; BYO key con envelope AES-256-GCM (plaintext nunca en BD, logs ni cliente); coste en `ai_usage_ledger` y trazado en Langfuse.
- **F8 (pagos)**: webhook firmado con `constructEvent` + tabla `stripe_webhook_events` para idempotencia; gating por plan en `proxy.ts` apoyado en flags de PostHog.
- **F9–F10 (QA + deploy)**: los objetos de test de Stripe no migran a live; el deploy queda en Hobby con disclaimer de ToS en README; si se monetiza, ejecutar el camino de salida de hosting antes de cobrar dinero real.
- **Camino de salida (hosting)**: Vercel Pro $20/dev/mes, o portar a Cloudflare/Netlify con las salvedades de la tabla de alternativas.

## Criterio de revisión

Bajo qué condiciones se reabre esta decisión:

- Decisión de monetizar de verdad (cobro real): dispara revisión de hosting (ToS comercial) y de pagos (Merchant of Record / IVA UE → Paddle).
- Superación recurrente de cualquier cuota gratuita (invocations, observations, flag requests, MAU, storage).
- Cambio de roadmap de Langfuse tras la adquisición por ClickHouse que afecte Cloud Free o la licencia MIT del core.
- Deprecación anunciada de Stripe test mode o cambios en límites de Vercel Hobby / Supabase Free / Inngest Free.

## Referencias

- vercel.com/docs/limits · vercel.com/legal/terms
- supabase.com/pricing
- inngest.com/pricing · trigger.dev/pricing
- langfuse.com/pricing · clickhouse.com/blog (adquisición Langfuse) · helicone.ai/pricing
- stripe.com/pricing · docs.stripe.com/sandboxes · lemonsqueezy.com/blog/2026-update · paddle.com/pricing
- posthog.com/pricing · vercel.com/docs/limits (Edge Config writes)
- Todas las URLs verificadas el 2026-06-06.

---

*ADR-001. Última revisión: 2026-06-06.*
