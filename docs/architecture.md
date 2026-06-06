# Arquitectura de Tendr

Diagrama lógico del MVP según las decisiones de ADR-001 (stack por capa), ADR-002 (hosting) y ADR-003 (abstracción IA). Cada flecha indica qué viaja por ese canal.

```mermaid
flowchart TB
    subgraph App["Next.js 16 · Vercel Hobby"]
        direction TB
        RSC["Pages · RSC + Server Actions"]
        Handlers["Route Handlers · API + webhooks"]
        Proxy["proxy.ts · auth + plan gating"]
    end

    subgraph Data["Supabase"]
        direction TB
        PG[("Postgres + RLS<br/>por workspace_id")]
        Auth["Auth · anónimo → email"]
        Store[("Storage · documentos")]
        RT["Realtime"]
    end

    subgraph Jobs["Inngest · workers"]
        Fn["Functions con steps + retries<br/>extractor · resúmenes · recordatorios"]
    end

    subgraph AI["Vercel AI SDK v5 · multi-provider"]
        SDK["createProvider({ apiKey BYO })<br/>generateObject · streamText"]
        Prov["OpenAI · Anthropic · Google<br/>DeepSeek · Kimi"]
    end

    subgraph Obs["Observabilidad y producto"]
        LF["Langfuse · LLM"]
        Sen["Sentry · app"]
        PH["PostHog · flags + analytics"]
    end

    subgraph Pay["Stripe · test mode"]
        CK["Checkout"]
        WH["Webhooks firmados"]
    end

    RSC -- "queries SQL + mutaciones<br/>(Drizzle / @supabase/ssr, bajo RLS)" --> PG
    Proxy -- "sesión (cookies httpOnly)" --> Auth
    RSC -- "upload validado / signed URLs (TTL 1h)" --> Store
    RT -- "fanout de cambios<br/>(jobs + kanban, filtrado por workspace_id)" --> RSC

    RSC -- "eventos (inngest.send)" --> Fn
    Fn -- "estado del job<br/>(pending → running → completed/failed)" --> PG
    PG -- "postgres_changes" --> RT

    Fn -- "extracción estructurada<br/>(generateObject + Zod)" --> SDK
    RSC -- "adaptación de plantillas<br/>(streamText)" --> SDK
    SDK -- "HTTPS con key BYO descifrada<br/>(envelope AES-256-GCM)" --> Prov
    SDK -- "traces + generations<br/>(coste, latencia, modelo)" --> LF
    Fn -- "coste por llamada" --> PG

    RSC -- "Checkout session" --> CK
    WH -- "evento firmado (constructEvent)<br/>+ idempotencia en stripe_webhook_events" --> Handlers
    Handlers -- "estado de suscripción" --> PG

    Proxy -- "evaluación de flags<br/>(gating Free/Pro)" --> PH
    RSC -- "eventos de producto" --> PH
    App -- "errores + stack traces" --> Sen

    style App fill:#4A8DB8,stroke:#1C3C42,color:#fff
    style AI fill:#4A8DB8,stroke:#1C3C42,color:#fff
    style Data fill:#3A9470,stroke:#1C3C42,color:#fff
    style Obs fill:#82C4AF,stroke:#1C3C42,color:#1C3C42
    style Jobs fill:#D4825A,stroke:#1C3C42,color:#fff
    style Pay fill:#7B6EA8,stroke:#1C3C42,color:#fff
```

**Colores semánticos**: azul (app + IA), verde (datos + observabilidad), naranja (workers), púrpura (pagos).

**Reglas que el diagrama codifica**:

- El trabajo IA largo (extractor) entra siempre por Inngest, nunca por Server Actions (timeout 10s de Hobby, ADR-001).
- Toda lectura/escritura de datos pasa bajo RLS por `workspace_id`; Realtime se suscribe filtrado por workspace (sin filtro = leak entre tenants).
- Las keys BYO solo existen en claro dentro del server al instanciar el provider (ADR-003); nunca en BD, logs ni cliente.
- Stripe entra por Route Handler con verificación de firma e idempotencia antes de tocar la BD.
- El gating Free/Pro se decide en `proxy.ts` apoyado en flags de PostHog.

Referencias: [ADR-001](decisions/ADR-001-architecture.md) · [ADR-002](decisions/ADR-002-vercel-tos.md) · [ADR-003](decisions/ADR-003-ai-abstraction-vercel-ai-sdk.md).
