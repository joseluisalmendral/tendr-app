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
