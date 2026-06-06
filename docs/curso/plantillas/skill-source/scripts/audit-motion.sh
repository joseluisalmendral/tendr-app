#!/usr/bin/env bash
# scripts/audit-motion.sh
# Audita la capa de motion contra el PRESUPUESTO DEL PROYECTO AUDITADO,
# definido en audit.config.json (clave "motion"), no contra principios
# genéricos ni valores fijos en el script.
#
# Resolución de config (primer match gana):
#   1. $AUDIT_CONFIG (path a JSON)
#   2. <SRC_DIR>/docs/audits/audit.config.json
#   3. <SRC_DIR>/audit.config.json
# SIN config: modo descriptivo — se reportan datos (librerías, easings,
# pins, guards) pero NO se emiten juicios de presupuesto. El agente debe
# preguntar al usuario el presupuesto y ofrecer persistirlo como config.
#
# Dos fuentes de evidencia:
#   1. Página servida (HTML + CSS + JS publicados): firmas de librerías,
#      scroll-driven, reduced-motion, cubic-beziers. Best-effort sobre
#      bundles minificados.
#   2. Source local (si SRC_DIR con package.json existe): deps reales,
#      guards por componente, tokens. Autoritativo cuando está.
#
# Uso: bash audit-motion.sh <URL> <OUT_DIR> [SRC_DIR]
# Output: <OUT_DIR>/motion.json · En caso de fallo: <OUT_DIR>/motion.error

set -euo pipefail

URL="${1:?Falta URL}"
OUT="${2:?Falta directorio output}"
SRC="${3:-.}"
mkdir -p "$OUT"

fail() {
  echo "$1" > "$OUT/motion.error"
  echo "ERROR · motion: $1" >&2
  exit 1
}

[ -f "$SRC/package.json" ] || SRC=""

URL="$URL" SRC="$SRC" AUDIT_CONFIG="${AUDIT_CONFIG:-}" \
node --input-type=module - <<'NODE' > "$OUT/motion.json" || fail "fallo analizando motion"
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const url = process.env.URL;
const src = process.env.SRC;
const issues = [];
const notes = [];

// ---------- Presupuesto del proyecto (audit.config.json) ----------
let config = null;
const candidates = [
  process.env.AUDIT_CONFIG,
  src && join(src, 'docs/audits/audit.config.json'),
  src && join(src, 'audit.config.json'),
].filter(Boolean);
for (const p of candidates) {
  try { config = JSON.parse(readFileSync(p, 'utf8')); notes.push(`Config cargada: ${p}`); break; } catch {}
}
const BUDGET = config?.motion ?? null;
const SPEC_BEZIERS = BUDGET?.easings
  ? new Set(Object.values(BUDGET.easings).map(v => v.join(',')))
  : null;
const allowedSet = new Set((BUDGET?.allowedLibraries ?? []).map(s => s.toLowerCase()));
if (!BUDGET) {
  notes.push('SIN PRESUPUESTO DE MOTION (no hay audit.config.json con clave "motion"): modo descriptivo, sin juicios. El agente NO debe asumir presupuesto — preguntar al usuario: ¿qué librerías de animación están permitidas?, ¿cuántos momentos wow/scroll-pins tolera el diseño?, ¿qué easings define el design system?, ¿reduced-motion es requisito por coreografía? Ofrecer persistir las respuestas en docs/audits/audit.config.json.');
}
const normBezier = (s) => s.split(',').map(n => parseFloat(n)).map(n => Math.round(n * 1000) / 1000).join(',');

// ---------- 1. Página servida ----------
const fetchText = async (u) => {
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
    return r.ok ? await r.text() : '';
  } catch { return ''; }
};

const html = await fetchText(url);
if (!html) { console.error(`no se pudo descargar ${url}`); process.exit(1); }
const abs = (u) => { try { return new URL(u, url).href; } catch { return null; } };

const cssUrls = [...html.matchAll(/<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi)]
  .map(m => abs(m[0].match(/href\s*=\s*["']([^"']+)["']/i)?.[1])).filter(Boolean).slice(0, 12);
const jsUrls = [...html.matchAll(/<script[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi)]
  .map(m => abs(m[1])).filter(Boolean).slice(0, 20);

const cssAll = (await Promise.all(cssUrls.map(fetchText))).join('\n') +
  [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n');
const jsAll = (await Promise.all(jsUrls.map(fetchText))).join('\n');
const servedAll = html + cssAll + jsAll;

// Firmas de librerías en bundles minificados (best-effort; strings que
// sobreviven a la minificación). `aliases` = nombres de paquete npm para
// contrastar con allowedLibraries de la config.
const LIB_SIGNATURES = [
  { name: 'lenis', aliases: ['lenis', '@studio-freight/lenis'], re: /lenis-smooth|lenis-scrolling|data-lenis|\blenis\b/i },
  { name: 'motion (framer)', aliases: ['motion', 'framer-motion'], re: /framerAppearId|data-framer|motion\.dev|framer-motion/i },
  { name: 'gsap', aliases: ['gsap'], re: /\bgsap\b|ScrollTrigger/ },
  { name: 'aos', aliases: ['aos'], re: /data-aos|aos-animate/ },
  { name: 'lottie', aliases: ['lottie-web', 'lottie-react'], re: /\blottie\b/i },
  { name: 'anime.js', aliases: ['animejs'], re: /\banimejs\b/ },
  { name: 'react-spring', aliases: ['react-spring', '@react-spring/web'], re: /react-spring/ },
];
const detected = LIB_SIGNATURES.filter(l => l.re.test(servedAll));
const servedLibs = detected.map(l => l.name);
const offBudgetServed = BUDGET
  ? detected.filter(l => !l.aliases.some(a => allowedSet.has(a))).map(l => l.name)
  : [];
const cssScrollDriven = /animation-timeline|view-timeline|scroll-timeline/.test(cssAll);
const reducedMotionInCss = /prefers-reduced-motion/.test(cssAll);
const servedBeziers = [...new Set([...cssAll.matchAll(/cubic-bezier\(\s*([^)]+)\)/g)].map(m => normBezier(m[1])))];
const servedOffSpec = SPEC_BEZIERS ? servedBeziers.filter(b => !SPEC_BEZIERS.has(b)) : [];
const stickyCount = (cssAll.match(/position\s*:\s*sticky/g) ?? []).length;

const served = {
  libraries: servedLibs,
  cssScrollDriven,
  reducedMotionInCss,
  cubicBeziers: { found: servedBeziers, offSpec: servedOffSpec },
  stickyCount,
  assetsScanned: { css: cssUrls.length, js: jsUrls.length },
};
notes.push('Detección en bundles minificados es best-effort; el análisis de source (si está) es el autoritativo.');

// ---------- 2. Source local (autoritativo) ----------
let source = null;
if (src) {
  const pkg = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  // Detección universal de deps de animación; el juicio (permitida o no)
  // viene de la config.
  const ANIMATION_DEPS = /^(motion|framer-motion|lenis|@studio-freight\/lenis|gsap|animejs|aos|scrollreveal|lottie-web|lottie-react|@lottiefiles\/.*|react-spring|@react-spring\/.*|@rive-app\/.*|velocity-animate)$/;
  const animationDeps = Object.keys(deps).filter(d => ANIMATION_DEPS.test(d));
  const offBudgetDeps = BUDGET ? animationDeps.filter(d => !allowedSet.has(d.toLowerCase())) : [];

  // Walk de app/, components/, src/, styles/
  const files = [];
  const walk = (dir, depth = 0) => {
    if (depth > 6) return;
    let entries; try { entries = readdirSync(join(src, dir)); } catch { return; }
    for (const e of entries) {
      if (e === 'node_modules' || e.startsWith('.')) continue;
      const rel = join(dir, e);
      const st = statSync(join(src, rel));
      if (st.isDirectory()) walk(rel, depth + 1);
      else if (/\.(tsx?|css|scss)$/.test(e) && !/\.(test|spec)\./.test(e)) files.push(rel);
    }
  };
  for (const d of ['app', 'components', 'src', 'styles']) walk(d);

  const contents = new Map(files.map(f => [f, readFileSync(join(src, f), 'utf8')]));

  // Coreografías: componentes que importan motion (runtime, no `import type`)
  // o usan scroll-driven CSS.
  const isChoreography = (c) => /import\s+(?!type\b)[^;]*from\s+["'](motion|framer-motion)/.test(c) || /animation-timeline|view-timeline/.test(c);
  const hasGuard = (c) => /useReducedMotion|prefers-reduced-motion/i.test(c);
  const choreographyFiles = files.filter(f => isChoreography(contents.get(f)));
  const withoutGuard = choreographyFiles.filter(f => !hasGuard(contents.get(f)));

  // Kill-switch global en CSS (puede cubrir coreografías CSS, no las de Motion/JS).
  const globalKillSwitch = files.some(f => f.endsWith('.css') &&
    /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/.test(contents.get(f)));

  // Easings en source
  const srcBeziers = [...new Set(files.flatMap(f =>
    [...contents.get(f).matchAll(/cubic-bezier\(\s*([^)]+)\)/g)].map(m => normBezier(m[1]))))];
  const srcOffSpec = SPEC_BEZIERS ? srcBeziers.filter(b => !SPEC_BEZIERS.has(b)) : [];

  // Candidatos a scroll-pin: sticky en componentes (el agente filtra header/layout)
  const pinCandidates = files.filter(f => /position\s*:\s*sticky|sticky top-/.test(contents.get(f)));
  // Uso del easing reservado al wow (token configurable): lista para juicio del agente
  const wowToken = BUDGET?.wowEasingToken ?? null;
  const wowEasingUsers = wowToken ? files.filter(f => contents.get(f).includes(wowToken)) : [];

  source = {
    animationDeps, offBudgetDeps,
    choreographyFiles: choreographyFiles.length,
    filesWithoutReducedMotionGuard: withoutGuard,
    globalReducedMotionKillSwitch: globalKillSwitch,
    easings: { found: srcBeziers, offSpec: srcOffSpec },
    pinCandidates,
    wowEasingUsers,
  };

  if (offBudgetDeps.length) issues.push(`Librería de animación fuera de presupuesto: ${offBudgetDeps.join(', ')} (permitidas: ${[...allowedSet].join(', ')}).`);
  if (BUDGET?.reducedMotionPerChoreography) {
    for (const f of withoutGuard) {
      issues.push(globalKillSwitch
        ? `${f}: coreografía sin guard propio de reduced-motion (hay kill-switch CSS global, pero las animaciones de Motion/JS no lo respetan solas — verificar).`
        : `${f}: coreografía SIN prefers-reduced-motion/useReducedMotion.`);
    }
  }
  for (const b of srcOffSpec) issues.push(`cubic-bezier(${b}) en source no es ninguno de los easings del spec del proyecto — drift entre código y design system: legalizar en el spec o corregir.`);
  if (BUDGET?.maxScrollPins != null && pinCandidates.length > BUDGET.maxScrollPins) {
    issues.push(`${pinCandidates.length} archivos con position:sticky — el presupuesto permite ${BUDGET.maxScrollPins} scroll-pin(s). Revisar cuáles son layout (header) y cuáles coreografía: ${pinCandidates.join(', ')}.`);
  }
} else {
  notes.push('Sin source local: solo análisis de página servida. Pasar SRC_DIR como tercer argumento para el análisis autoritativo.');
}

// Issues de página servida (solo si no hay source que lo cubra mejor)
if (offBudgetServed.length) issues.push(`Firma de librería fuera de presupuesto en el bundle servido: ${offBudgetServed.join(', ')}.`);
if (!reducedMotionInCss && !source) issues.push('Sin rastro de prefers-reduced-motion en el CSS servido.');
if (servedOffSpec.length && !source) issues.push(`cubic-beziers fuera del spec en CSS servido: ${servedOffSpec.join(' | ')}.`);

if (BUDGET) {
  notes.push('HEURÍSTICO (juicio del agente): el conteo de pins es automático, pero decidir cuál es EL wow y si el easing reservado está bien acotado requiere leer la página. Ver wowEasingUsers y pinCandidates.');
}

console.log(JSON.stringify({
  budget: BUDGET,
  configMissing: !BUDGET,
  served,
  source,
  issues,
  notes,
}, null, 2));
NODE

echo "OK · $OUT/motion.json"
