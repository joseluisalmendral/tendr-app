/**
 * Anonymous-first → magic-link promotion, with data preservation.
 *
 * Runs UNATTENDED via Mailpit — it is NOT fixme. REQUIRES the local stack:
 * `supabase start` (Mailpit on 54324) plus full-local dev env (see e2e/README.md).
 * The promotion attaches the email to the SAME anonymous auth user, so the
 * client created before login is still present after login.
 */
import { expect, test } from '@playwright/test';

import { checkAccessibility } from './helpers/a11y';
import { loginViaMagicLink, uniqueEmail } from './helpers/auth';

test('anon visitor creates a client, then magic-link promotion preserves it', async ({ page }) => {
  // `/` redirects to `/app`; the anon session is minted by middleware on the
  // protected route, not on `/`.
  await page.goto('/');
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible();
  await checkAccessibility(page, 'app-anon');

  // Create a client with a unique name.
  const clientName = `Cliente E2E ${Date.now()}`;
  await page.getByRole('button', { name: /nuevo cliente/i }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Nombre').fill(clientName);
  await page.getByLabel('Email').fill('e2e-anon@example.com');
  await page.getByLabel('Empresa').fill('Acme E2E');
  await page.getByLabel('Etiquetas').fill('vip, e2e');
  await page.getByRole('dialog').getByRole('button', { name: 'Crear cliente' }).click();

  // Once revalidated, the real row renders as a link to /clients/{id}.
  await expect(page.getByRole('link', { name: clientName })).toBeVisible({ timeout: 10_000 });

  // Promote the anonymous session.
  await loginViaMagicLink(page, uniqueEmail('test'));

  // Data preserved: same client link still present after promotion.
  await page.goto('/clients');
  await expect(page.getByRole('link', { name: clientName })).toBeVisible({ timeout: 10_000 });
  await checkAccessibility(page, 'clients-authenticated');
});
