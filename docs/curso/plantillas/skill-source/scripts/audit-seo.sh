#!/usr/bin/env bash
# scripts/audit-seo.sh
# Audita la capa SEO de una URL: title, meta description, canonical, robots
# (meta + header X-Robots-Tag), Open Graph, Twitter Card y sitemap.xml.
#
# Zero-dependency: parsing con Node puro (regex sobre meta tags), sin cheerio,
# para que el script funcione en cualquier proyecto sin instalar nada.
#
# Uso: bash audit-seo.sh <URL> <OUT_DIR>
# Output: <OUT_DIR>/seo.json · En caso de fallo: <OUT_DIR>/seo.error

set -euo pipefail

URL="${1:?Falta URL}"
OUT="${2:?Falta directorio output}"
mkdir -p "$OUT"

BASE="${URL%/}"

fail() {
  echo "$1" > "$OUT/seo.error"
  echo "ERROR · seo: $1" >&2
  exit 1
}

# 1. Página principal (HTML + status final tras redirects)
HTTP_STATUS=$(curl -sL -w "%{http_code}" -o "$OUT/page-seo.html" "$URL") || fail "curl falló contra $URL"
case "$HTTP_STATUS" in
  2*) : ;;
  *) fail "la URL respondió HTTP $HTTP_STATUS" ;;
esac

# 2. Header X-Robots-Tag (un noindex aquí no aparece en el HTML)
X_ROBOTS=$(curl -sIL "$URL" | grep -i '^x-robots-tag:' | tail -1 | cut -d':' -f2- | tr -d '\r' | xargs || true)

# 3. sitemap.xml (status + conteo de <loc>)
SITEMAP_STATUS=$(curl -sL -w "%{http_code}" -o "$OUT/sitemap.xml.raw" "$BASE/sitemap.xml" || echo "000")
if [ "$SITEMAP_STATUS" = "200" ]; then
  SITEMAP_ACCESSIBLE=true
  SITEMAP_URLS=$(grep -o '<loc>' "$OUT/sitemap.xml.raw" | wc -l | tr -d ' ')
else
  SITEMAP_ACCESSIBLE=false
  SITEMAP_URLS=0
fi

# 4. Parsear HTML y compilar seo.json
PAGE_URL="$URL" HTML_PATH="$OUT/page-seo.html" X_ROBOTS="$X_ROBOTS" HTTP_STATUS="$HTTP_STATUS" \
SITEMAP_ACCESSIBLE="$SITEMAP_ACCESSIBLE" SITEMAP_URLS="$SITEMAP_URLS" SITEMAP_STATUS="$SITEMAP_STATUS" \
node --input-type=module - <<'NODE' > "$OUT/seo.json" || fail "fallo parseando el HTML"
import { readFileSync } from 'node:fs';

const html = readFileSync(process.env.HTML_PATH, 'utf8');
const pageUrl = process.env.PAGE_URL;

const decode = (s) => s == null ? null : s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").trim();

// Extract one attribute value from a tag string.
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[2] ?? m[3]) : null;
};

// Collect <meta> tags into { key: content } maps by name= and property=.
const metaByName = {};
const metaByProp = {};
for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
  const content = decode(attr(tag, 'content'));
  const name = attr(tag, 'name')?.toLowerCase();
  const prop = attr(tag, 'property')?.toLowerCase();
  if (name && !(name in metaByName)) metaByName[name] = content;
  if (prop && !(prop in metaByProp)) metaByProp[prop] = content;
}

const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null);
const description = metaByName['description'] ?? null;
const robots = metaByName['robots'] ?? null;

let canonical = null;
for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
  if (/rel\s*=\s*["']?canonical["']?/i.test(tag)) { canonical = decode(attr(tag, 'href')); break; }
}

const openGraph = {
  title: metaByProp['og:title'] ?? null,
  description: metaByProp['og:description'] ?? null,
  image: metaByProp['og:image'] ?? null,
  type: metaByProp['og:type'] ?? null,
};
const twitterCard = {
  card: metaByName['twitter:card'] ?? null,
  title: metaByName['twitter:title'] ?? null,
  description: metaByName['twitter:description'] ?? null,
  image: metaByName['twitter:image'] ?? null,
};

const sitemapAccessible = process.env.SITEMAP_ACCESSIBLE === 'true';
const sitemapUrls = parseInt(process.env.SITEMAP_URLS, 10) || 0;
const xRobotsTag = process.env.X_ROBOTS || null;

const isAbsolute = (u) => /^https?:\/\//i.test(u ?? '');
const norm = (u) => { try { const x = new URL(u); return (x.origin + x.pathname).replace(/\/$/, ''); } catch { return null; } };

const issues = [];

// Indexability first: a noindex on a production landing kills everything else.
if (/noindex/i.test(robots ?? '')) issues.push(`meta robots contiene noindex ("${robots}") — la página no se indexará.`);
if (/noindex/i.test(xRobotsTag ?? '')) issues.push(`header X-Robots-Tag contiene noindex ("${xRobotsTag}") — invisible en el HTML pero bloquea indexación.`);

if (!title) issues.push('<title> ausente.');
else if (title.length > 60) issues.push(`title de ${title.length} chars (>60, se trunca en SERP).`);

if (!description) issues.push('meta description ausente.');
else if (description.length > 160) issues.push(`description de ${description.length} chars (>160, se trunca en SERP).`);

if (!canonical) issues.push('canonical ausente.');
else if (!isAbsolute(canonical)) issues.push(`canonical no es URL absoluta: "${canonical}".`);
else if (norm(canonical) !== norm(pageUrl)) issues.push(`canonical (${canonical}) no coincide con la URL auditada — verificar si es intencional.`);

if (!openGraph.title) issues.push('og:title ausente.');
if (!openGraph.description) issues.push('og:description ausente.');
if (!openGraph.image) issues.push('og:image ausente — los shares en redes salen sin imagen.');
else if (!isAbsolute(openGraph.image)) issues.push(`og:image no es URL absoluta: "${openGraph.image}" — los scrapers de OG no resuelven rutas relativas.`);
if (!openGraph.type) issues.push('og:type ausente.');

if (!twitterCard.card) issues.push('twitter:card ausente.');
else if (twitterCard.image && !isAbsolute(twitterCard.image)) issues.push(`twitter:image no es URL absoluta: "${twitterCard.image}".`);

if (!sitemapAccessible) issues.push(`sitemap.xml no accesible (HTTP ${process.env.SITEMAP_STATUS}).`);
else if (sitemapUrls === 0) issues.push('sitemap.xml accesible pero sin <loc> (vacío o malformado).');

console.log(JSON.stringify({
  httpStatus: parseInt(process.env.HTTP_STATUS, 10) || null,
  title,
  description,
  canonical,
  robots,
  xRobotsTag,
  openGraph,
  twitterCard,
  sitemapAccessible,
  sitemapUrls,
  issues,
}, null, 2));
NODE

echo "OK · $OUT/seo.json"
