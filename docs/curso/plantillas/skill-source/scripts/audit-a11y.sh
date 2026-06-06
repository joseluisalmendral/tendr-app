#!/usr/bin/env bash
# scripts/audit-a11y.sh
# Audita la capa de accesibilidad de una URL con @axe-core/cli (Chrome
# headless via WebDriver): violations agrupadas por impact, passes e
# incomplete (checks que requieren revisión humana).
#
# Se usa npx -y en lugar de instalación global: no requiere prompt ni
# contamina el entorno, y garantiza versión reciente.
#
# Uso: bash audit-a11y.sh <URL> <OUT_DIR>
# Output: <OUT_DIR>/a11y.json · En caso de fallo: <OUT_DIR>/a11y.error

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/_lib/tool-spec.sh"

URL="${1:?Falta URL}"
OUT="${2:?Falta directorio output}"
mkdir -p "$OUT"

LOG="$OUT/axe.log"
resolve_tool "@axe-core/cli" || { echo "no se pudo resolver @axe-core/cli" >&2; exit 1; }

fail() {
  # Extraer la línea Error: real (no el stacktrace de chromedriver).
  local axe_err
  axe_err=$(grep -aiE "Error:|net::ERR|ERR_[A-Z_]+" "$LOG" 2>/dev/null | head -3 | sed 's/\x1b\[[0-9;]*m//g')
  { echo "$1"; [ -n "$axe_err" ] && { echo "---"; echo "$axe_err"; }; } > "$OUT/a11y.error"
  echo "ERROR · a11y: $1${axe_err:+ — $axe_err}" >&2
  exit 1
}

# Sintaxis verificada con `npx @axe-core/cli --help`:
# --save toma filename, --dir el directorio. Sin --exit: el CLI devuelve 0
# aunque haya violations (queremos reportarlas, no romper el pipeline).
# --load-delay da margen a la hidratación/animaciones de entrada antes de auditar.
# Versión PINNEADA en tools.lock.json (supply chain). Avanzar el pin solo via
# scripts/update-tools.sh, nunca a mano.
axe_once() {
  "${TOOL_CMD[@]}" "$URL" \
    --dir "$OUT" \
    --save a11y-raw.json \
    --load-delay 1500 \
    --timeout 120 \
    "$@" \
    > "$LOG" 2>&1
}

# chromedriver crashea de forma intermitente (stacktrace de Rust, "session
# not created" sin mismatch de versión). Reintento con backoff ante fallos
# transitorios; NO reintenta si es un mismatch de versión (eso lo cura el
# bloque de auto-reparación de abajo).
run_axe() {
  local attempt
  for attempt in 1 2 3; do
    if axe_once "$@"; then return 0; fi
    # No reintentar errores no-transitorios: mismatch de versión (lo cura el
    # auto-repair) o fallo de red/DNS (reintentar no lo arregla).
    grep -q "only supports Chrome version" "$LOG" && return 1
    grep -qaE "net::ERR_NAME_NOT_RESOLVED|net::ERR_CONNECTION|net::ERR_ADDRESS|ERR_INTERNET_DISCONNECTED" "$LOG" && return 1
    [ "$attempt" -lt 3 ] && { echo "axe falló (intento $attempt/3), reintentando..." >&2; sleep $((attempt * 2)); }
  done
  return 1
}

# Versión major del Chrome local (macOS y Linux).
chrome_major() {
  local v=""
  if [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
    v=$("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --version 2>/dev/null)
  elif command -v google-chrome >/dev/null 2>&1; then
    v=$(google-chrome --version 2>/dev/null)
  fi
  echo "$v" | grep -oE '[0-9]+' | head -1
}

if ! run_axe; then
  # Auto-reparación del mismatch Chrome/ChromeDriver: el chromedriver que
  # trae axe puede no coincidir con el Chrome local. Detectamos la versión
  # major local y reintentamos con el chromedriver correspondiente.
  if grep -q "only supports Chrome version" "$LOG"; then
    MAJOR=$(chrome_major)
    [ -n "$MAJOR" ] || fail "mismatch Chrome/ChromeDriver y no se pudo detectar la versión de Chrome local"
    echo "Chrome local v${MAJOR} detectado; reintentando con chromedriver@${MAJOR}..." >&2
    # `which` dentro de npm exec resuelve el bin del paquete efímero
    # (require('chromedriver') resolvería desde el cwd del proyecto, no sirve).
    DRIVER=$(npm exec -y --package="chromedriver@$MAJOR" -- which chromedriver 2>/dev/null | tail -1) \
      || fail "no se pudo instalar chromedriver@$MAJOR"
    [ -x "$DRIVER" ] || fail "chromedriver@$MAJOR instalado pero binario no ejecutable: $DRIVER"
    run_axe --chromedriver-path "$DRIVER" || fail "@axe-core/cli falló también con chromedriver@$MAJOR"
  else
    fail "@axe-core/cli salió con código != 0 (¿Chrome instalado?)"
  fi
fi

RAW="$OUT/a11y-raw.json"
[ -s "$RAW" ] || fail "el CLI terminó pero no generó $RAW"

RAW="$RAW" node --input-type=module - <<'NODE' > "$OUT/a11y.json" || fail "fallo parseando $RAW"
import { readFileSync } from 'node:fs';

// El CLI guarda un ARRAY de resultados (uno por URL auditada).
const raw = JSON.parse(readFileSync(process.env.RAW, 'utf8'));
const result = Array.isArray(raw) ? raw[0] : raw;
if (!result || !Array.isArray(result.violations)) {
  console.error('Formato inesperado: sin campo violations.');
  process.exit(1);
}

const IMPACT_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 };

const violations = result.violations
  .map(v => ({
    id: v.id,
    impact: v.impact ?? 'minor',
    help: v.help,
    helpUrl: v.helpUrl,
    nodeCount: v.nodes.length,
    // Muestra acotada: selector + resumen del fallo de los 3 primeros nodos.
    nodes: v.nodes.slice(0, 3).map(n => ({
      target: (n.target ?? []).join(' '),
      summary: (n.failureSummary ?? '').split('\n').filter(Boolean).slice(0, 2).join(' · '),
    })),
  }))
  .sort((a, b) => (IMPACT_ORDER[a.impact] ?? 9) - (IMPACT_ORDER[b.impact] ?? 9));

const countBy = (impact) => violations.filter(v => v.impact === impact).length;

console.log(JSON.stringify({
  violations,
  passes: result.passes?.length ?? 0,
  criticalCount: countBy('critical'),
  seriousCount: countBy('serious'),
  moderateCount: countBy('moderate'),
  minorCount: countBy('minor'),
  // "incomplete" = axe no pudo decidir; requieren revisión humana.
  incompleteCount: result.incomplete?.length ?? 0,
  incomplete: (result.incomplete ?? []).map(i => ({ id: i.id, help: i.help, nodeCount: i.nodes.length })),
  testEngine: result.testEngine?.version ?? null,
}, null, 2));
NODE

echo "OK · $OUT/a11y.json"
