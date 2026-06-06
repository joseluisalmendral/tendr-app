# ADR-001 · Arquitectura general de Tendr SaaS

> Ejemplo poblado del ADR de arquitectura que el alumno cierra en F2.

---

## Estado

Aceptada

## Fecha

2026-MM-DD

## Contexto

Tendr es un SaaS B2B junior con alcance MVP definido en `spec.md` (F1): clientes, casos, Kanban, notas, documentos con extractor IA, plantillas con IA adapter multi-provider y pagos en sandbox. Requiere stack 100% gratuito (excepto IA del usuario via BYO key) y debe replicarse por el alumno sin barreras.

## Decisión

Stack elegido por capa:

| Capa | Herramienta | Plan |
|---|---|---|
| Hosting | Vercel Hobby | Free (con disclaimer de ToS en ADR-002) |
| BaaS (DB + Auth + Storage + Realtime) | Supabase | Free tier |
| Background jobs | Inngest | Free tier (50k runs/mes) |
| AI abstraction layer | Vercel AI SDK | OSS (ver ADR-003) |
| LLM observability | Langfuse Cloud | Free tier (50k observations/mes) |
| App observability | Sentry | Free tier (5k errores/mes) |
| Pagos | Stripe (test mode) | Sandbox gratuito |
| Feature flags + analytics | PostHog (cloud EU) | Free tier |
| ORM | Drizzle ORM + drizzle-kit | OSS |
| Framework | Next.js 16 (App Router) | OSS |
| Estilos | Tailwind v4 | OSS |
| Componentes | shadcn/ui | OSS |
| Package manager | pnpm 11+ | OSS |

## Alternativas consideradas

| Capa | Opción descartada | Tradeoff |
|---|---|---|
| Hosting | Cloudflare Pages | Mejor para uso comercial pero peor DX con Next.js 16 + RSC en 2026 |
| Hosting | Netlify | DX similar a Vercel pero menor adopción agéntica y peor MCP |
| BaaS | Firebase | NoSQL no encaja con RLS profundo y relaciones de Tendr |
| BaaS | PocketBase | SQLite, no escala multi-tenant serio |
| Jobs queue | Trigger.dev | Muy similar a Inngest; Inngest gana por el MCP automático con `inngest dev` |
| Jobs queue | BullMQ | Requiere Redis self-host, fuera del MVP gratuito |
| AI abstraction | DeepAgents (LangChain) | Pensado para agentes multi-step con planning/memory; Tendr no lo necesita |
| AI abstraction | SDKs nativos por provider | Duplican lógica y rompen abstracción multi-provider del producto |
| LLM observability | Helicone | SaaS, menor componente OSS |
| LLM observability | LangSmith | Atado a LangChain |
| Pagos | LemonSqueezy | MoR útil para Europa pero peor CLI y peor experiencia agéntica |
| Pagos | Paddle | MoR pero overkill para MVP |
| Feature flags | Statsig | SDK más simple pero plataforma separada de analytics |
| Feature flags | GrowthBook | OSS puro, self-hosting añade fricción para el alumno |

## Tradeoffs aceptados

- **Vercel Hobby prohíbe uso comercial estricto.** ADR-002 documenta el caveat y los 3 caminos de salida (Vercel Pro, Cloudflare Pages, Netlify).
- **Supabase Free tier pausa proyectos** tras 1 semana sin actividad. Despausa en 1 click; aceptable para MVP y para uso esporádico de aprendizaje.
- **Inngest Free tier limita a 50k runs/mes.** Suficiente para el caso; si Tendr crece, plan paid o migración a Trigger.dev/BullMQ.
- **Langfuse 30 días de retención** en free tier. Para análisis históricos largos hay que pagar o self-hostear.
- **Stripe en test mode** durante todo el caso. No hay cobros reales; pedagógicamente equivalente, financieramente cero riesgo.
- **PostHog cloud EU** asumido para GDPR; si el alumno está fuera de Europa, cloud US es opción razonable con disclaimer.

## Consecuencias

- F3 (Scaffolding) usa Drizzle ORM contra Postgres de Supabase con RLS profundo.
- F4 (Auth) usa el patrón anónimo a autenticado nativo de Supabase.
- F5 (Workspace + Kanban) usa Supabase Realtime para sincronía multi-tab.
- F6 (Documentos) usa Supabase Storage + Inngest function + Vercel AI SDK (`generateObject`).
- F7 (Plantillas) usa Vercel AI SDK (`streamText`) multi-provider + Langfuse traces.
- F8 (Pagos) usa Stripe test mode + webhook signed + idempotencia.
- F10 (CI/CD) usa Sentry + Langfuse + PostHog flags + Vercel deploy + GitHub Actions.

## Criterio de revisión

- Si Supabase Free tier deja de cubrir las necesidades del producto (> 500MB Postgres, > 1GB Storage o > 50k MAU), reabrir para evaluar Supabase Pro vs migración a Postgres dedicado.
- Si Vercel cambia el ToS de Hobby (ADR-002 documenta la lectura del 2026-MM-DD), revisar inmediatamente.
- Si Inngest supera 50k runs/mes en uso esperado, evaluar Trigger.dev o plan paid.
- Si aparece una capa de abstracción IA superior a Vercel AI SDK en 2026+, reabrir ADR-003.

## Referencias

- Vercel docs: <https://vercel.com/docs>
- Supabase docs: <https://supabase.com/docs>
- Inngest docs: <https://www.inngest.com/docs>
- Vercel AI SDK: <https://ai-sdk.dev>
- Langfuse: <https://langfuse.com>
- Stripe Test Mode: <https://docs.stripe.com/test-mode>
- PostHog: <https://posthog.com/docs>
- Drizzle: <https://orm.drizzle.team>

---

*ADR-001. Última revisión: 2026-MM-DD.*
