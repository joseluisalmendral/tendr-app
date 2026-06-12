/**
 * Multi-tab Realtime: a kanban move in one browser context syncs to another.
 *
 * Runs UNATTENDED against the local stack. REQUIRES:
 *   - `supabase start`;
 *   - the correct `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (NOT the anon_key — a
 *     wrong key SILENTLY kills Realtime: the REST path works but the websocket
 *     rejects auth and zero events arrive — testing-playbook gotcha).
 *
 * Uses two independent browser CONTEXTS (per spec) that SHARE the same
 * authenticated session via storageState — Realtime is workspace-scoped, so
 * both contexts must be the same workspace user. Ported from the two-context
 * pattern in `scripts/visual-verify-f5.mjs`.
 */
import { expect, test } from '@playwright/test';

import { loginViaMagicLink, uniqueEmail } from './helpers/auth';

test('kanban move in context A propagates to context B via Realtime', async ({ browser }) => {
  // --- Context A: authenticate, seed a client + a case ---
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();

  await loginViaMagicLink(pageA, uniqueEmail('rt'));

  const clientName = `Cliente RT ${Date.now()}`;
  await pageA.goto('/clients');
  await pageA.getByRole('button', { name: /nuevo cliente/i }).first().click();
  await pageA.getByLabel('Nombre').fill(clientName);
  await pageA.getByRole('dialog').getByRole('button', { name: 'Crear cliente' }).click();

  const clientLink = pageA.getByRole('link', { name: clientName });
  await expect(clientLink).toBeVisible({ timeout: 10_000 });
  await clientLink.click();
  await pageA.waitForURL(/\/clients\/[0-9a-f-]+/, { timeout: 10_000 });

  const caseTitle = `Caso RT ${Date.now()}`;
  await pageA.getByRole('button', { name: 'Nuevo caso' }).first().click();
  await pageA.getByLabel('Título').fill(caseTitle);
  await pageA.getByRole('dialog').getByRole('button', { name: 'Crear caso' }).click();
  await expect(pageA.getByRole('cell', { name: caseTitle })).toBeVisible({ timeout: 10_000 });

  // --- Context B: same session via storageState ---
  const state = await contextA.storageState();
  const contextB = await browser.newContext({ storageState: state });
  const pageB = await contextB.newPage();

  // Open both kanban boards. B must be subscribed BEFORE the move.
  await pageA.goto('/kanban');
  await pageB.goto('/kanban');

  const cardSelector = new RegExp(`Caso ${caseTitle}`);
  await expect(pageA.getByRole('button', { name: cardSelector }).first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(pageB.getByRole('button', { name: cardSelector }).first()).toBeVisible({
    timeout: 10_000,
  });

  // Card starts in Prospecto in both.
  await expect(
    pageB.locator('[aria-label="Columna Prospecto"]').getByRole('button', { name: cardSelector }),
  ).toBeVisible();

  // Give B's Realtime channel a moment to subscribe before the move.
  await pageB.waitForTimeout(2_000);

  // --- Move in A (keyboard): Prospecto → Propuesta ---
  await pageA.bringToFront();
  const card = pageA.getByRole('button', { name: cardSelector }).first();
  await card.focus();
  await pageA.keyboard.press('Space');
  await pageA.keyboard.press('ArrowRight');
  await pageA.keyboard.press('Space');

  // A reflects the move locally.
  await expect(
    pageA.locator('[aria-label="Columna Propuesta"]').getByRole('button', { name: cardSelector }),
  ).toBeVisible({ timeout: 10_000 });

  // --- B observes the cross-context sync (generous timeout; F5 expects <1s) ---
  await expect(
    pageB.locator('[aria-label="Columna Propuesta"]').getByRole('button', { name: cardSelector }),
  ).toBeVisible({ timeout: 15_000 });

  await contextA.close();
  await contextB.close();
});
