#!/usr/bin/env bash
# scripts/audit-geo.sh
# Audita la capa GEO (Generative Engine Optimization) de una URL:
# llms.txt, robots.txt con semántica real de grupos (training vs retrieval
# bots), JSON-LD (incl. @graph) con validación local de campos requeridos,
# jerarquía de headings, respuesta directa en el hero y visibilidad SSR.
#
# Zero-dependency: Node puro, sin cheerio ni validadores externos.
#
# Contexto 2026 (validado contra el panorama vigente):
# - robots.txt: AUSENCIA de un bot = permitido por defecto. Lo que importa
#   detectar son BLOQUEOS (Disallow: / en el grupo que matchea).
# - Training bots (GPTBot, ClaudeBot, Google-Extended, CCBot) afectan
#   datasets futuros. Retrieval/agentic bots (OAI-SearchBot, ChatGPT-User,
#   Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User) afectan
#   citas en respuestas IA en tiempo real: bloquearlos es el issue grave.
# - llms.txt: ~10% adopción; los crawlers de AI search apenas lo consultan,
#   pero los agentes IDE/agénticos sí. Higiene de bajo coste, no crítico.
# - La mayoría de bots IA NO ejecutan JS: el contenido debe estar en el SSR.
#
# Uso: bash audit-geo.sh <URL> <OUT_DIR>
# Output: <OUT_DIR>/geo.json · En caso de fallo: <OUT_DIR>/geo.error

set -euo pipefail

URL="${1:?Falta URL}"
OUT="${2:?Falta directorio output}"
mkdir -p "$OUT"

BASE="${URL%/}"

fail() {
  echo "$1" > "$OUT/geo.error"
  echo "ERROR · geo: $1" >&2
  exit 1
}

# 1. Página principal (el único fetch obligatorio)
PAGE_STATUS=$(curl -sL -w "%{http_code}" -o "$OUT/page-geo.html" "$URL") || fail "curl falló contra $URL"
case "$PAGE_STATUS" in
  2*) : ;;
  *) fail "la URL respondió HTTP $PAGE_STATUS" ;;
esac

# 2. llms.txt + llms-full.txt
LLMS_STATUS=$(curl -sL -w "%{http_code}" -o "$OUT/llms.txt.raw" "$BASE/llms.txt" || echo "000")
LLMS_FULL_STATUS=$(curl -sL -o /dev/null -w "%{http_code}" "$BASE/llms-full.txt" || echo "000")

# 3. robots.txt
ROBOTS_STATUS=$(curl -sL -w "%{http_code}" -o "$OUT/robots.txt.raw" "$BASE/robots.txt" || echo "000")

# 4. Parsear todo y compilar geo.json
HTML_PATH="$OUT/page-geo.html" LLMS_PATH="$OUT/llms.txt.raw" ROBOTS_PATH="$OUT/robots.txt.raw" \
LLMS_STATUS="$LLMS_STATUS" LLMS_FULL_STATUS="$LLMS_FULL_STATUS" ROBOTS_STATUS="$ROBOTS_STATUS" \
AUDIT_CONFIG="${AUDIT_CONFIG:-}" \
node --input-type=module - <<'NODE' > "$OUT/geo.json" || fail "fallo parseando los artefactos"
import { readFileSync } from 'node:fs';

const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
const html = read(process.env.HTML_PATH);
const issues = [];
const notes = [];

// ---------- Expectativas del proyecto (audit.config.json, clave "geo") ----------
// Sin config: modo descriptivo para lo proyecto-específico (schemas esperados,
// secciones de llms.txt). Los checks universales (robots, headings, SSR,
// validez de JSON-LD) se emiten siempre.
let config = null;
for (const p of [process.env.AUDIT_CONFIG, 'docs/audits/audit.config.json', 'audit.config.json'].filter(Boolean)) {
  try { config = JSON.parse(readFileSync(p, 'utf8')); notes.push(`Config cargada: ${p}`); break; } catch {}
}
const GEO = config?.geo ?? null;
if (!GEO) {
  notes.push('SIN CONFIG GEO (no hay audit.config.json con clave "geo"): no se juzgan schemas esperados ni secciones de llms.txt. El agente NO debe asumir — preguntar al usuario: ¿qué tipos JSON-LD corresponden a este sitio (Organization, Product, SoftwareApplication, FAQPage, Article…)?, ¿qué secciones debería cubrir su llms.txt? Ofrecer persistir las respuestas en docs/audits/audit.config.json.');
}

// ---------- llms.txt ----------
const llmsAccessible = process.env.LLMS_STATUS === '200';
const llmsRaw = llmsAccessible ? read(process.env.LLMS_PATH) : '';
// Heurística anti-falso-200: SPAs devuelven el index.html para cualquier ruta.
const llmsIsHtml = /^\s*</.test(llmsRaw);
const llmsOk = llmsAccessible && !llmsIsHtml;
const llmsTxt = {
  accessible: llmsOk,
  hasH1: /^#\s+\S/m.test(llmsRaw),
  hasDescription: /^>\s+\S/m.test(llmsRaw),
  hasAudience: /audiencia|audience/i.test(llmsRaw),
  hasPricing: /pricing|precio|plan/i.test(llmsRaw),
  hasFaq: /faq|preguntas frecuentes/i.test(llmsRaw),
  sizeBytes: llmsOk ? Buffer.byteLength(llmsRaw) : 0,
  llmsFullExists: process.env.LLMS_FULL_STATUS === '200',
};
if (!llmsOk) {
  issues.push(llmsIsHtml
    ? 'llms.txt devuelve HTML (fallback de SPA), no markdown: equivale a no tenerlo.'
    : `llms.txt no accesible (HTTP ${process.env.LLMS_STATUS}). Higiene de bajo coste: lo consultan agentes IDE/agénticos, no los crawlers de AI search.`);
} else {
  if (!llmsTxt.hasH1) issues.push('llms.txt sin H1 (# Nombre) — la spec lo requiere como primera línea.');
  if (!llmsTxt.hasDescription) issues.push('llms.txt sin blockquote (>) de descripción.');
  if (llmsTxt.sizeBytes > 8192) issues.push(`llms.txt de ${llmsTxt.sizeBytes} bytes (>8KB; debe ser un índice conciso, el detalle va en llms-full.txt).`);
  // Secciones esperadas: solo las que la config declara para este proyecto.
  const SECTION_KEYS = { audience: 'hasAudience', pricing: 'hasPricing', faq: 'hasFaq' };
  for (const s of GEO?.llmsSections ?? []) {
    const k = SECTION_KEYS[s];
    if (k && !llmsTxt[k]) issues.push(`llms.txt sin sección esperada por la config: ${s}.`);
  }
}

// ---------- robots.txt: parser de grupos con semántica real ----------
const robotsAccessible = process.env.ROBOTS_STATUS === '200';
const robotsRaw = robotsAccessible ? read(process.env.ROBOTS_PATH) : '';

const groups = [];
let current = null, lastWasUA = false;
for (let line of robotsRaw.split(/\r?\n/)) {
  line = line.replace(/#.*$/, '').trim();
  if (!line) continue;
  const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
  if (!m) continue;
  const key = m[1].toLowerCase();
  const value = m[2].trim();
  if (key === 'user-agent') {
    if (!lastWasUA) { current = { uas: [], rules: [] }; groups.push(current); }
    current.uas.push(value.toLowerCase());
    lastWasUA = true;
  } else if (key === 'allow' || key === 'disallow') {
    if (current) current.rules.push({ type: key, path: value });
    lastWasUA = false;
  } else {
    lastWasUA = false;
  }
}

// Política efectiva para "/" de un bot: grupo específico > grupo * > default allow.
function policyFor(bot) {
  const b = bot.toLowerCase();
  const specific = groups.filter(g => g.uas.some(ua => ua !== '*' && (b === ua || b.includes(ua))));
  const wildcard = groups.filter(g => g.uas.includes('*'));
  const applicable = specific.length ? specific : wildcard;
  if (!applicable.length) return 'allowed-default';
  // Regla aplicable a "/" con longest-match; Disallow vacío = allow all.
  let best = null;
  for (const g of applicable) for (const r of g.rules) {
    const prefix = r.path.replace(/[*$].*$/, '');
    if (r.path !== '' && !'/'.startsWith(prefix)) continue;
    const len = r.path === '' ? -1 : prefix.length;
    if (!best || len > best.len) best = { type: r.type, len };
  }
  if (!best || best.len === -1) return specific.length ? 'allowed-explicit' : 'allowed-default';
  if (best.type === 'disallow') return 'blocked';
  return specific.length ? 'allowed-explicit' : 'allowed-default';
}

const TRAINING_BOTS = { GPTBot: 'gptbot', ClaudeBot: 'claudebot', GoogleExtended: 'google-extended', CCBot: 'ccbot' };
const RETRIEVAL_BOTS = {
  'OAI-SearchBot': 'oai-searchbot', 'ChatGPT-User': 'chatgpt-user',
  'Claude-SearchBot': 'claude-searchbot', 'Claude-User': 'claude-user',
  PerplexityBot: 'perplexitybot', 'Perplexity-User': 'perplexity-user',
};

const policy = {};
for (const [name, token] of Object.entries({ ...TRAINING_BOTS, ...RETRIEVAL_BOTS })) {
  policy[name] = robotsAccessible ? policyFor(token) : 'unknown';
}

const crawlersAllowed = {
  GPTBot: policy.GPTBot !== 'blocked',
  ClaudeBot: policy.ClaudeBot !== 'blocked',
  PerplexityBot: policy.PerplexityBot !== 'blocked',
  GoogleExtended: policy.GoogleExtended !== 'blocked',
};

if (!robotsAccessible) {
  issues.push(`robots.txt no accesible (HTTP ${process.env.ROBOTS_STATUS}).`);
} else {
  for (const name of Object.keys(RETRIEVAL_BOTS)) {
    if (policy[name] === 'blocked') issues.push(`${name} BLOQUEADO en robots.txt — bot de retrieval: la página desaparece de las respuestas IA en horas. Grave.`);
  }
  for (const name of Object.keys(TRAINING_BOTS)) {
    if (policy[name] === 'blocked') issues.push(`${name} bloqueado en robots.txt — bot de training: el contenido no entra en datasets futuros. Verificar si es intencional.`);
  }
}

// ---------- JSON-LD (con soporte @graph y arrays) ----------
const schemas = [];
const REQUIRED = {
  Organization: ['name', 'url'],
  SoftwareApplication: ['name', 'applicationCategory', 'offers'],
  FAQPage: ['mainEntity'],
  Product: ['name', 'image', 'offers'],
};
const flatten = (data) => Array.isArray(data) ? data.flatMap(flatten)
  : data && typeof data === 'object' ? (data['@graph'] ? flatten(data['@graph']) : [data]) : [];

for (const m of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
  let parsed;
  try { parsed = JSON.parse(m[1]); }
  catch (e) { schemas.push({ type: null, valid: false, errors: [`JSON inválido: ${e.message}`] }); continue; }
  for (const node of flatten(parsed)) {
    const type = [].concat(node['@type'] ?? [])[0] ?? null;
    const errors = [];
    if (!type) errors.push('@type ausente');
    for (const field of REQUIRED[type] ?? []) {
      const v = node[field];
      if (v == null || (Array.isArray(v) && !v.length)) errors.push(`falta ${field}`);
    }
    if (type === 'FAQPage' && Array.isArray(node.mainEntity)) {
      const bad = node.mainEntity.filter(q => !q?.acceptedAnswer?.text && !q?.acceptedAnswer?.name);
      if (bad.length) errors.push(`${bad.length} Question sin acceptedAnswer.text`);
    }
    schemas.push({ type, valid: errors.length === 0, errors });
  }
}
notes.push('Validación JSON-LD: campos requeridos por tipo en local (schema-dts no es un validador runtime, son typings). Para validación exhaustiva: validator.schema.org.');

const present = (t) => schemas.some(s => s.type === t);
const presentValid = (t) => schemas.some(s => s.type === t && s.valid);
const jsonLd = {
  schemas,
  hasOrganization: present('Organization'),
  hasSoftwareApplication: present('SoftwareApplication'),
  hasFaqPage: present('FAQPage'),
  hasProduct: present('Product'),
};
if (!schemas.length) {
  issues.push('Sin JSON-LD: los motores generativos pierden el grounding de entidad (qué es, quién lo hace, qué cuesta).');
} else {
  // Tipos esperados: los que la config declara para este proyecto.
  for (const t of GEO?.expectedSchemas ?? []) {
    if (!present(t)) issues.push(`JSON-LD ${t} ausente (esperado por la config del proyecto).`);
    else if (!presentValid(t)) issues.push(`JSON-LD ${t} presente pero incompleto: ${schemas.find(s => s.type === t)?.errors.join(', ')}.`);
  }
  // Universal: schemas presentes pero rotos, se reportan siempre.
  for (const s of schemas.filter(x => !x.valid && !(GEO?.expectedSchemas ?? []).includes(x.type))) {
    issues.push(`JSON-LD ${s.type ?? 'sin @type'} inválido: ${s.errors.join(', ')}.`);
  }
}

// ---------- Headings ----------
const headingTags = [...html.matchAll(/<h([1-6])\b/gi)].map(m => parseInt(m[1], 10));
const h1Count = headingTags.filter(l => l === 1).length;
const skips = [];
for (let i = 1; i < headingTags.length; i++) {
  if (headingTags[i] > headingTags[i - 1] + 1) skips.push(`h${headingTags[i - 1]} → h${headingTags[i]}`);
}
const headings = { h1Count, hierarchyClean: skips.length === 0 && h1Count === 1, skips };
if (h1Count !== 1) issues.push(`Se esperaba 1 h1, hay ${h1Count}. Los extractores de respuesta usan el h1 como "qué es esta página".`);
if (skips.length) issues.push(`Saltos en jerarquía de headings: ${[...new Set(skips)].join(', ')}.`);

// ---------- Direct answer first (heurística) ----------
const h1Text = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '')
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const directAnswerFirst = h1Text.length > 0 &&
  (h1Text.split(/\s+/).length <= 14 || /^[A-ZÁÉÍÓÚÑ¿].{10,}[.?!]$/.test(h1Text));
if (!directAnswerFirst) issues.push('El hero no abre con respuesta directa (h1 >14 palabras o frase incompleta). Los motores generativos citan la frase que responde "qué es" en una línea.');

// ---------- Visibilidad SSR (los bots IA no ejecutan JS) ----------
const ssrText = html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ').trim();
const ssrTextBytes = Buffer.byteLength(ssrText);
if (ssrTextBytes < 1500) issues.push(`Solo ${ssrTextBytes} bytes de texto en el HTML servidor: la mayoría de bots IA no ejecutan JS, el contenido client-side es invisible para ellos.`);

console.log(JSON.stringify({
  llmsTxt,
  robotsTxt: { accessible: robotsAccessible, crawlersAllowed, policy },
  jsonLd,
  headings,
  directAnswerFirst,
  ssrTextBytes,
  issues,
  notes,
}, null, 2));
NODE

echo "OK · $OUT/geo.json"
