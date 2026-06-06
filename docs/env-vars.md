# Variables de entorno de Tendr (F3–F10)

Lista consolidada de las env vars del proyecto. Este documento **no contiene valores**: solo nombres, origen y sensibilidad. Ver nota final sobre dónde se cargan.

## Convención de sensibilidad

- **Pública**: puede viajar al cliente. Lleva prefijo `NEXT_PUBLIC_`.
- **Server-only**: solo existe en el server. Nunca lleva `NEXT_PUBLIC_`; exponerla al cliente es un incidente de seguridad.

## Supabase (F3)

| Variable | Fase | Dónde se obtiene | Ámbito | Sensibilidad |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | F3 | Dashboard → Settings → API → Project URL | Cliente + server | Pública |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | F3 | Dashboard → Settings → API Keys (`sb_publishable_...`) | Cliente + server | Pública (RLS es la barrera real) |
| `SUPABASE_SECRET_KEY` | F3 | Dashboard → Settings → API Keys (`sb_secret_...`) | Server-only | **Crítica** — bypassa RLS |
| `DATABASE_URL` | F3 | Botón **Connect** → Connection string (Supavisor **Session mode**, puerto 5432; password URI-encoded) | Server-only (Drizzle runtime + `drizzle-kit` migrate) | **Crítica** — contiene password de BD |

## Inngest (F6 local · F10 producción)

| Variable | Fase | Dónde se obtiene | Ámbito | Sensibilidad |
|---|---|---|---|---|
| `INNGEST_EVENT_KEY` | F10 | app.inngest.com → Settings → Event Keys | Server-only | Alta |
| `INNGEST_SIGNING_KEY` | F10 | app.inngest.com → Settings → Signing Keys | Server-only | Alta |

> En local (F6) no existen claves: el Inngest Dev Server no las requiere. Solo se crean para Inngest Cloud en el deploy.

## Langfuse (F6)

| Variable | Fase | Dónde se obtiene | Ámbito | Sensibilidad |
|---|---|---|---|---|
| `LANGFUSE_PUBLIC_KEY` | F6 | cloud.langfuse.com → Project Settings → API Keys (`pk-lf-...`) | Server-only | Media |
| `LANGFUSE_SECRET_KEY` | F6 | Ídem (`sk-lf-...`, se muestra una sola vez) | Server-only | Alta |
| `LANGFUSE_BASEURL` | F6 | Fijo: host de la región EU | Server-only | Ninguna (config) |

## Cifrado BYO key (F7)

| Variable | Fase | Dónde se obtiene | Ámbito | Sensibilidad |
|---|---|---|---|---|
| `ENCRYPTION_MASTER_KEY` | F7 | Se genera localmente (`openssl rand -base64 32`); no proviene de ningún dashboard | Server-only | **Crítica** — KEK del envelope AES-256-GCM; si se pierde, las keys cifradas de todos los workspaces son irrecuperables |

> Las API keys de los providers de IA (OpenAI, Anthropic, Google, DeepSeek, Kimi) **no son env vars**: son BYO key por workspace, cifradas en la tabla `ai_provider_configs` (ADR-003). Nunca deben aparecer en `.env*`.

## Stripe (F8)

| Variable | Fase | Dónde se obtiene | Ámbito | Sensibilidad |
|---|---|---|---|---|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | F8 | Dashboard → Developers → API Keys (`pk_test_...`) | Cliente | Pública |
| `STRIPE_SECRET_KEY` | F8 | Ídem (`sk_test_...`) | Server-only | **Crítica** |
| `STRIPE_WEBHOOK_SECRET` | F8 | Local: lo emite `stripe listen` (`whsec_...`). Producción: Dashboard → Developers → Webhooks → destino (F10) | Server-only | Alta |

## PostHog (F8)

| Variable | Fase | Dónde se obtiene | Ámbito | Sensibilidad |
|---|---|---|---|---|
| `NEXT_PUBLIC_POSTHOG_KEY` | F8 | eu.posthog.com → Settings → Project API Key (`phc_...`) | Cliente | Pública por diseño |
| `NEXT_PUBLIC_POSTHOG_HOST` | F8 | Fijo: host de EU Cloud | Cliente | Ninguna (config) |
| `POSTHOG_PERSONAL_API_KEY` | F8 | Settings → Personal API Keys (`phx_...`) — solo si se evalúan flags server-side en `proxy.ts` | Server-only | Alta |

## Sentry (F10)

| Variable | Fase | Dónde se obtiene | Ámbito | Sensibilidad |
|---|---|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | F10 | sentry.io → Project Settings → Client Keys (DSN) | Cliente + server | Pública (el DSN solo permite enviar eventos) |
| `SENTRY_AUTH_TOKEN` | F10 | sentry.io → Settings → Auth Tokens — solo para subir sourcemaps en CI | Server-only (CI) | Alta |

---

## Nota final: dónde viven los valores

- **Desarrollo**: todos los valores van en `.env.local`, que está cubierto por `.gitignore` (verificado) y no se commitea jamás. No existe `.env` compartido con valores; si se necesita referencia, se crea `.env.example` solo con nombres.
- **Producción (F10)**: los mismos nombres se cargan a mano en Vercel → Project Settings → Environment Variables, copiando cada valor desde el dashboard de su proveedor. `SENTRY_AUTH_TOKEN` va como secret del repo en GitHub Actions, no en Vercel.
- Los valores nunca pasan por el chat, el agente, los logs ni el repositorio (regla de la sesión + convención de higiene de secretos del programa).
