/**
 * Production smoke test — runs against the LIVE deployment after a push to main.
 *
 * Target URL comes from `process.env.PREVIEW_URL` (set to the prod URL by the
 * deploy workflow, e.g. https://tendr-app.vercel.app). It must finish in < 60s
 * and exit non-zero on failure so the deploy workflow's `smoke` job goes red.
 *
 * Auth strategy (why password, not magic-link):
 *   The local specs use the Mailpit magic-link flow, which only works against
 *   the local stack. For prod we sign in a PRE-PROVISIONED smoke user with
 *   email + password through Supabase's own `@supabase/ssr` server client, and
 *   let the library write the EXACT `sb-<ref>-auth-token` cookies the app reads
 *   (chunking, base64 prefix and all). Reconstructing that cookie format by
 *   hand is brittle; delegating to the library guarantees parity with the app.
 *
 * The smoke user is seeded with a forced Pro plan so the template "Adaptar"
 * dialog is reachable without a BYO key gate.
 *
 * Required CI secrets (set as workflow env, see deploy.yml):
 *   - NEXT_PUBLIC_SUPABASE_URL              (Supabase project URL)
 *   - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  (anon/publishable key)
 *   - SMOKE_USER_EMAIL                      (pre-provisioned Pro smoke user)
 *   - SMOKE_USER_PASSWORD                   (its password)
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { expect, test, type BrowserContext } from "@playwright/test";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Smoke test requires env var ${name} to be set in CI.`);
  }
  return value;
}

/**
 * Signs the smoke user in via Supabase and writes the resulting auth cookies
 * into the Playwright browser context, scoped to the target origin. Returns
 * once the session is persisted so the next navigation is authenticated.
 */
async function authenticate(
  context: BrowserContext,
  baseURL: string,
): Promise<void> {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseKey = requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const email = requireEnv("SMOKE_USER_EMAIL");
  const password = requireEnv("SMOKE_USER_PASSWORD");

  const { hostname } = new URL(baseURL);
  const pending: CookieToSet[] = [];

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll(cookiesToSet) {
        pending.push(...cookiesToSet);
      },
    },
  });

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`Smoke user sign-in failed: ${error.message}`);
  }

  await context.addCookies(
    pending.map(({ name, value }) => ({
      name,
      value,
      domain: hostname,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax" as const,
    })),
  );
}

test("prod smoke: authenticate → create client → adapt template", async ({
  page,
  context,
  baseURL,
}) => {
  // Whole flow must stay well under 60s.
  test.setTimeout(55_000);

  const target = process.env.PREVIEW_URL ?? baseURL;
  if (!target) {
    throw new Error("Smoke test requires PREVIEW_URL (or a configured baseURL).");
  }

  await authenticate(context, target);

  // --- Create a client from /clients ---
  await page.goto("/clients");
  await expect(
    page.getByRole("heading", { name: "Clientes", level: 1 }),
  ).toBeVisible({ timeout: 15_000 });

  const clientName = `Smoke ${Date.now()}`;
  await page.getByRole("button", { name: /nuevo cliente/i }).first().click();
  await page.getByLabel("Nombre").fill(clientName);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crear cliente" })
    .click();
  await expect(page.getByRole("link", { name: clientName })).toBeVisible({
    timeout: 15_000,
  });

  // --- Adapt a template (smoke user is forced Pro in the seed) ---
  await page.goto("/templates");
  const templateName = `Smoke Tpl ${Date.now()}`;
  await page.getByRole("button", { name: "Nueva plantilla" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.locator("#template-name").fill(templateName);
  await page.locator("#template-body").fill(`# Propuesta para ${clientName}`);
  await page.locator("#template-variables").fill("cliente");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crear plantilla" })
    .click();
  await expect(page.getByText("Plantilla creada")).toBeVisible({
    timeout: 15_000,
  });

  // Open the adapt dialog and confirm the just-created client is selectable.
  await page
    .getByRole("row", { name: new RegExp(templateName) })
    .getByRole("button", { name: "Adaptar" })
    .click();
  await expect(
    page.getByRole("heading", { name: `Adaptar “${templateName}”` }),
  ).toBeVisible({ timeout: 15_000 });

  const clientSelect = page.getByRole("combobox", { name: "Cliente" });
  await clientSelect.click();
  await page.getByRole("option", { name: clientName }).click();
  await expect(clientSelect).toContainText(clientName);
});
