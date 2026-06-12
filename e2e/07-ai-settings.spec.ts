/**
 * /settings/ai — BYO-key settings smoke.
 *
 * Runs UNATTENDED against the local stack (`supabase start` + full-local dev).
 * `(app)` routes mint an anonymous session in middleware, so this page renders
 * for a fresh visitor with NO magic-link login needed — we assert that anon
 * reachability explicitly.
 *
 * The page (app/(app)/settings/ai/page.tsx) is a single vertical view with
 * three sections: the 5 provider BYO-key cards, the 5 per-feature model rows,
 * and the "Uso del mes" budget card.
 *
 * CLIENT-SIDE validation here is intentionally minimal: the key Input is HTML5
 * `required` and the Dialog's submit button is `disabled` while the field is
 * empty (provider-card.tsx: `disabled={pending || key.length === 0}`). The only
 * inline error text ("Key inválida") is produced by the `saveProviderKey`
 * Server Action AFTER it calls `validateProviderKey`, which hits the external
 * provider over the network with a real key — so the malformed-key error branch
 * is test.fixme (external network, real provider key).
 */
import { expect, test } from '@playwright/test';

import { checkAccessibility } from './helpers/a11y';

// The 5 provider cards, in render order (page.tsx PROVIDERS).
const PROVIDER_LABELS = [
  'OpenAI',
  'Anthropic',
  'Google Gemini',
  'DeepSeek',
  'Kimi (Moonshot)',
] as const;

// The 5 per-feature model-mapping rows, in render order (page.tsx FEATURES).
const FEATURE_LABELS = [
  'Adaptar plantilla',
  'Resumir relación',
  'Sugerir acción',
  'Extraer documento',
  'Embellecer email',
] as const;

test('anon visitor reaches /settings/ai via the sidebar and sees providers + feature rows', async ({
  page,
}) => {
  // `(app)` mints an anonymous session in middleware, so a fresh visit to a
  // protected route renders the app (no /login). Start at /app, then navigate
  // by clicking the real sidebar "Ajustes" link.
  await page.goto('/app');
  await page.getByRole('link', { name: 'Ajustes' }).click();
  await page.waitForURL('**/settings/ai', { timeout: 10_000 });

  // Page heading.
  await expect(
    page.getByRole('heading', { name: 'Configuración de IA', level: 1 }),
  ).toBeVisible();

  // The "Providers" section + one card per provider (CardTitle renders the
  // label as a non-h1 heading via shadcn Card).
  await expect(page.getByRole('heading', { name: 'Providers' })).toBeVisible();
  for (const label of PROVIDER_LABELS) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }

  // The "Modelo por feature" section + one row per feature label.
  await expect(
    page.getByRole('heading', { name: 'Modelo por feature' }),
  ).toBeVisible();
  for (const label of FEATURE_LABELS) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }

  // The "Uso del mes" budget card.
  await expect(page.getByRole('heading', { name: 'Uso del mes' })).toBeVisible();

  await checkAccessibility(page, 'settings-ai');
});

test('the BYO-key dialog gates submission on an empty key (client-side)', async ({
  page,
}) => {
  await page.goto('/settings/ai');

  // Open the OpenAI card's key dialog. With no key configured the trigger reads
  // "Configurar key" (provider-card.tsx).
  await page
    .getByRole('button', { name: 'Configurar key' })
    .first()
    .click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('heading', { name: 'Configurar key de OpenAI' }),
  ).toBeVisible();

  // CLIENT-SIDE validation: the submit button is disabled while the key field
  // is empty (disabled={pending || key.length === 0}). No network involved.
  const submit = dialog.getByRole('button', { name: 'Guardar' });
  await expect(submit).toBeDisabled();

  // Typing any value enables it (the only purely client-side gate). The HTML5
  // `required` attribute on the password Input is the other client guard.
  const keyInput = dialog.getByLabel('API key');
  await expect(keyInput).toHaveAttribute('required', '');
  await keyInput.fill('not-a-real-key-but-long-enough-to-enable');
  await expect(submit).toBeEnabled();
});

// FIXME: the inline "Key inválida" validation message is produced by the
// `saveProviderKey` Server Action only AFTER it calls `validateProviderKey`,
// which performs a real authenticated request to the external provider with the
// submitted key. Asserting that error path requires external network access and
// a (rejecting) real provider key, so it cannot run unattended in CI.
test.fixme(
  'submitting a malformed key surfaces the inline "Key inválida" error',
  async ({ page }) => {
    await page.goto('/settings/ai');
    await page.getByRole('button', { name: 'Configurar key' }).first().click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('API key').fill('sk-this-is-clearly-not-valid-xxxx');
    await dialog.getByRole('button', { name: 'Guardar' }).click();

    // Server Action validates against the provider, rejects, and the card
    // renders the detail-free message inline.
    await expect(dialog.getByText('Key inválida')).toBeVisible({
      timeout: 15_000,
    });
  },
);
