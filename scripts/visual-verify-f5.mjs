/**
 * F5 visual close-out verification — drives the real app in Chromium.
 * Sections map 1:1 to the user's checklist. Output: console lines + screenshots.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.VERIFY_BASE_URL ?? "http://127.0.0.1:3000";
const MAILPIT = "http://127.0.0.1:54324";
const SHOTS = process.env.VERIFY_SHOTS_DIR ?? "/tmp/tendr-verify-shots";
fs.mkdirSync(SHOTS, { recursive: true });

const log = (s) => console.log(s);
const shot = async (page, name) => {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
  log(`   [shot] ${name}.png`);
};

const browser = await chromium.launch();

// ---------------------------------------------------------------------------
// 1a + 3a — fresh visitor: anonymous-first lands on dashboard with empty state
// ---------------------------------------------------------------------------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  const url = page.url();
  const emptyTitle = await page.getByText("Aún no tienes clientes").count();
  log(`1b/3a · /app sin sesión previa → url=${url} · empty-state dashboard=${emptyTitle > 0 ? "VISIBLE" : "AUSENTE"}`);
  await shot(page, "01-dashboard-empty-anon");
  await ctx.close();
}

// ---------------------------------------------------------------------------
// 1a — real login via magic link (Mailpit) lands on /app
// ---------------------------------------------------------------------------
const ctx = await browser.newContext();
const page = await ctx.newPage();
const EMAIL = `f5-verify-${Date.now()}@example.com`;
{
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel(/correo|email/i).fill(EMAIL);
  await page.getByRole("button", { name: /enviar|magic|acceder|entrar/i }).click();
  // wait for the action confirmation
  await page.waitForTimeout(2500);
  await shot(page, "02-login-sent");

  // fetch the magic link from Mailpit
  const list = await (await fetch(`${MAILPIT}/api/v1/messages?limit=5`)).json();
  const msg = list.messages.find((m) => m.To?.some((t) => t.Address === EMAIL));
  if (!msg) { log("1a · ❌ no llegó el email a Mailpit"); process.exit(1); }
  const body = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json();
  const link = (body.Text || body.HTML).match(/https?:\/\/[^\s"'<>\]]+/g)
    .find((u) => u.includes("/auth/v1/verify") || u.includes("token"));
  log(`1a · magic link obtenido de Mailpit`);
  await page.goto(link, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const landed = page.url();
  log(`1a · tras login aterriza en: ${landed} ${landed.includes("/app") ? "✅" : "❌"}`);
  await shot(page, "03-post-login-dashboard");
}

// ---------------------------------------------------------------------------
// 4a — loading state: skeleton during initial fetch of /clients (cold nav)
// ---------------------------------------------------------------------------
{
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency: 400, downloadThroughput: 80_000, uploadThroughput: 80_000,
  });
  const nav = page.goto(`${BASE}/clients`, { waitUntil: "commit" });
  await nav;
  await page.waitForTimeout(400); // shell+skeleton streamed, content still loading
  const skeletons = await page.locator('[data-slot="skeleton"], .animate-pulse').count();
  log(`4a · skeleton visible durante carga de /clients: ${skeletons > 0 ? `SÍ (${skeletons})` : "NO"}`);
  await shot(page, "04-clients-loading");
  await nav;
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
  });
}

// ---------------------------------------------------------------------------
// 2 + 3b + 4b — happy path: create client → spinner → detail → empty cases → case → note
// ---------------------------------------------------------------------------
{
  await page.goto(`${BASE}/clients`, { waitUntil: "networkidle" });
  const emptyClients = await page.getByText("Aún no tienes clientes").count();
  log(`3a' · /clients empty state: ${emptyClients > 0 ? "VISIBLE" : "AUSENTE"}`);
  await shot(page, "05-clients-empty");

  await page.getByRole("button", { name: /nuevo cliente/i }).first().click();
  await page.getByLabel(/nombre/i).fill("Acme Corp");
  const emailField = page.getByLabel(/email/i);
  if (await emailField.count()) await emailField.fill("contact@acme.test");
  const t0 = Date.now();
  await page.getByRole("dialog").getByRole("button", { name: /crear|guardar/i }).click();
  // 4b: spinner while the action settles
  const spinnerSeen = await page.locator(".animate-spin").count();
  log(`4b · spinner durante createClient: ${spinnerSeen > 0 ? "SÍ" : "no observado (action rápida)"}`);
  await page.getByRole("cell", { name: "Acme Corp" }).or(page.getByText("Acme Corp")).first()
    .waitFor({ timeout: 5000 });
  log(`2  · cliente "Acme Corp" visible en tabla a los ${Date.now() - t0}ms (optimistic) ✅`);
  await shot(page, "06-client-created");

  // detail
  await page.getByRole("link", { name: /acme corp/i }).click();
  await page.waitForURL(/\/clients\/[0-9a-f-]+/, { timeout: 8000 });
  await page.getByRole("tab", { name: /casos/i }).waitFor({ timeout: 10000 }); // wait past the loading skeleton
  const emptyCases = await page.getByText(/Crea el primer caso|Sin casos/i).count();
  log(`3b · detalle: empty state de casos: ${emptyCases > 0 ? "VISIBLE" : "AUSENTE"}`);
  await shot(page, "07-detail-empty-cases");

  // create case
  await page.getByRole("button", { name: /nuevo caso/i }).first().click();
  await page.getByLabel(/t[ií]tulo/i).fill("Rediseño web");
  await page.getByRole("dialog").getByRole("button", { name: /crear|guardar/i }).click();
  await page.getByText("Rediseño web").first().waitFor({ timeout: 5000 });
  log(`2  · caso "Rediseño web" creado y visible ✅`);
  await shot(page, "08-case-created");

  // note with markdown
  await page.getByRole("tab", { name: /notas/i }).click();
  await page.getByRole("textbox").fill("Cliente **prioritario**. Pendiente:\n\n- enviar propuesta\n- llamar el lunes");
  await page.getByRole("button", { name: /guardar/i }).click();
  await page.locator("strong", { hasText: "prioritario" }).waitFor({ timeout: 5000 });
  log(`2  · nota guardada y markdown renderizado (strong visible) ✅`);
  await shot(page, "09-note-markdown");

  // placeholders honest
  await page.getByRole("tab", { name: /documentos/i }).click();
  const proximamente = await page.getByText(/próximamente/i).count();
  log(`C  · placeholder "Próximamente" en Documentos: ${proximamente > 0 ? "VISIBLE" : "AUSENTE"}`);
}

// ---------------------------------------------------------------------------
// 3c + 7 — kanban: empty columns + keyboard-only move
// ---------------------------------------------------------------------------
{
  await page.goto(`${BASE}/kanban`, { waitUntil: "networkidle" });
  const emptyCols = await page.getByText("Sin casos en este estado").count();
  log(`3c · columnas vacías con empty state: ${emptyCols} (esperado 4)`);
  await shot(page, "10-kanban-initial");

  // keyboard-only: focus the card, grab, move right, drop
  const card = page.getByRole("button", { name: /Caso Rediseño web/i }).first();
  await card.focus();
  const focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  log(`7  · focus por teclado en card: ${focused ?? "FALLO"}`);
  await page.keyboard.press("Space");        // grab
  await page.waitForTimeout(300);
  await page.keyboard.press("ArrowRight");    // move to next column
  await page.waitForTimeout(300);
  await page.keyboard.press("Space");         // drop (dnd-kit: same key drops)
  await page.waitForTimeout(1500);
  // verify column change: find which column contains the card now
  const colOfCard = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[aria-label^="Caso Rediseño"]')][0];
    return el?.closest('[aria-label^="Columna"]')?.getAttribute("aria-label") ?? "?";
  });
  log(`7  · tras Space→ArrowRight→Space la card está en: "${colOfCard}" ${colOfCard.includes("Propuesta") || colOfCard.includes("proposal") ? "✅ movida" : "(verificar)"}`);
  await shot(page, "11-kanban-after-keyboard-move");
}

// ---------------------------------------------------------------------------
// 8 — multi-tab realtime: move in tab A, observe tab B
// ---------------------------------------------------------------------------
{
  const pageB = await ctx.newPage();
  await pageB.goto(`${BASE}/kanban`, { waitUntil: "networkidle" });
  await pageB.waitForTimeout(2000); // let the channel subscribe

  // tab A keyboard-move the card one more column to the right
  await page.bringToFront();
  const card = page.getByRole("button", { name: /Caso Rediseño web/i }).first();
  await card.focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  const tMove = Date.now();
  await page.keyboard.press("Space");

  // poll tab B for the card to appear in the "Activo"/active column
  let synced = -1;
  for (let i = 0; i < 40; i++) {
    const col = await pageB.evaluate(() => {
      const el = [...document.querySelectorAll('[aria-label^="Caso Rediseño"]')][0];
      return el?.closest('[aria-label^="Columna"]')?.getAttribute("aria-label") ?? "?";
    });
    if (col.includes("Activo") || col.includes("active")) { synced = Date.now() - tMove; break; }
    await pageB.waitForTimeout(250);
  }
  log(`8  · sync multi-tab Realtime: ${synced >= 0 ? `card actualizada en tab B en ${synced}ms ${synced < 1000 ? "✅ <1s" : "⚠️ ≥1s"}` : "❌ NO sincronizó en 10s"}`);
  await shot(pageB, "12-tabB-after-realtime");
  await pageB.close();
}

// ---------------------------------------------------------------------------
// 5 — error state: block the server action → toast + rollback
// ---------------------------------------------------------------------------
{
  await page.goto(`${BASE}/kanban`, { waitUntil: "networkidle" });
  await page.route("**/kanban**", (route) =>
    route.request().method() === "POST" ? route.abort("failed") : route.continue()
  );
  const card = page.getByRole("button", { name: /Caso Rediseño web/i }).first();
  await card.focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(200);
  await page.keyboard.press("Space");
  // toast?
  let toastText = "";
  try {
    const toast = page.locator("[data-sonner-toast]").first();
    await toast.waitFor({ timeout: 6000 });
    toastText = (await toast.innerText()).trim().replace(/\n/g, " ");
  } catch { /* no toast */ }
  log(`5  · acción bloqueada (red) → toast: ${toastText ? `"${toastText}" ✅` : "❌ SIN TOAST"}`);
  await shot(page, "13-error-toast");
  await page.unroute("**/kanban**");
}

// ---------------------------------------------------------------------------
// 6 — mobile 375x667
// ---------------------------------------------------------------------------
{
  const mctx = await browser.newContext({ viewport: { width: 375, height: 667 }, storageState: await ctx.storageState() });
  const m = await mctx.newPage();
  await m.goto(`${BASE}/kanban`, { waitUntil: "networkidle" });
  const metrics = await m.evaluate(() => {
    const board = document.querySelector("main") ?? document.body;
    const scroller = [...document.querySelectorAll("*")].find(
      (el) => el.scrollWidth > el.clientWidth + 10 && getComputedStyle(el).overflowX !== "visible"
    );
    return {
      bodyOverflowX: document.documentElement.scrollWidth > 375,
      hasHorizontalScroller: !!scroller,
      scrollerTag: scroller ? `${scroller.tagName}.${scroller.className.toString().slice(0, 60)}` : null,
    };
  });
  log(`6  · mobile 375x667 kanban → scroller horizontal interno: ${metrics.hasHorizontalScroller ? "SÍ ✅" : "NO"} · desborde de página: ${metrics.bodyOverflowX ? "⚠️ SÍ" : "no"}`);
  await shot(m, "14-mobile-kanban");
  await m.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await shot(m, "15-mobile-dashboard");
  await m.goto(`${BASE}/clients`, { waitUntil: "networkidle" });
  await shot(m, "16-mobile-clients");
  await mctx.close();
}

await browser.close();
log("DONE");
