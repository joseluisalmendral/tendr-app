#!/usr/bin/env bash
# scripts/audit-performance.sh
# Audita la capa de performance de una URL con @unlighthouse/cli (Lighthouse):
# score, Core Web Vitals de laboratorio y top 5 opportunities.
#
# Uso: bash audit-performance.sh <URL> <OUT_DIR>
#
# Output: <OUT_DIR>/performance.json
# En caso de fallo: <OUT_DIR>/performance.error con el stderr del CLI.
#
# Nota: INP es una métrica de campo (requiere interacción real); Lighthouse
# en modo navigation no la mide. Se reporta inp: null y TBT como proxy de lab.

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/_lib/tool-spec.sh"

URL="${1:?Falta URL}"
OUT="${2:?Falta directorio output}"
mkdir -p "$OUT"

WORK="$OUT/unlighthouse"
LOG="$OUT/unlighthouse.log"

fail() {
  cp "$LOG" "$OUT/performance.error" 2>/dev/null || echo "$1" > "$OUT/performance.error"
  echo "ERROR · performance: $1 (detalle en $OUT/performance.error)" >&2
  exit 1
}

# Derivar origin y ruta: auditamos SOLO la URL dada, sin crawlear el sitio.
# La URL entra por env var, NUNCA interpolada en el código JS (inyección).
ORIGIN=$(U="$URL" node -e "console.log(new URL(process.env.U).origin)" 2>/dev/null) || fail "URL inválida: $URL"
ROUTE=$(U="$URL" node -e "const u=new URL(process.env.U); console.log(u.pathname + u.search)" 2>/dev/null)

# Sintaxis verificada con `npx @unlighthouse/cli ci --help` (v0.17.9):
# no existe --output-format; el reporter JSON se pide con --reporter.
# Versión PINNEADA en tools.lock.json (supply chain). Avanzar el pin solo via
# scripts/update-tools.sh, nunca a mano.
resolve_tool "@unlighthouse/cli" || fail "no se pudo resolver @unlighthouse/cli"
"${TOOL_CMD[@]}" ci \
  --site "$ORIGIN" \
  --urls "$ROUTE" \
  --output-path "$WORK" \
  --reporter jsonExpanded \
  --no-cache \
  > "$LOG" 2>&1 || fail "@unlighthouse/cli ci salió con código != 0"

# Localizar artefactos: ci-result.json (resumen) y el lighthouse.json
# completo de la ruta (métricas + opportunities).
CI_RESULT=$(find "$WORK" -name "ci-result.json" -type f 2>/dev/null | head -1 || true)
LH_REPORT=$(find "$WORK" -name "lighthouse.json" -type f 2>/dev/null | head -1 || true)
[ -n "$CI_RESULT" ] || [ -n "$LH_REPORT" ] || fail "el CLI terminó pero no generó ci-result.json ni lighthouse.json en $WORK"

CI_RESULT="$CI_RESULT" LH_REPORT="$LH_REPORT" node --input-type=module - <<'NODE' > "$OUT/performance.json" || fail "fallo parseando los reportes"
import { readFileSync } from 'node:fs';

const ciPath = process.env.CI_RESULT;
const lhPath = process.env.LH_REPORT;

let score = null;
let lcp = null, cls = null, fcp = null, ttfb = null, tbt = null;
let topOpportunities = [];

if (lhPath) {
  const lh = JSON.parse(readFileSync(lhPath, 'utf8'));
  const a = lh.audits ?? {};
  const num = (id) => a[id]?.numericValue ?? null;
  const ms = (v) => (v == null ? null : Math.round(v));

  score = lh.categories?.performance?.score != null
    ? Math.round(lh.categories.performance.score * 100)
    : null;
  lcp = ms(num('largest-contentful-paint'));
  cls = num('cumulative-layout-shift') != null
    ? Math.round(num('cumulative-layout-shift') * 1000) / 1000
    : null;
  fcp = ms(num('first-contentful-paint'));
  ttfb = ms(num('server-response-time'));
  tbt = ms(num('total-blocking-time'));

  topOpportunities = Object.entries(a)
    .filter(([, audit]) =>
      audit?.details?.type === 'opportunity' &&
      (audit.details.overallSavingsMs ?? 0) > 0 &&
      audit.score != null && audit.score < 1)
    .map(([id, audit]) => ({
      id,
      title: audit.title,
      savingsMs: Math.round(audit.details.overallSavingsMs),
    }))
    .sort((x, y) => y.savingsMs - x.savingsMs)
    .slice(0, 5);
}

// Fallback: si no hay reporte completo, al menos el score del ci-result.
if (score == null && ciPath) {
  const ci = JSON.parse(readFileSync(ciPath, 'utf8'));
  const routes = Array.isArray(ci) ? ci : ci.routes ?? [];
  const first = routes[0];
  const raw = first?.categories?.performance?.score ?? first?.score ?? ci.summary?.score;
  if (raw != null) score = Math.round(raw * 100);
}

console.log(JSON.stringify({
  score,
  lcp,
  inp: null, // field-only metric; Lighthouse lab does not measure it
  tbt,       // lab proxy for interactivity
  cls,
  fcp,
  ttfb,
  topOpportunities,
  rawReportDir: process.env.CI_RESULT ? process.env.CI_RESULT.replace(/\/ci-result\.json$/, '') : null,
}, null, 2));
NODE

echo "OK · $OUT/performance.json"
