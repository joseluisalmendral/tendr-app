# Testing Playbook

Lessons from the F5 close-out. **Green integration tests are not proof the
product works.** F5 shipped with 52/52 tests passing while four production
bugs were live: a blank dashboard for anonymous visitors, a Realtime channel
that delivered zero events to logged-in users, a kanban that could not move
cards into empty columns, and network failures that died silently without a
rollback toast. All four were invisible to the test suite and all four were
caught in under an hour of browser-level verification.

## Rule: every phase closes with a browser-level verification

Before tagging `clase-N`, run the app in a real browser (Playwright) against
the LOCAL Supabase stack and walk the phase checklist: auth flows, happy
path, empty states, loading states, error states, mobile viewport, keyboard
navigation, and multi-tab Realtime where applicable. Capture screenshots as
evidence. Fix every failure before the tag.

Reusable harness: `scripts/visual-verify-f5.mjs` (Playwright, 16 checks).
Adapt it per phase — the structure (seed via UI, assert via DOM + aria,
screenshot every step) is the template.

```bash
# one-time, outside the repo
mkdir -p /tmp/pw && cd /tmp/pw && npm i playwright && npx playwright install chromium

# run (dev server must be up in full-local mode, see below)
node scripts/visual-verify-f5.mjs
```

## Full-local dev mode (required for the harness)

`.env.local` points at the REMOTE dev project. Tests inject their own local
config, but the dev server does not — so a plain `pnpm dev` talks to remote
(real emails, remote DB). For verification, override ALL FOUR vars inline:

```bash
supabase start   # local stack: API 54321, DB 54322, Mailpit 54324
eval "$(supabase status -o env | rg 'ANON_KEY|API_URL')"
PUB=$(supabase status | rg -o 'sb_publishable[A-Za-z0-9_-]*')

NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$PUB" \
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000 \
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
pnpm dev
```

Gotchas that WILL bite you if you skip one:

- The app reads `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, **not** `ANON_KEY`.
  Local REST quietly accepts a wrong key, but the Realtime websocket rejects
  it — everything works except events, which is maddening to debug.
- Forgetting `DATABASE_URL` causes split-brain: writes (Supabase client) go
  local, reads (Drizzle) go remote → created rows never appear in lists.
- Browse via `http://127.0.0.1:3000` (matches the GoTrue allowlist).
  `next.config.ts` already allows that dev origin for hydration.
- Magic-link emails land in Mailpit: <http://127.0.0.1:54324>. Use real-MX
  domains for hosted GoTrue tests; local GoTrue accepts `@example.com`.

## Framework gotchas to test around (found the hard way)

1. **Next.js memoizes identical PostgREST GETs within one RSC render pass.**
   Re-reading data after a same-request write returns the stale result, even
   through a fresh client. Use the write's return value instead of re-reading
   (`ensureAnonymousWorkspace` returns the workspace for this reason).
2. **supabase-js does not authenticate Realtime on cookie-restored sessions**
   (`INITIAL_SESSION` does not trigger `realtime.setAuth()`). Subscribers run
   as `anon` and WAL-RLS filters every row: the channel joins fine, zero
   events arrive. `lib/realtime/use-workspace-realtime.ts` calls `setAuth()`
   before subscribing — keep that pattern for any new channel.
3. **dnd-kit boards need per-column `useDroppable`** or empty columns are not
   drop targets; board collision must be `rectIntersection`-first (corner
   math prefers the stale slot over tall empty columns); keyboard direction
   filters must compare rect CENTERS and skip the container holding the card.
4. **Server Actions reject on network failure** instead of returning your
   structured error — wrap awaits in try/catch and show a rollback toast.
5. **Test teardown FKs**: `audit_log.actor_id` AND `cases.updated_by`
   reference `auth.users`; delete dependent rows before deleting test users
   or GoTrue admin deletes 500.

## What unit/integration tests still own

RLS isolation, Zod contracts, RPC grants and atomicity, action return
shapes. The browser pass does not replace them — it covers the seams they
cannot reach: hydration, focus, sensors, websockets, optimistic timing,
loading states, viewport behavior.

## F8 close — Stripe payments + plan gate (browser walk)

End-to-end walk for the payments phase. Run it on your machine with the
full-local dev mode above, plus a Stripe test-mode account and the CLI
listener in a separate terminal.

**Prerequisites**

- `.env.local` has the 5 Stripe vars: `STRIPE_SECRET_KEY` (`sk_test_…`),
  `STRIPE_PUBLISHABLE_KEY` (`pk_test_…`), `STRIPE_PRICE_PRO`,
  `STRIPE_PRICE_TEAM` (from `stripe prices create`), and
  `STRIPE_WEBHOOK_SECRET` (the `whsec_…` printed by `stripe listen`, which
  changes every session — update it and restart `pnpm dev`).
- Local stack up (`supabase start`), dev server in full-local mode.
- In a separate terminal:
  `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

**Walk (fix every failure before tagging `clase-8`)**

| # | Step | Expected | Automated backing |
|---|------|----------|-------------------|
| 1 | Free user opens `/upgrade`, clicks "Subscribirme a Pro" | redirect to Stripe Checkout | manual (browser) |
| 2 | Pay with `4242 4242 4242 4242`, CVC `123`, future expiry | payment completes | manual (browser) |
| 3 | `stripe listen` receives `checkout.session.completed` | endpoint returns `200 OK` | — |
| 4 | `subscriptions` table | row with `plan='pro'`, `status='active'`, future `current_period_end` | `db/__tests__/stripe-webhook.test.ts` (checkout case) |
| 5 | Back in the app, adapt a template (Pro feature) | works, NO redirect to `/upgrade` | `lib/auth/__tests__/require-plan.test.ts` (Pro resolves) |
| 6 | `stripe trigger customer.subscription.deleted` | `plan='free'`, `status='cancelled'` | webhook test (deleted case) |
| 7 | Try to adapt a template again | redirects to `/upgrade` | require-plan test (Free → 403) |
| 8 | `stripe events resend evt_xxx` twice | 2nd returns `Already processed`, no duplicate rows | webhook tests (idempotency + atomicity) |

Steps 4/6/8 are covered by the webhook integration suite (signature,
idempotency, atomic rollback) and 5/7 by the plan-gate suite; 1/2/3 are
inherently manual (real browser + hosted Checkout + your `stripe listen`).

**Known follow-ups carried out of F8** (decide before/at phase close):

- **Stripe key**: prefer a restricted key (`rk_`) with `subscriptions:read`
  for the webhook/checkout client over the `sk_` secret key.
- **`trialing`/`past_due`**: the gate honors only `status='active'`. No
  trial is configured today, so no live exposure; if trials are enabled,
  trial users would be false-denied — set the policy first.
- **RLS reality on the Drizzle path**: the Drizzle `@/db` client connects as
  the Postgres superuser (`DATABASE_URL`), which BYPASSES RLS — so Server
  Actions are protected by their explicit `eq(workspace_id)` filters +
  server-resolved `workspaceId`, NOT by SQL-layer RLS (which only guards the
  supabase-js/PostgREST path). Either correct the code comments that claim
  otherwise, or add `FORCE ROW LEVEL SECURITY` + per-request JWT context if
  SQL-layer defense-in-depth is intended.
