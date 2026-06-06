---
name: landing-auditor
description: Audita una landing publicada en 4 capas (SEO, GEO, performance, a11y) y produce un reporte priorizado en docs/audits/.
trigger: el usuario dice "audita la landing en {url}", "auditoría completa de {url}", "haz una auditoría SEO/GEO/perf/a11y de {url}" o equivalente.
---

# landing-auditor

Skill que orquesta 4 scripts de auditoría sobre una URL pública, interpreta el output y produce un reporte markdown priorizado.

## Capas auditadas

- **Performance** (`@unlighthouse/cli` → `scripts/audit-performance.sh`). Lighthouse score, LCP, INP, CLS, top 5 oportunidades.
- **SEO** (`curl + cheerio` → `scripts/audit-seo.sh`). Title, description, canonical, Open Graph, Twitter Card, sitemap.
- **GEO** (`curl + cheerio` → `scripts/audit-geo.sh`). `llms.txt`, `robots.txt` con crawlers IA permitidos, JSON-LD schemas, jerarquía de headings.
- **A11y** (`@axe-core/cli` → `scripts/audit-a11y.sh`). Violations agrupadas por impact (critical, serious, moderate, minor).

## Workflow del agente

Cuando se detecte el trigger:

1. Extraer la URL del prompt. Validar que es http o https. Si no, pedir URL al usuario.
2. Crear directorio `OUT=/tmp/audit-$(date +%Y%m%d-%H%M%S)/`.
3. Ejecutar los 4 scripts en paralelo:
   ```bash
   bash scripts/audit-performance.sh "$URL" "$OUT" &
   bash scripts/audit-seo.sh "$URL" "$OUT" &
   bash scripts/audit-geo.sh "$URL" "$OUT" &
   bash scripts/audit-a11y.sh "$URL" "$OUT" &
   wait
   ```
4. Leer los 4 JSON resultantes (`performance.json`, `seo.json`, `geo.json`, `a11y.json`).
5. Compilar reporte markdown con la estructura definida en la sección siguiente.
6. Guardar reporte en `docs/audits/NN-YYYY-MM-DD.md` (NN correlativo).
7. Imprimir resumen ejecutivo en chat.

## Estructura del reporte

```markdown
# Auditoría · {URL} · {fecha}

## Resumen ejecutivo

- Performance: {score}/100 (LCP {lcp}ms, INP {inp}ms, CLS {cls})
- SEO: {N findings}
- GEO: {N findings}
- A11y: {criticalCount} críticos, {seriousCount} serios

## Findings priorizados

### CRÍTICO
- [acción concreta + archivo o ruta]

### ALTO
- [acción concreta]

### MEDIO
- [acción concreta]

### BAJO
- [acción concreta]

## Detalle por capa

### Performance
{tabla con métricas + top 5 opportunities}

### SEO
{issues + estado de metadata}

### GEO
{llms.txt + crawlers + JSON-LD + headings}

### A11y
{violations agrupadas por impact con count + ejemplo de nodo}
```

## Reglas de prioridad

- **CRÍTICO**: bloquea deploy a producción. Ejemplos: `robots.txt` bloquea GPTBot, JSON-LD `Product` sin `image`, a11y critical violations, LCP > 4s.
- **ALTO**: corregir antes de la siguiente release. Ejemplos: a11y serious violations, falta `llms.txt`, CLS > 0.1, og:image relativo.
- **MEDIO**: optimización del próximo sprint. Ejemplos: title >60 chars, a11y moderate, fonts no preloaded.
- **BAJO**: nota informativa. Ejemplos: a11y minor, opportunities Lighthouse < 100ms saving.

## Reglas operativas

- NO modificar código del proyecto auditado. Solo leer y reportar.
- Si un script falla, reportar error en su sección y seguir con los otros 3.
- Si la URL no responde, abortar con mensaje claro.
- Los reportes en `docs/audits/` se commitean al repo; no leakear URLs internas con tokens en QS.
- Resumen ejecutivo en chat siempre, reporte completo en archivo.

## Reusabilidad

Esta Skill funciona en cualquier proyecto que tenga `docs/audits/` (o lo crea). Diseñada para reuso en L17 (`tendr-app`) antes de su deploy.
