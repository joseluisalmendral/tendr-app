/**
 * Auth / session boundary — the REAL security gate, locked as verified.
 *
 * VERIFIED BEHAVIOR (read from lib/supabase/middleware.ts, proxy.ts,
 * app/(app)/layout.tsx, app/auth/callback/route.ts):
 *
 *  1. Protected `(app)` routes do NOT redirect anonymous visitors to /login.
 *     The proxy runs FIRST and, for a page route with no session, calls
 *     `supabase.auth.signInAnonymously()` (minting an anon session + cookies)
 *     instead of redirecting. Only if that anon-mint FAILS does it fall back to
 *     `/login`. `(app)/layout.tsx` then sees a (anon) session via
 *     `requireSession()`, so it does NOT `redirect("/login")`. Net effect: a
 *     fresh visit to `/clients` RENDERS the app and sets an `sb-…-auth-token`
 *     cookie.
 *
 *  2. Public paths (proxy PUBLIC_PATHS: `/`, `/login`, `/auth/callback`,
 *     `/privacy`, `/terms`) stay reachable with no session. `/` redirects to
 *     `/app` at the page level (app/page.tsx), and `/app` is protected → anon
 *     mint kicks in, so `/` lands on the rendered app.
 *
 *  3. `/auth/callback` with no/invalid `token_hash` does NOT crash: the route
 *     redirects (303) to `/login?error=invalid_link` (route.ts guard before any
 *     verifyOtp call).
 *
 * Runs UNATTENDED — only needs `supabase start` + the full-local dev env (see
 * e2e/README.md). No external dependency, no fixme.
 */
import { expect, test } from '@playwright/test';

import { checkAccessibility } from './helpers/a11y';

// Each test starts from a CLEAN browser context so there is genuinely no prior
// session — this is what proves the anon boundary, not a leftover cookie.
test.use({ storageState: { cookies: [], origins: [] } });

test('anon-mint: a fresh visit to a protected route renders the app (no /login redirect) and sets an auth cookie', async ({
  page,
}) => {
  // Clean context: assert there is no Supabase auth cookie before we navigate.
  const before = await page.context().cookies();
  expect(before.some((c) => /^sb-.*-auth-token/.test(c.name))).toBe(false);

  await page.goto('/clients');

  // We must NOT have been redirected to /login: the protected route rendered.
  await expect(page).toHaveURL(/\/clients(?:[/?#].*)?$/);
  await expect(
    page.getByRole('heading', { name: 'Clientes', level: 1 }),
  ).toBeVisible({ timeout: 10_000 });

  // The proxy minted an anonymous session → a Supabase auth cookie now exists.
  const after = await page.context().cookies();
  expect(after.some((c) => /^sb-.*-auth-token/.test(c.name))).toBe(true);

  await checkAccessibility(page, 'auth-gate-clients-anon');
});

test('public paths stay public: `/` lands on the rendered app without prior auth', async ({
  page,
}) => {
  // `/` is a public pass-through in the proxy, then redirects (page-level) to
  // `/app`, which is protected → anon mint → rendered dashboard.
  await page.goto('/');
  await expect(page).toHaveURL(/\/app(?:[/?#].*)?$/);
  await expect(
    page.getByRole('heading', { name: 'Inicio', level: 1 }),
  ).toBeVisible({ timeout: 10_000 });
});

test('public paths stay public: `/login` is reachable with no session', async ({
  page,
}) => {
  await page.goto('/login');
  await expect(page).toHaveURL(/\/login(?:[/?#].*)?$/);
  // Initial login form heading (app/login/page.tsx).
  await expect(
    page.getByRole('heading', { name: 'Accede a Tendr', level: 1 }),
  ).toBeVisible({ timeout: 10_000 });
});

test('the /auth/callback boundary: a missing token_hash redirects to /login?error=invalid_link (no crash)', async ({
  page,
}) => {
  // No token_hash and no type → the route's guard redirects (303) before any
  // verifyOtp work. It must NOT 500 or hang.
  await page.goto('/auth/callback');

  await expect(page).toHaveURL(/\/login\?error=invalid_link$/);
  // The login form still renders (the error param does not break the page).
  await expect(
    page.getByRole('heading', { name: 'Accede a Tendr', level: 1 }),
  ).toBeVisible({ timeout: 10_000 });
});
