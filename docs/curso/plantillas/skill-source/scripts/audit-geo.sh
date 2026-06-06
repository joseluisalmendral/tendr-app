#!/usr/bin/env bash
# scripts/audit-geo.sh
# Audita la capa GEO de una URL: llms.txt, robots.txt con crawlers IA,
# JSON-LD schemas y jerarquía de headings.
#
# Uso: bash audit-geo.sh <URL> <OUT_DIR>

set -euo pipefail

URL="${1:?Falta URL}"
OUT="${2:?Falta directorio output}"
mkdir -p "$OUT"

BASE="${URL%/}"

# 1. llms.txt
LLMS_STATUS=$(curl -s -o "$OUT/llms.txt.raw" -w "%{http_code}" "$BASE/llms.txt" || echo "000")
if [ "$LLMS_STATUS" = "200" ]; then
  LLMS_ACCESSIBLE=true
  LLMS_SIZE=$(wc -c < "$OUT/llms.txt.raw" | tr -d ' ')
  HAS_DESC=$(grep -c "^>" "$OUT/llms.txt.raw" 2>/dev/null || echo 0)
  HAS_AUDIENCE=$(grep -ic "audiencia\|audience" "$OUT/llms.txt.raw" 2>/dev/null || echo 0)
  HAS_PRICING=$(grep -ic "pricing\|precio\|plan" "$OUT/llms.txt.raw" 2>/dev/null || echo 0)
  HAS_FAQ=$(grep -ic "faq" "$OUT/llms.txt.raw" 2>/dev/null || echo 0)
else
  LLMS_ACCESSIBLE=false
  LLMS_SIZE=0
  HAS_DESC=0; HAS_AUDIENCE=0; HAS_PRICING=0; HAS_FAQ=0
fi

# 2. robots.txt
ROBOTS_STATUS=$(curl -s -o "$OUT/robots.txt.raw" -w "%{http_code}" "$BASE/robots.txt" || echo "000")
if [ "$ROBOTS_STATUS" = "200" ]; then
  ROBOTS_ACCESSIBLE=true
  GPTBOT=$(grep -ic "user-agent:.*gptbot" "$OUT/robots.txt.raw" || echo 0)
  CLAUDEBOT=$(grep -ic "user-agent:.*claudebot" "$OUT/robots.txt.raw" || echo 0)
  PERPLEXITY=$(grep -ic "user-agent:.*perplexitybot" "$OUT/robots.txt.raw" || echo 0)
  GOOGLE_EXT=$(grep -ic "user-agent:.*google-extended" "$OUT/robots.txt.raw" || echo 0)
else
  ROBOTS_ACCESSIBLE=false
  GPTBOT=0; CLAUDEBOT=0; PERPLEXITY=0; GOOGLE_EXT=0
fi

# 3. JSON-LD + headings (parsing con Node + cheerio)
curl -sL "$URL" -o "$OUT/page.html"

node - <<NODE > "$OUT/geo-page.json"
import { readFileSync, writeFileSync } from 'node:fs';
import { load } from 'cheerio';

const html = readFileSync('$OUT/page.html', 'utf8');
const \$ = load(html);

const schemas = [];
\$('script[type="application/ld+json"]').each((_, el) => {
  try {
    const data = JSON.parse(\$(el).html());
    const types = Array.isArray(data) ? data.map(d => d['@type']) : [data['@type']];
    types.flat().forEach(t => schemas.push({ type: t, valid: !!t, errors: t ? [] : ['missing @type'] }));
  } catch (e) {
    schemas.push({ type: null, valid: false, errors: [e.message] });
  }
});

const h1Count = \$('h1').length;
const headings = [];
\$('h1, h2, h3, h4, h5, h6').each((_, el) => {
  headings.push(parseInt(el.tagName.substring(1), 10));
});
const skips = [];
for (let i = 1; i < headings.length; i++) {
  if (headings[i] > headings[i - 1] + 1) {
    skips.push(\`h\${headings[i-1]} → h\${headings[i]}\`);
  }
}

const heroText = \$('h1').first().text().trim().slice(0, 200);
const directAnswerFirst = /^[A-ZÁÉÍÓÚÑ].{10,}\\.$/.test(heroText) || heroText.split(/\\s+/).length <= 14;

console.log(JSON.stringify({
  schemas,
  h1Count,
  hierarchyClean: skips.length === 0 && h1Count === 1,
  skips,
  directAnswerFirst,
}, null, 2));
NODE

# 4. Compilar geo.json final
node - <<NODE > "$OUT/geo.json"
import { readFileSync } from 'node:fs';
const page = JSON.parse(readFileSync('$OUT/geo-page.json', 'utf8'));
const issues = [];

if (!${LLMS_ACCESSIBLE}) issues.push('llms.txt no accesible (404 o 5xx).');
if (${LLMS_ACCESSIBLE} && ${LLMS_SIZE} > 8192) issues.push('llms.txt > 8KB, recomendado <8KB.');
if (${HAS_DESC} === 0) issues.push('llms.txt sin línea > de descripción.');
if (${HAS_AUDIENCE} === 0) issues.push('llms.txt sin sección Audiencia.');

if (!${ROBOTS_ACCESSIBLE}) issues.push('robots.txt no accesible.');
if (${GPTBOT} === 0) issues.push('GPTBot no permitido explícitamente en robots.txt.');
if (${CLAUDEBOT} === 0) issues.push('ClaudeBot no permitido explícitamente.');
if (${PERPLEXITY} === 0) issues.push('PerplexityBot no permitido explícitamente.');
if (${GOOGLE_EXT} === 0) issues.push('Google-Extended no permitido explícitamente.');

const hasOrg = page.schemas.some(s => s.type === 'Organization');
const hasApp = page.schemas.some(s => s.type === 'SoftwareApplication');
const hasFaq = page.schemas.some(s => s.type === 'FAQPage');
const hasProduct = page.schemas.some(s => s.type === 'Product');
if (!hasOrg) issues.push('JSON-LD Organization ausente.');
if (!hasApp) issues.push('JSON-LD SoftwareApplication ausente.');
if (!hasFaq) issues.push('JSON-LD FAQPage ausente.');
if (!hasProduct) issues.push('JSON-LD Product ausente.');

if (page.h1Count !== 1) issues.push(\`Se esperaba 1 h1 por página, hay \${page.h1Count}.\`);
if (page.skips.length > 0) issues.push(\`Saltos en jerarquía de headings: \${page.skips.join(', ')}\`);
if (!page.directAnswerFirst) issues.push('Hero no abre con respuesta directa (>14 palabras o frase incompleta).');

console.log(JSON.stringify({
  llmsTxt: {
    accessible: ${LLMS_ACCESSIBLE},
    hasDescription: ${HAS_DESC} > 0,
    hasAudience: ${HAS_AUDIENCE} > 0,
    hasPricing: ${HAS_PRICING} > 0,
    hasFaq: ${HAS_FAQ} > 0,
    sizeBytes: ${LLMS_SIZE},
  },
  robotsTxt: {
    accessible: ${ROBOTS_ACCESSIBLE},
    crawlersAllowed: {
      GPTBot: ${GPTBOT} > 0,
      ClaudeBot: ${CLAUDEBOT} > 0,
      PerplexityBot: ${PERPLEXITY} > 0,
      GoogleExtended: ${GOOGLE_EXT} > 0,
    },
  },
  jsonLd: {
    schemas: page.schemas,
    hasOrganization: hasOrg,
    hasSoftwareApplication: hasApp,
    hasFaqPage: hasFaq,
    hasProduct: hasProduct,
  },
  headings: {
    h1Count: page.h1Count,
    hierarchyClean: page.hierarchyClean,
    skips: page.skips,
  },
  directAnswerFirst: page.directAnswerFirst,
  issues,
}, null, 2));
NODE

rm -f "$OUT/geo-page.json"
echo "OK · $OUT/geo.json"
