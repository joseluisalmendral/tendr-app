/**
 * Workspace core happy path: client → case (on the client detail page) →
 * kanban keyboard move → markdown note.
 *
 * Runs UNATTENDED against the local stack (`supabase start` + full-local dev).
 * The kanban move is keyboard-only — pointer drag is flaky with dnd-kit
 * (testing-playbook gotcha #3). Ported from `scripts/visual-verify-f5.mjs`.
 */
import { expect, test } from '@playwright/test';

import { checkAccessibility } from './helpers/a11y';

test('create client → case → move on kanban → markdown note', async ({ page }) => {
  await page.goto('/app');

  // --- Create a client ---
  const clientName = `Cliente Core ${Date.now()}`;
  await page.getByRole('button', { name: /nuevo cliente/i }).first().click();
  await page.getByLabel('Nombre').fill(clientName);
  await page.getByRole('dialog').getByRole('button', { name: 'Crear cliente' }).click();

  const clientLink = page.getByRole('link', { name: clientName });
  await expect(clientLink).toBeVisible({ timeout: 10_000 });
  await checkAccessibility(page, 'clients-list');

  // --- Open the client detail; create a case (cases tab is the default) ---
  await clientLink.click();
  await page.waitForURL(/\/clients\/[0-9a-f-]+/, { timeout: 10_000 });
  await expect(page.getByRole('tab', { name: 'Casos' })).toBeVisible({ timeout: 10_000 });
  await checkAccessibility(page, 'client-detail');

  const caseTitle = `Rediseno web ${Date.now()}`;
  await page.getByRole('button', { name: 'Nuevo caso' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Título').fill(caseTitle);
  // Estado defaults to "Prospecto"; Valor (en centavos) is optional — leave blank.
  await page.getByRole('dialog').getByRole('button', { name: 'Crear caso' }).click();
  await expect(page.getByRole('cell', { name: caseTitle })).toBeVisible({ timeout: 10_000 });

  // --- Markdown note ---
  await page.getByRole('tab', { name: 'Notas' }).click();
  await page.getByLabel('Nueva nota').fill('**negrita** test');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('strong', { hasText: 'negrita' })).toBeVisible({ timeout: 10_000 });

  // --- Kanban keyboard move: Prospecto → Propuesta ---
  await page.goto('/kanban');
  await expect(page.getByRole('heading', { name: 'Kanban', level: 1 })).toBeVisible();

  const card = page.getByRole('button', { name: new RegExp(`Caso ${caseTitle}`) }).first();
  await expect(card).toBeVisible({ timeout: 10_000 });

  // Sanity: the card starts in the Prospecto column.
  await expect(
    page.locator('[aria-label="Columna Prospecto"]').getByRole('button', {
      name: new RegExp(`Caso ${caseTitle}`),
    }),
  ).toBeVisible();

  await card.focus();
  await page.keyboard.press('Space'); // grab
  await page.keyboard.press('ArrowRight'); // move to next column
  await page.keyboard.press('Space'); // drop

  // The card now lives inside the Propuesta column.
  await expect(
    page.locator('[aria-label="Columna Propuesta"]').getByRole('button', {
      name: new RegExp(`Caso ${caseTitle}`),
    }),
  ).toBeVisible({ timeout: 10_000 });
  await checkAccessibility(page, 'kanban');
});
