#!/usr/bin/env bash
# scripts/_lib/tool-spec.sh
# Helper sourceado por los scripts de auditoría. Resuelve CÓMO invocar una
# herramienta pinneada, desde tools.lock.json (única fuente de verdad).
#
# Dos modos sobre el mismo pin:
#   - PORTABLE (default, local): `npx -y pkg@version`. Cero instalación,
#     copiá la carpeta y funciona. Pinea la versión top-level.
#   - HARDENED (CI / opt-in): binario de tools/node_modules instalado con
#     `npm ci` contra tools/package-lock.json → npm verifica el SHA-512 de
#     TODO el árbol transitivo (763 paquetes). Reproducible y offline.
#
# Se activa hardened si: AUDIT_HARDENED=1, o CI=true (lo setean todos los
# proveedores de CI). Forzar portable con AUDIT_HARDENED=0.
#
# Uso:
#   source "$(dirname "$0")/_lib/tool-spec.sh"
#   resolve_tool "@axe-core/cli" || exit 1   # set-ea el array global TOOL_CMD
#   "${TOOL_CMD[@]}" "$URL" --dir ...         # invoca igual en ambos modos
#
# tool_spec sigue disponible para quien solo quiera "pkg@version".

SKILL_ROOT="${SKILL_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
TOOL_LOCK="${TOOL_LOCK:-$SKILL_ROOT/tools.lock.json}"
TOOLS_DIR="$SKILL_ROOT/tools"

# ¿Modo hardened? AUDIT_HARDENED gana; si no, autodetecta CI.
_hardened() {
  case "${AUDIT_HARDENED:-}" in
    1|true|yes) return 0 ;;
    0|false|no) return 1 ;;
  esac
  [ -n "${CI:-}" ]
}

tool_spec() {
  local name="${1:?tool_spec necesita el nombre del paquete}"
  [ -f "$TOOL_LOCK" ] || { echo "tools.lock.json no encontrado en $TOOL_LOCK" >&2; return 1; }
  NAME="$name" LOCK="$TOOL_LOCK" node -e '
    const t = require(process.env.LOCK).tools?.[process.env.NAME];
    if (!t?.version) { console.error("tool no pinneado: " + process.env.NAME); process.exit(1); }
    process.stdout.write(process.env.NAME + "@" + t.version);
  '
}

# Asegura tools/node_modules vía `npm ci` (verifica integrity del árbol).
# Idempotente: si ya está, no reinstala. Devuelve 1 si no se puede endurecer.
_ensure_hardened_install() {
  [ -f "$TOOLS_DIR/package-lock.json" ] || { echo "hardened pedido pero falta tools/package-lock.json" >&2; return 1; }
  if [ ! -d "$TOOLS_DIR/node_modules" ]; then
    echo "hardened: instalando árbol verificado con npm ci (una vez)…" >&2
    ( cd "$TOOLS_DIR" && npm ci --no-audit --loglevel=error >/dev/null 2>&1 ) \
      || { echo "npm ci falló: integrity mismatch o entorno sin red." >&2; return 1; }
  fi
  return 0
}

# Set-ea el array global TOOL_CMD con el prefijo de invocación.
resolve_tool() {
  local name="${1:?resolve_tool necesita el nombre del paquete}"
  local spec bin
  spec="$(tool_spec "$name")" || return 1
  if _hardened; then
    bin="$(NAME="$name" LOCK="$TOOL_LOCK" node -e 'process.stdout.write(require(process.env.LOCK).tools[process.env.NAME].bin||"")')"
    if [ -n "$bin" ] && _ensure_hardened_install && [ -x "$TOOLS_DIR/node_modules/.bin/$bin" ]; then
      TOOL_CMD=("$TOOLS_DIR/node_modules/.bin/$bin")
      return 0
    fi
    echo "hardened no disponible para $name; cayendo a npx (version-pin)." >&2
  fi
  TOOL_CMD=(npx -y "$spec")
}
