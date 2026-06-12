/**
 * Document upload + job-in-progress (the runnable slice).
 *
 * Runs UNATTENDED against the local stack (`supabase start` + full-local dev).
 * Asserting the job reaches "Listo" (completion) is fixme: it needs a Pro plan
 * + a configured BYO AI key + the Inngest worker + a real LLM call, which is
 * async and non-deterministic — not suitable for an unattended CI assertion.
 */
import { expect, test } from '@playwright/test';

import { checkAccessibility } from './helpers/a11y';

test('upload a PDF and see the extraction job start processing', async ({ page }) => {
  await page.goto('/app');

  const clientName = `Cliente Docs ${Date.now()}`;
  await page.getByRole('button', { name: /nuevo cliente/i }).first().click();
  await page.getByLabel('Nombre').fill(clientName);
  await page.getByRole('dialog').getByRole('button', { name: 'Crear cliente' }).click();

  const clientLink = page.getByRole('link', { name: clientName });
  await expect(clientLink).toBeVisible({ timeout: 10_000 });
  await clientLink.click();
  await page.waitForURL(/\/clients\/[0-9a-f-]+/, { timeout: 10_000 });

  await page.getByRole('tab', { name: 'Documentos' }).click();
  await page.getByLabel('Subir documento (PDF, máx. 10 MB)').setInputFiles(
    'e2e/fixtures/sample-contract.pdf',
  );
  await page.getByRole('button', { name: 'Subir' }).click();

  // The document row appears and its StatusChip shows "Procesando"
  // (pending/running) — the job has been enqueued.
  await expect(page.getByText('sample-contract.pdf')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Procesando')).toBeVisible({ timeout: 10_000 });
  await checkAccessibility(page, 'documents-tab');
});

test('extracción completa muestra el resultado', () => {
  // FIXME: completion requires the full async pipeline — a Pro plan, a
  // configured BYO AI key, a running Inngest worker, and a real LLM call. The
  // result is non-deterministic and not unattended-runnable in CI. When run
  // manually with those services, the StatusChip flips to "Listo" and the
  // ExtractionView renders the headings "Resumen", "Fechas clave", "Importes"
  // and "Partes implicadas".
  test.fixme();
});
