#!/usr/bin/env bash
# Bootstrap docs/curso/ desde el curriculum del programa para L17 (tendr-app).
#
# Dos modos automáticos según desde dónde se ejecute:
#
# 1) Primera vez, desde la raíz del repo del proyecto (tendr-app/):
#      bash "/ruta/al/curriculum/guias/modulo-5/leccion-17/bootstrap-docs-curso.sh"
#
#    El script detecta CURRICULUM desde su propia ubicación, se auto-copia a
#    scripts/bootstrap-docs-curso.sh, crea .env.local con la variable y asegura
#    que .env.local está en .gitignore. Después copia los assets a docs/curso/.
#
# 2) Refrescos posteriores (cuando el sénior actualice plantillas):
#      bash scripts/bootstrap-docs-curso.sh
#
#    El script carga CURRICULUM desde .env.local y re-copia los assets.
#
# Es idempotente en ambos modos.

set -euo pipefail

LESSON_NUM="17"
SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(dirname "$SCRIPT_PATH")"

# ─── Detectar modo: curriculum vs proyecto ─────────────────────────────────────
# Si el script vive junto a _planificacion/plan.md, está en el curriculum.
if [ -f "$SCRIPT_DIR/_planificacion/plan.md" ]; then
  MODE="install"
  CURRICULUM="$(cd "$SCRIPT_DIR/../../.." && pwd)"
else
  MODE="refresh"
  # Cargar .env.local del proyecto si existe (para definir CURRICULUM).
  if [ -f .env.local ]; then
    set -a
    # shellcheck disable=SC1091
    source .env.local
    set +a
  fi
fi

# ─── Validaciones ──────────────────────────────────────────────────────────────
if [ -z "${CURRICULUM:-}" ]; then
  echo "ERROR: variable CURRICULUM no definida."
  echo
  echo "Si es la primera vez, ejecuta el script desde el curriculum:"
  echo '  bash "/ruta/absoluta/al/curriculum/guias/modulo-5/leccion-17/bootstrap-docs-curso.sh"'
  echo
  echo "Si ya está instalado en scripts/, asegúrate de que .env.local contiene:"
  echo '  CURRICULUM="/ruta/absoluta/al/curriculum"'
  exit 1
fi

if [ ! -d "$CURRICULUM" ]; then
  echo "ERROR: CURRICULUM apunta a una carpeta inexistente:"
  echo "  $CURRICULUM"
  exit 1
fi

if [ ! -d "$CURRICULUM/guias/modulo-5/leccion-$LESSON_NUM" ]; then
  echo "ERROR: $CURRICULUM no parece el repo del programa."
  echo "Falta guias/modulo-5/leccion-$LESSON_NUM/."
  exit 1
fi

# ─── Modo install: auto-copia + .env.local + .gitignore ────────────────────────
if [ "$MODE" = "install" ]; then
  echo "Primera vez. Instalando en el repo del proyecto ($PWD)..."
  echo

  # Copiar el script a scripts/
  mkdir -p scripts
  cp "$SCRIPT_PATH" scripts/bootstrap-docs-curso.sh
  chmod +x scripts/bootstrap-docs-curso.sh
  echo "  ✓ scripts/bootstrap-docs-curso.sh instalado"

  # Asegurar CURRICULUM en .env.local (sin sobrescribir otras vars)
  if [ -f .env.local ] && grep -q '^CURRICULUM=' .env.local; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^CURRICULUM=.*|CURRICULUM=\"$CURRICULUM\"|" .env.local
    else
      sed -i "s|^CURRICULUM=.*|CURRICULUM=\"$CURRICULUM\"|" .env.local
    fi
    echo "  ✓ CURRICULUM actualizada en .env.local"
  else
    {
      echo ""
      echo "# Ruta absoluta al clon local del repo del programa (curriculum)."
      echo "# Usada por scripts/bootstrap-docs-curso.sh. No se commitea."
      echo "CURRICULUM=\"$CURRICULUM\""
    } >> .env.local
    echo "  ✓ CURRICULUM añadida a .env.local"
  fi

  # Asegurar .env.local en .gitignore
  if [ ! -f .gitignore ] || ! grep -qxF '.env.local' .gitignore; then
    echo ".env.local" >> .gitignore
    echo "  ✓ .env.local añadido a .gitignore"
  fi

  echo
fi

# ─── Bootstrap: copiar assets a docs/curso/ ────────────────────────────────────
echo "Copiando material del módulo desde:"
echo "  $CURRICULUM"
echo

mkdir -p docs/curso/{operacion,tecnico,plantillas,ejemplos,snippets}

# Lección
cp "$CURRICULUM/guias/modulo-5/leccion-17/brief.md"                docs/curso/brief.md
cp "$CURRICULUM/guias/modulo-5/leccion-17/_planificacion/plan.md"  docs/curso/plan.md

# Operación y técnico compartidos
cp "$CURRICULUM/guias/modulo-5/_compartido/operacion/produccion-del-curso.md" docs/curso/operacion/
cp "$CURRICULUM/guias/modulo-5/_compartido/tecnico/preguntas-compartidas.md"  docs/curso/tecnico/

# Design system heredado de L16 (dirección v2 limpia/cálida). F9 valida contra docs/curso/design.md.
cp "$CURRICULUM/guias/modulo-5/leccion-16/_rediseno-v2/design-md-tendr.md"    docs/curso/design.md

# Plantillas (incluye product.md heredado de L16 + plantillas propias de L17)
cp "$CURRICULUM/guias/modulo-5/leccion-16/fases/F1-stack-y-scaffolding/recursos/plantillas/product.md"           docs/curso/plantillas/
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F1-jtbd-spec-mvp/recursos/plantillas/jtbd-template.md"           docs/curso/plantillas/
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F1-jtbd-spec-mvp/recursos/plantillas/spec-mvp-template.md"       docs/curso/plantillas/
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F1-jtbd-spec-mvp/recursos/plantillas/tasks-template.md"          docs/curso/plantillas/
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F2-arquitectura-y-stack/recursos/plantillas/adr-template.md"     docs/curso/plantillas/
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F2-arquitectura-y-stack/recursos/plantillas/adr-001-architecture.md" docs/curso/plantillas/
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F3-scaffolding-modelo-datos-rls/recursos/plantillas/migracion-001.sql" docs/curso/plantillas/
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F7-plantillas-byo-key-observabilidad/recursos/plantillas/byo-key-ui.tsx" docs/curso/plantillas/
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F8-pagos-stripe-sandbox/recursos/plantillas/checkout-flow.tsx"   docs/curso/plantillas/
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F10-cicd-observabilidad-deploy/recursos/plantillas/github-actions-ci.yml" docs/curso/plantillas/
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F10-cicd-observabilidad-deploy/recursos/plantillas/adr-reabierto-template.md" docs/curso/plantillas/

# Skill landing-auditor COMPLETA (versión terminada: scripts de SEO/GEO/performance/a11y/motion
# + helper _lib + herramientas pineadas en tools/), reusada en F9 para auditar las páginas
# públicas. Se copia la completa, NO la semilla parcial de L16, para que tengas todos los
# scripts y elijas qué capas correr en cada invocación.
SKILL_SRC="$CURRICULUM/guias/modulo-5/leccion-17/fases/F9-qa-e2e-visual/recursos/plantillas/skill-source"
if [ -d "$SKILL_SRC" ]; then
  rm -rf docs/curso/plantillas/skill-source
  cp -R "$SKILL_SRC" docs/curso/plantillas/
  echo "  ✓ skill landing-auditor copiada a docs/curso/plantillas/skill-source"
else
  echo "  AVISO: no se encontró skill-source en $SKILL_SRC; se omite la copia."
fi

# Ejemplos (ReadStack como referencia para JTBD + spec MVP)
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F1-jtbd-spec-mvp/recursos/ejemplos/jtbd-ejemplo.md" docs/curso/ejemplos/
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F1-jtbd-spec-mvp/recursos/ejemplos/spec-ejemplo.md" docs/curso/ejemplos/

# Snippets (schema + RLS + auth + realtime + storage + jobs + stripe + qa + observabilidad)
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F3-scaffolding-modelo-datos-rls/recursos/snippets/schema-tables.sql"           docs/curso/snippets/
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F3-scaffolding-modelo-datos-rls/recursos/snippets/rls-policies.sql"            docs/curso/snippets/
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F4-auth-anonimo-a-autenticado/recursos/snippets/auth-flow.ts"                  docs/curso/snippets/
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F4-auth-anonimo-a-autenticado/recursos/snippets/rls-anonymous.sql"             docs/curso/snippets/
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F5-workspace-core-kanban/recursos/snippets/kanban-board.tsx"                   docs/curso/snippets/
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F5-workspace-core-kanban/recursos/snippets/realtime-subscription.ts"          docs/curso/snippets/
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F6-documentos-storage-ai-extractor/recursos/snippets/inngest-job-extractor.ts" docs/curso/snippets/
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F6-documentos-storage-ai-extractor/recursos/snippets/storage-upload.ts"        docs/curso/snippets/
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F7-plantillas-byo-key-observabilidad/recursos/snippets/envelope-encryption.ts" docs/curso/snippets/
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F7-plantillas-byo-key-observabilidad/recursos/snippets/provider-manifest.ts"   docs/curso/snippets/
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F7-plantillas-byo-key-observabilidad/recursos/snippets/cost-budget.ts"         docs/curso/snippets/
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F8-pagos-stripe-sandbox/recursos/snippets/stripe-webhook.ts"                   docs/curso/snippets/
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F8-pagos-stripe-sandbox/recursos/snippets/idempotency-table.sql"               docs/curso/snippets/
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F9-qa-e2e-visual/recursos/snippets/a11y-checks.ts"                             docs/curso/snippets/
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F9-qa-e2e-visual/recursos/snippets/e2e-flow-critico.spec.ts"                   docs/curso/snippets/
cp "$CURRICULUM/guias/modulo-5/leccion-17/fases/F10-cicd-observabilidad-deploy/recursos/snippets/posthog-flag.ts"             docs/curso/snippets/

echo "✓ docs/curso/ listo."
echo

if [ "$MODE" = "install" ]; then
  echo "Siguiente paso: primer commit + tag clase-0."
  echo "  git add scripts/ docs/curso/ .gitignore"
  echo "  git commit -m 'docs(curso): bootstrap inicial desde modulo 5/L17'"
  echo "  git tag clase-0 && git push origin main --tags"
  echo "  gh release create clase-0 --title 'Clase 0 · Bootstrap del workspace' \\"
  echo "    --notes 'Workspace listo: scripts/bootstrap-docs-curso.sh + docs/curso/ poblado.'"
else
  echo "Siguiente paso: commit del refresh."
  echo "  git add docs/curso/"
  echo "  git commit -m 'docs(curso): sync con modulo 5/L17'"
fi
