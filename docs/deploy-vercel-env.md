# Carga de env vars en Vercel Production (F10)

Paso a paso para obtener cada variable y cargarla por terminal. Este documento **no contiene valores**.

Proyecto vinculado: `joseluisalmendrals-projects/tendr-app`.

## Cómo se carga cada una

```bash
vercel env add <NAME> production
# pega el valor cuando pida "What's the value of <NAME>?" y Enter
```

El valor se pega por stdin: no queda en el historial de la shell ni pasa por el agente.

---

## 1. Supabase (4 vars)

Dashboard: <https://supabase.com/dashboard> → proyecto de Tendr.

| Variable | Dónde |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Settings → API Keys → `sb_publishable_...` |
| `SUPABASE_SECRET_KEY` | Settings → API Keys → `sb_secret_...` (server-only, bypassa RLS) |
| `DATABASE_URL` | Botón **Connect** (arriba) → Connection string → Supavisor **Session mode** (puerto 5432). Sustituir `[YOUR-PASSWORD]` por la password de BD **URI-encoded** |

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production
vercel env add SUPABASE_SECRET_KEY production
vercel env add DATABASE_URL production
```

## 2. Inngest Cloud (2 vars)

<https://app.inngest.com> → crear app/entorno si no existe.

| Variable | Dónde |
|---|---|
| `INNGEST_EVENT_KEY` | Settings → Event Keys → Create/copy |
| `INNGEST_SIGNING_KEY` | Settings → Signing Keys → copy (`signkey-...`) |

```bash
vercel env add INNGEST_EVENT_KEY production
vercel env add INNGEST_SIGNING_KEY production
```

> Tras el primer deploy, sincronizar la app en Inngest Cloud apuntando a `https://<dominio>/api/inngest`.

## 3. Langfuse (3 vars)

<https://cloud.langfuse.com> → proyecto de Tendr → Project Settings → API Keys.

| Variable | Dónde |
|---|---|
| `LANGFUSE_PUBLIC_KEY` | API Keys → `pk-lf-...` |
| `LANGFUSE_SECRET_KEY` | API Keys → `sk-lf-...` (se muestra una sola vez; si se perdió, crear un par nuevo) |
| `LANGFUSE_BASE_URL` | Fijo: `https://cloud.langfuse.com` (región EU). **Ojo: con underscore — es el nombre que lee el código** |

```bash
vercel env add LANGFUSE_PUBLIC_KEY production
vercel env add LANGFUSE_SECRET_KEY production
vercel env add LANGFUSE_BASE_URL production
```

## 4. Stripe — test mode (4 vars)

<https://dashboard.stripe.com/test> (toggle **Test mode** activado).

| Variable | Dónde |
|---|---|
| `STRIPE_SECRET_KEY` | Developers → API Keys → Secret key (`sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Developers → Webhooks → **Add destination** con URL `https://<dominio>/api/webhooks/stripe`, eventos `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` → copiar su `whsec_...`. **NO reutilizar el de `stripe listen`** |
| `STRIPE_PRICE_PRO` | Product catalog → producto Pro → price ID (`price_...`) |
| `STRIPE_PRICE_TEAM` | Product catalog → producto Team → price ID (`price_...`) |

```bash
vercel env add STRIPE_SECRET_KEY production
vercel env add STRIPE_WEBHOOK_SECRET production
vercel env add STRIPE_PRICE_PRO production
vercel env add STRIPE_PRICE_TEAM production
```

> El webhook destino necesita la URL de producción: si aún no hay deploy, usar `https://tendr-app.vercel.app` (URL por defecto del proyecto) y verificar tras el primer deploy.

## 5. Sentry (3 vars en Vercel + 1 en GitHub)

<https://sentry.io> → proyecto de Tendr.

| Variable | Dónde |
|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | Project Settings → Client Keys (DSN) |
| `SENTRY_ORG` | Slug de la organización (visible en la URL: `sentry.io/organizations/<slug>/`) |
| `SENTRY_PROJECT` | Slug del proyecto (visible en la URL del proyecto) |
| `SENTRY_AUTH_TOKEN` | Settings → Auth Tokens → crear con scope `project:releases`. **NO va en Vercel**: `gh secret set SENTRY_AUTH_TOKEN` (secret de GitHub Actions para subir sourcemaps en CI) |

```bash
vercel env add NEXT_PUBLIC_SENTRY_DSN production
vercel env add SENTRY_ORG production
vercel env add SENTRY_PROJECT production
gh secret set SENTRY_AUTH_TOKEN   # pega el token por stdin
```

## 6. PostHog (4 vars)

<https://eu.posthog.com> → Settings.

| Variable | Dónde |
|---|---|
| `NEXT_PUBLIC_POSTHOG_KEY` | Settings → Project → Project API Key (`phc_...`) |
| `NEXT_PUBLIC_POSTHOG_HOST` | Fijo: `https://eu.i.posthog.com` |
| `POSTHOG_PERSONAL_API_KEY` | Settings → Personal API Keys → crear (`phx_...`) con scope `feature_flag:read` (flags server-side) |
| `POSTHOG_API_HOST` | Fijo: `https://eu.i.posthog.com` |

```bash
vercel env add NEXT_PUBLIC_POSTHOG_KEY production
vercel env add NEXT_PUBLIC_POSTHOG_HOST production
vercel env add POSTHOG_PERSONAL_API_KEY production
vercel env add POSTHOG_API_HOST production
```

## 7. Core (2 vars)

| Variable | Dónde |
|---|---|
| `AI_KEY_KEK` | **No se regenera.** Copiar el valor existente de `.env.local` (generado en F6 con `openssl rand`). Si se genera una nueva, las BYO keys cifradas en `ai_provider_configs` quedan irrecuperables |
| `NEXT_PUBLIC_SITE_URL` | URL de producción: `https://tendr-app.vercel.app` (o el dominio final) |

```bash
vercel env add AI_KEY_KEK production
vercel env add NEXT_PUBLIC_SITE_URL production
```

---

## Verificación final

```bash
vercel env ls production   # deben listar 20 vars
```

Checklist rápido:

- [ ] 20 vars en Vercel production (4 Supabase, 2 Inngest, 3 Langfuse, 4 Stripe, 3 Sentry, 4 PostHog, 2 core)
- [ ] `SENTRY_AUTH_TOKEN` como secret de GitHub Actions, no en Vercel
- [ ] `STRIPE_WEBHOOK_SECRET` es el del webhook destino de producción, no el de `stripe listen`
- [ ] `AI_KEY_KEK` es el mismo valor que en `.env.local`
- [ ] `DATABASE_URL` usa Supavisor Session mode (5432) con password URI-encoded

Después: `vercel --prod` (o push a `main`, que ya despliega vía la integración de GitHub).
