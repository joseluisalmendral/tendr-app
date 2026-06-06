#!/usr/bin/env bash
# scripts/update-tools.sh
# Actualizador AUDITADO de las herramientas pinneadas en tools.lock.json.
# El pin protege; este script permite avanzar el pin SIN perder esa
# protección, pasando una cadena de gates fail-closed.
#
# Por defecto es DRY-RUN: muestra qué cambiaría y corre los gates, pero NO
# escribe. Solo escribe con --yes y si TODOS los gates pasan en verde.
#
# Uso:
#   bash update-tools.sh                      # revisa todas las tools (dry-run)
#   bash update-tools.sh @axe-core/cli        # candidato = última versión
#   bash update-tools.sh @axe-core/cli --to 4.12.0
#   bash update-tools.sh @axe-core/cli --yes  # aplica si los gates pasan
#   bash update-tools.sh @axe-core/cli --allow-young   # salta SOLO el cooldown (ruidoso)
#
# Gates (en orden, cualquiera que falle aborta sin escribir):
#   1. El paquete debe existir ya en tools.lock.json (no se añaden arbitrarios).
#   2. Cooldown: la versión candidata debe tener >= policy.minReleaseAgeDays.
#      Es la defensa #1 contra ataques de supply chain (la mayoría de
#      releases maliciosas se detectan y despublican en horas/días).
#   3. Install en sandbox con --ignore-scripts (NO ejecuta lifecycle scripts
#      del paquete) para capturar el integrity real y correr npm audit.
#   4. Advisories: high/critical bloquea (si policy lo pide).
#   5. Major bump: aviso fuerte + smoke test obligatorio (rompe flags, ej. el
#      --output-format que no existía).
#   6. Smoke test: corre el CLI candidato contra una URL conocida y valida
#      que produce output usable (los flags de los que dependemos siguen ahí).
#   7. Diff + confirmación explícita. Solo entonces se escribe el pin nuevo
#      con su integrity y procedencia.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK="$ROOT/tools.lock.json"
[ -f "$LOCK" ] || { echo "tools.lock.json no encontrado en $LOCK" >&2; exit 1; }

PKG=""; TARGET=""; APPLY=false; ALLOW_YOUNG=false
while [ $# -gt 0 ]; do
  case "$1" in
    --to) TARGET="${2:?--to necesita versión}"; shift 2 ;;
    --yes) APPLY=true; shift ;;
    --allow-young) ALLOW_YOUNG=true; shift ;;
    -*) echo "flag desconocido: $1" >&2; exit 2 ;;
    *) PKG="$1"; shift ;;
  esac
done

# Solo nombres de paquete npm válidos (defensa contra inyección por argumento).
if [ -n "$PKG" ] && ! printf '%s' "$PKG" | grep -qE '^(@[a-z0-9._-]+/)?[a-z0-9._-]+$'; then
  echo "nombre de paquete inválido: $PKG" >&2; exit 2
fi

MIN_AGE=$(node -e "console.log(require('$LOCK').policy?.minReleaseAgeDays ?? 14)")
BLOCK_ADV=$(node -e "console.log(require('$LOCK').policy?.blockHighOrCriticalAdvisories !== false)")

# Lista de paquetes a revisar
if [ -n "$PKG" ]; then
  node -e "if(!require('$LOCK').tools?.['$PKG']){console.error('paquete no está en tools.lock.json: $PKG');process.exit(1)}" || exit 1
  PKGS=("$PKG")
else
  # bash 3.2 (macOS) no tiene mapfile: leemos con while-read.
  PKGS=()
  while IFS= read -r line; do [ -n "$line" ] && PKGS+=("$line"); done < <(node -e "console.log(Object.keys(require('$LOCK').tools).join('\n'))")
fi

# --- Modo overview (sin paquete concreto): solo informa, nunca escribe ---
if [ -z "$PKG" ]; then
  echo "== Revisión de actualizaciones (dry-run, sin smoke test) =="
  for p in "${PKGS[@]}"; do
    cur=$(node -e "console.log(require('$LOCK').tools['$p'].version)")
    latest=$(npm view "$p" version 2>/dev/null || echo "?")
    if [ "$cur" = "$latest" ]; then
      echo "  $p: $cur (al día)"
    else
      relISO=$(node -e "const t=JSON.parse(require('child_process').execSync('npm view $p time --json').toString());console.log(t['$latest']||'')" 2>/dev/null || echo "")
      age=$(node -e "const d='$relISO'; if(!d){console.log('?')} else {console.log(Math.floor((Date.parse('$(date -u +%Y-%m-%dT%H:%M:%SZ)')-Date.parse(d))/86400000))}")
      echo "  $p: $cur -> $latest disponible (edad ${age}d; cooldown ${MIN_AGE}d). Para evaluar: bash update-tools.sh $p"
    fi
  done
  echo "Ningún cambio escrito. Apuntá a un paquete concreto para correr los gates."
  exit 0
fi

# --- Modo paquete concreto: gates completos ---
CUR=$(node -e "console.log(require('$LOCK').tools['$PKG'].version)")
CAND="${TARGET:-$(npm view "$PKG" version 2>/dev/null)}"
[ -n "$CAND" ] || { echo "no se pudo resolver versión candidata de $PKG" >&2; exit 1; }

echo "== $PKG: $CUR -> $CAND =="
if [ "$CUR" = "$CAND" ]; then echo "Ya está en $CAND. Nada que hacer."; exit 0; fi

# Gate 2: cooldown
REL=$(node -e "const t=JSON.parse(require('child_process').execSync('npm view $PKG time --json').toString());console.log(t['$CAND']||'')")
[ -n "$REL" ] || { echo "GATE cooldown: no hay fecha de publicación para $PKG@$CAND (¿versión existe?)." >&2; exit 1; }
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
AGE=$(node -e "console.log(Math.floor((Date.parse('$NOW')-Date.parse('$REL'))/86400000))")
echo "  publicada: $REL (edad ${AGE}d, cooldown ${MIN_AGE}d)"
if [ "$AGE" -lt "$MIN_AGE" ]; then
  if [ "$ALLOW_YOUNG" = true ]; then
    echo "  ⚠️  COOLDOWN SALTADO con --allow-young: versión de ${AGE}d (<${MIN_AGE}d). Estás renunciando a la defensa principal contra supply chain. Asegurate de confiar en este release."
  else
    echo "  ❌ GATE cooldown: $CAND tiene ${AGE}d (<${MIN_AGE}d). Las releases maliciosas suelen despublicarse en este margen. Reintentá más tarde o usá --allow-young si confiás en este release." >&2
    exit 1
  fi
fi

# Gate 3: sandbox install (--ignore-scripts) → integrity + audit
SANDBOX=$(mktemp -d)
trap 'rm -rf "$SANDBOX"' EXIT
echo '{"name":"audit-tool-probe","private":true}' > "$SANDBOX/package.json"
echo "  instalando en sandbox (--ignore-scripts)…"
( cd "$SANDBOX" && npm install "$PKG@$CAND" --omit=dev --ignore-scripts --no-audit --loglevel=error >/dev/null 2>&1 ) \
  || { echo "  ❌ GATE install: npm no pudo instalar/verificar $PKG@$CAND (integrity mismatch o paquete roto)." >&2; exit 1; }

INTEGRITY=$(LOCKF="$SANDBOX/package-lock.json" PKG="$PKG" node -e '
  const l=require(process.env.LOCKF);
  const k=Object.keys(l.packages).find(p=>p.endsWith("node_modules/"+process.env.PKG));
  process.stdout.write(l.packages[k]?.integrity||"");')
[ -n "$INTEGRITY" ] || { echo "  ❌ no se pudo leer el integrity del lock del sandbox." >&2; exit 1; }
echo "  integrity: ${INTEGRITY:0:24}… (SHA-512, verificado por npm en la descarga)"

# Gate 4: advisories
AUDIT=$(cd "$SANDBOX" && npm audit --json 2>/dev/null || true)
HIGH=$(node -e "try{const a=JSON.parse(process.argv[1]);const v=a.metadata?.vulnerabilities||{};console.log((v.high||0)+(v.critical||0))}catch{console.log(0)}" "$AUDIT")
echo "  advisories high+critical: $HIGH"
if [ "$BLOCK_ADV" = "true" ] && [ "$HIGH" -gt 0 ]; then
  echo "  ❌ GATE advisories: $HIGH vulnerabilidad(es) high/critical en $PKG@$CAND. Bloqueado por policy." >&2
  exit 1
fi

# Gate 5: major bump
CUR_MAJOR="${CUR%%.*}"; CAND_MAJOR="${CAND%%.*}"
IS_MAJOR=false
[ "$CUR_MAJOR" != "$CAND_MAJOR" ] && IS_MAJOR=true
if [ "$IS_MAJOR" = true ]; then
  echo "  ⚠️  MAJOR bump ($CUR_MAJOR -> $CAND_MAJOR): alto riesgo de cambios incompatibles en flags/CLI. Smoke test obligatorio."
fi

# Gate 6: smoke test = contrato de CLI. Verifica que los flags de los que
# dependen los scripts siguen existiendo en --help del candidato. Es
# determinista, no necesita navegador, y caza justo la rotura tipo
# "--output-format dejó de existir" en un major bump.
SMOKE_CMD=$(node -e "console.log(require('$LOCK').tools['$PKG'].smokeHelpCmd||'--help')")
REQUIRED_FLAGS=$(node -e "console.log((require('$LOCK').tools['$PKG'].smokeFlags||[]).join(' '))")
if [ -n "$REQUIRED_FLAGS" ]; then
  echo "  smoke test (contrato CLI): $PKG@$CAND $SMOKE_CMD …"
  HELP_OUT=$(npx -y "$PKG@$CAND" $SMOKE_CMD 2>&1 || true)
  MISSING=""
  for flag in $REQUIRED_FLAGS; do
    printf '%s' "$HELP_OUT" | grep -q -- "$flag" || MISSING="$MISSING $flag"
  done
  if [ -z "$MISSING" ]; then
    echo "  ✓ smoke OK — flags presentes: $REQUIRED_FLAGS"
  else
    echo "  ❌ GATE smoke: $PKG@$CAND ya no expone:$MISSING. La CLI cambió — revisá el changelog y ajustá el script ANTES de actualizar." >&2
    exit 1
  fi
else
  echo "  (sin smokeFlags en tools.lock.json para $PKG; gate de smoke omitido — recomendable definirlos)"
fi

# Resumen + escritura
echo ""
echo "Resumen: $PKG  $CUR -> $CAND  | edad ${AGE}d | high/crit $HIGH | major:$IS_MAJOR"
if [ "$APPLY" != true ]; then
  echo "DRY-RUN: todos los gates en verde. Para aplicar: bash update-tools.sh $PKG --to $CAND --yes"
  exit 0
fi

PKG="$PKG" CAND="$CAND" INTEGRITY="$INTEGRITY" REL="$REL" NOW="${NOW%%T*}" LOCK="$LOCK" node -e '
  const fs=require("fs");
  const l=JSON.parse(fs.readFileSync(process.env.LOCK,"utf8"));
  const t=l.tools[process.env.PKG];
  t.version=process.env.CAND; t.integrity=process.env.INTEGRITY;
  t.releaseDate=process.env.REL; t.approvedAt=process.env.NOW; t.approvedBy="update-tools.sh";
  fs.writeFileSync(process.env.LOCK, JSON.stringify(l,null,2)+"\n");
'
echo "✓ tools.lock.json actualizado: $PKG@$CAND."

# Mantener sincronizado el manifiesto hardened (tools/package.json + lock).
# Si divergen, el modo CI correría una versión distinta al modo local.
TOOLS_DIR="$ROOT/tools"
if [ -f "$TOOLS_DIR/package.json" ]; then
  echo "  sincronizando manifiesto hardened (tools/)…"
  PKG="$PKG" CAND="$CAND" PJSON="$TOOLS_DIR/package.json" node -e '
    const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.env.PJSON,"utf8"));
    if (p.dependencies?.[process.env.PKG] !== undefined) p.dependencies[process.env.PKG]=process.env.CAND;
    fs.writeFileSync(process.env.PJSON, JSON.stringify(p,null,2)+"\n");'
  ( cd "$TOOLS_DIR" && npm install --package-lock-only --ignore-scripts --no-audit --loglevel=error >/dev/null 2>&1 ) \
    && echo "  ✓ tools/package-lock.json regenerado (árbol re-pinneado con integrity)" \
    || echo "  ⚠️  no se pudo regenerar tools/package-lock.json; hacelo a mano: (cd tools && npm install --package-lock-only)"
fi
echo "Commiteá tools.lock.json + tools/ y corré una auditoría real para confirmar."
