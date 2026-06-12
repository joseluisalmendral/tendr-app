# E2E suite (Playwright)

End-to-end browser tests for Tendr. The UI is in Spanish and has zero
`data-testid` attributes, so every selector is grounded on role + accessible
name + exact visible Spanish text.

## Prerequisites

1. **Local Supabase stack** — these specs talk to the LOCAL stack, never the
   remote dev project:

   ```bash
   supabase start   # API 54321, DB 54322, Mailpit (email inbox) 54324
   ```

2. **Playwright browsers** (first time only):

   ```bash
   pnpm exec playwright install
   ```

## Running unattended

A plain `pnpm dev` reads `.env.local`, which points at the REMOTE dev project
(real emails, remote DB). For the suite you MUST override all four vars inline
so the dev server is fully local — otherwise the Mailpit magic-link flow and
Realtime will not work, and Drizzle/Supabase split-brain hides created rows.

```bash
eval "$(supabase status -o env | rg 'ANON_KEY|API_URL')"
PUB=$(supabase status | rg -o 'sb_publishable[A-Za-z0-9_-]*')

NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$PUB" \
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000 \
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
pnpm dev
```

Then, in another terminal:

```bash
pnpm test:e2e                 # run the suite
pnpm test:e2e:ui              # interactive UI mode
pnpm test:e2e:report          # open the last HTML report
```

Playwright's `webServer` will reuse an already-running dev server (locally),
so the override above is honored. If you let Playwright start the server
itself, it runs a plain `pnpm dev` (remote env) — start it yourself with the
overrides for the auth/Realtime specs.

> [!IMPORTANT]
> The app reads `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, **not** `ANON_KEY`.
> Local REST quietly accepts a wrong key, but the Realtime websocket rejects
> it — everything works except events (spec 06 fails silently). Forgetting
> `DATABASE_URL` causes split-brain: writes go local, reads go remote, so
> created rows never appear.

## Specs and what each needs

| Spec | Runs unattended? | Extra services for the fixme blocks |
|------|------------------|-------------------------------------|
| `01-anon-to-authenticated` | yes (Mailpit) | — |
| `02-workspace-core` | yes | — |
| `03-documents-extractor` | upload + "Procesando" only | completion fixme: Inngest worker + BYO AI key + real LLM |
| `04-templates-adapter` | CRUD + preview + open adapt | stream result fixme: Pro plan + AI key + real LLM |
| `05-payments-upgrade` | page + Free-plan 403 gate | purchase fixme: hosted Stripe Checkout + `stripe listen` |
| `06-multi-tab-realtime` | yes (needs publishable key) | — |
| `07-ai-settings` | yes (page + client-side empty-key gate) | live key-validation fixme: external provider network + real (rejecting) key |
| `08-auth-gate` | yes | — |

The `test.fixme` blocks document exactly why they are not unattended-runnable
(async pipelines, gated paid features, external Stripe origin, rotating
webhook secrets). Remove the `fixme` and run manually with those services up.

## Projects (viewports / engines)

Five projects run by default: `mobile-chromium` (Pixel 7), `tablet-chromium`
(iPad Mini — WebKit engine), `desktop-chromium`, `desktop-webkit`,
`desktop-firefox`. Scope a run with `--project=desktop-chromium`.
