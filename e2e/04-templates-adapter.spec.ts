/**
 * Template CRUD + live markdown preview + opening the adapt dialog.
 *
 * Runs UNATTENDED against the local stack (`supabase start` + full-local dev).
 * The streamed adaptation RESULT is fixme: it needs a Pro plan + a configured
 * BYO AI key + a real LLM streaming response — non-deterministic and gated, so
 * not unattended-runnable. The Free-plan gate denial is exercised in spec 05.
 */
import { expect, test } from '@playwright/test';

import { checkAccessibility } from './helpers/a11y';

test('create a template with live preview, then open the adapt dialog', async ({ page }) => {
  // A client must exist for the adapt dialog's client Select to be usable.
  await page.goto('/app');
  const clientName = `Cliente Tpl ${Date.now()}`;
  await page.getByRole('button', { name: /nuevo cliente/i }).first().click();
  await page.getByLabel('Nombre').fill(clientName);
  await page.getByRole('dialog').getByRole('button', { name: 'Crear cliente' }).click();
  await expect(page.getByRole('link', { name: clientName })).toBeVisible({ timeout: 10_000 });

  // --- Create a template ---
  await page.goto('/templates');
  const templateName = `Plantilla E2E ${Date.now()}`;
  await page.getByRole('button', { name: 'Nueva plantilla' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nueva plantilla' })).toBeVisible();

  await page.locator('#template-name').fill(templateName);
  const heading = `Propuesta para ${clientName}`;
  await page.locator('#template-body').fill(`# ${heading}`);
  await page.locator('#template-variables').fill('cliente');

  // Live preview: switch to "Vista previa" and assert the markdown renders.
  await page.getByRole('tab', { name: 'Vista previa' }).click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: heading }),
  ).toBeVisible();

  // Switch back and submit.
  await page.getByRole('tab', { name: 'Editar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Crear plantilla' }).click();
  await expect(page.getByText('Plantilla creada')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('cell', { name: templateName })).toBeVisible({ timeout: 10_000 });
  await checkAccessibility(page, 'templates');

  // --- Open the adapt dialog and confirm a client is selectable ---
  await page
    .getByRole('row', { name: new RegExp(templateName) })
    .getByRole('button', { name: 'Adaptar' })
    .click();
  await expect(page.getByRole('heading', { name: `Adaptar “${templateName}”` })).toBeVisible();

  const clientSelect = page.getByRole('combobox', { name: 'Cliente' });
  await clientSelect.click();
  await page.getByRole('option', { name: clientName }).click();
  await expect(clientSelect).toContainText(clientName);
});

test('resultado de adaptación en streaming', () => {
  // FIXME: the streamed adaptation result requires a Pro plan + a configured
  // BYO AI key + a real LLM streaming response, which is gated and
  // non-deterministic — not unattended-runnable. When run manually with those,
  // clicking "Adaptar" streams markdown under the "Resultado" heading.
  test.fixme();
});
