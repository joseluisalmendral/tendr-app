import { expect, type Page } from '@playwright/test';

/**
 * Magic-link auth helper, ported from `scripts/visual-verify-f5.mjs` (proven
 * working). Drives the real `/login` form, polls the local Mailpit inbox for
 * the verification email, follows the link, and waits for the post-login
 * redirect to `/app`.
 *
 * REQUIRES the local Supabase stack: `supabase start` (Mailpit listens on
 * 54324). Against the remote project this will never see the email and times
 * out — that is intentional (these specs are local-stack only).
 */

const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

/** Per-process counter so concurrent workers never collide on the same email. */
let emailCounter = 0;

/**
 * Returns a unique, real-MX-free address. `Date.now()` + a per-process counter
 * guarantee uniqueness across workers and repeated runs. Local GoTrue accepts
 * `@example.com`; the workflow-script `Date.now()` restriction does NOT apply
 * to spec files.
 */
export function uniqueEmail(prefix: string): string {
  emailCounter += 1;
  return `${prefix}-${Date.now()}-${emailCounter}@example.com`;
}

type MailpitMessage = {
  ID: string;
  To?: { Address: string }[];
};

async function fetchJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (cause) {
    throw new Error(
      `Mailpit unreachable at ${MAILPIT}. Run \`supabase start\` (Mailpit listens on 54324). Cause: ${String(cause)}`,
    );
  }
  if (!res.ok) {
    throw new Error(`Mailpit request failed: ${res.status} ${res.statusText} for ${url}`);
  }
  return (await res.json()) as T;
}

/**
 * Polls Mailpit for the newest message addressed to `email` and extracts the
 * verification URL from its body. Mirrors the F5 script's extraction exactly:
 * the link is the first URL containing `/auth/v1/verify` (GoTrue) or `token`
 * (our `/auth/callback?token_hash=…&type=…` contract path).
 */
async function pollForMagicLink(email: string, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no message found';

  while (Date.now() < deadline) {
    const list = await fetchJson<{ messages: MailpitMessage[] }>(
      `${MAILPIT}/api/v1/messages?limit=20`,
    );
    const msg = list.messages.find((m) =>
      m.To?.some((t) => t.Address?.toLowerCase() === email.toLowerCase()),
    );
    if (msg) {
      const body = await fetchJson<{ Text?: string; HTML?: string }>(
        `${MAILPIT}/api/v1/message/${msg.ID}`,
      );
      const haystack = body.Text || body.HTML || '';
      const urls = haystack.match(/https?:\/\/[^\s"'<>\]]+/g) ?? [];
      const link = urls.find((u) => u.includes('/auth/v1/verify') || u.includes('token'));
      if (link) return link;
      lastError = 'message found but no verification link in body';
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for the magic-link email to ${email} (${lastError}).`,
  );
}

/**
 * Logs in (or promotes an anonymous session) via the Mailpit magic-link flow,
 * unattended. Fills `/login`, submits, polls Mailpit, follows the link, and
 * waits for the redirect to `/app`.
 *
 * When called on a page that already carries an anonymous session, the email
 * is attached to the SAME auth user (promotion, no claim step) so `auth.uid()`
 * — and every workspace-scoped row — is preserved.
 */
export async function loginViaMagicLink(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByRole('button', { name: 'Enviar enlace de acceso' }).click();

  // The form swaps to the "Revisa tu correo" confirmation once the action
  // settles (or "Cuenta vinculada" if confirmations are disabled — that branch
  // is already authenticated and needs no link follow).
  const sent = page.getByRole('heading', { name: 'Revisa tu correo' });
  const linked = page.getByRole('heading', { name: 'Cuenta vinculada' });
  await expect(sent.or(linked)).toBeVisible({ timeout: 10_000 });

  if (await linked.isVisible()) {
    // In-place promotion, no email was sent. Land on /app and return.
    await page.goto('/app');
    await page.waitForURL('**/app', { timeout: 10_000 });
    return;
  }

  const link = await pollForMagicLink(email);
  await page.goto(link);
  await page.waitForURL('**/app', { timeout: 15_000 });
}
