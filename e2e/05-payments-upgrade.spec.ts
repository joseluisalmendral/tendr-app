/**
 * Payments / plan gate.
 *
 * Runnable slices (local stack, `supabase start` + full-local dev):
 *   - the /upgrade page renders correctly;
 *   - a Free user hitting the gated adaptTemplate path gets a 403
 *     { code: "plan_required", redirectTo: "/upgrade" } from
 *     POST /api/ai/adapt-template, and the adapt dialog surfaces the denial
 *     (it does NOT auto-navigate).
 *
 * The hosted purchase + post-webhook unlock are fixme: they need the real
 * Stripe Checkout page and `stripe listen --forward-to .../api/webhooks/stripe`
 * (the `whsec_` rotates per session) — not CI-feasible.
 */
import { expect, test } from '@playwright/test';

import { checkAccessibility } from './helpers/a11y';

test('upgrade page renders the Pro plan, CTA, and test-card hint', async ({ page }) => {
  await page.goto('/upgrade');
  await expect(page.getByRole('heading', { name: 'Desbloquea la IA de Tendr', level: 1 })).toBeVisible();
  // EXACT CTA text — note the intentional spelling "Subscribirme" matches the UI.
  await expect(page.getByRole('button', { name: 'Subscribirme a Pro' })).toBeVisible();
  await expect(page.getByText('4242 4242 4242 4242')).toBeVisible();
  await checkAccessibility(page, 'upgrade');
});

test('Free user adaptTemplate is gated with a 403 plan_required', async ({ page }) => {
  // Seed a client + template (a client is required for the adapt dialog Select).
  await page.goto('/app');
  const clientName = `Cliente Gate ${Date.now()}`;
  await page.getByRole('button', { name: /nuevo cliente/i }).first().click();
  await page.getByLabel('Nombre').fill(clientName);
  await page.getByRole('dialog').getByRole('button', { name: 'Crear cliente' }).click();
  await expect(page.getByRole('link', { name: clientName })).toBeVisible({ timeout: 10_000 });

  await page.goto('/templates');
  const templateName = `Plantilla Gate ${Date.now()}`;
  await page.getByRole('button', { name: 'Nueva plantilla' }).first().click();
  await page.locator('#template-name').fill(templateName);
  await page.locator('#template-body').fill('# Hola {{cliente}}');
  await page.getByRole('dialog').getByRole('button', { name: 'Crear plantilla' }).click();
  await expect(page.getByRole('cell', { name: templateName })).toBeVisible({ timeout: 10_000 });

  // Open Adapt, select the client, and trigger the gated POST.
  await page
    .getByRole('row', { name: new RegExp(templateName) })
    .getByRole('button', { name: 'Adaptar' })
    .click();
  await expect(page.getByRole('heading', { name: `Adaptar “${templateName}”` })).toBeVisible();
  await page.getByRole('combobox', { name: 'Cliente' }).click();
  await page.getByRole('option', { name: clientName }).click();

  // Assert on the 403 response — resilient to exact in-dialog error copy.
  const gatedResponse = page.waitForResponse(
    (res) => res.url().includes('/api/ai/adapt-template') && res.request().method() === 'POST',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Adaptar', exact: true }).click();

  const res = await gatedResponse;
  expect(res.status()).toBe(403);
  const json = await res.json();
  expect(json).toMatchObject({ code: 'plan_required', redirectTo: '/upgrade' });

  // The dialog surfaces the denial and does NOT auto-navigate away.
  await expect(page).toHaveURL(/\/templates$/);
  await expect(page.getByRole('heading', { name: 'No se pudo adaptar' })).toBeVisible({
    timeout: 10_000,
  });
});

test('hosted Stripe Checkout purchase', () => {
  // FIXME: clicking "Subscribirme a Pro" redirects to the hosted Stripe
  // Checkout page (external origin). Completing payment with the test card
  // 4242 4242 4242 4242 (any CVC, future expiry) and the post-webhook unlock
  // require `stripe listen --forward-to localhost:3000/api/webhooks/stripe`,
  // whose `whsec_` secret rotates every session and is not CI-feasible.
  test.fixme();
});

test('post-webhook Pro unlock', () => {
  // FIXME: after checkout.session.completed is forwarded by `stripe listen`,
  // the webhook writes a subscriptions row (plan='pro', status='active') and
  // the gated feature unlocks. We intentionally do NOT seed the subscriptions
  // row directly here to avoid coupling the E2E suite to DB internals; the
  // webhook + gate logic are covered by the integration suites
  // (db/__tests__/stripe-webhook.test.ts, lib/auth/__tests__/require-plan.test.ts).
  //
  // Sketch (kept commented, intentionally not wired):
  //   await db.insert(subscriptions).values({ workspaceId, plan: 'pro',
  //     status: 'active', currentPeriodEnd: <future> });
  //   // then reload /templates and assert the adapt stream succeeds.
  test.fixme();
});
