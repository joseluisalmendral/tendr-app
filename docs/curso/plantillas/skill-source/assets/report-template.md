# Auditoría · {URL} · {fecha}

> Generada por landing-auditor. Outputs crudos en `{OUT}/`. Config aplicada: {audit.config.json | ninguna (modo descriptivo)}.

## Resumen ejecutivo

- **Performance:** {score}/100 — LCP {lcp}ms · INP {inp ?? "n/d (métrica de campo; no medible en lab)"} · TBT {tbt}ms · CLS {cls}
- **SEO:** {N} findings — indexable: {sí/NO} · metadata: {completa/incompleta}
- **GEO:** {N} findings — JSON-LD: {tipos} · crawlers IA: {permitidos/bloqueados} · llms.txt: {sí/no}
- **A11y:** {criticalCount} críticos · {seriousCount} serios · {moderateCount} moderados · {incompleteCount} requieren revisión humana
- **Motion:** {ejecutada / omitida} — {libs}/{maxLibraries} librerías · reduced-motion: {ok/faltante en N} · pins: {n}/{maxScrollPins}

## Findings priorizados

> Cada finding = problema concreto + acción recomendada + archivo/ruta cuando aplique. Ordenar por impacto real, no por capa.

### 🔴 CRÍTICO — bloquea deploy
- {acción concreta · dónde}

### 🟠 ALTO — antes de la próxima release
- {acción concreta · dónde}

### 🟡 MEDIO — próximo sprint
- {acción concreta · dónde}

### ⚪ BAJO — informativo
- {acción concreta · dónde}

## Detalle por capa

### Performance
| Métrica | Valor | Umbral | Estado |
|---|---|---|---|
| Score | {score}/100 | ≥90 | {✓/✗} |
| LCP | {lcp}ms | <2500 | {✓/✗} |
| CLS | {cls} | <0.1 | {✓/✗} |
| TBT | {tbt}ms | <200 | {✓/✗} |
| FCP / TTFB | {fcp}ms / {ttfb}ms | — | — |

INP: {inp o "no medible en laboratorio — requiere datos de campo (CrUX)"}.

Top opportunities: {id — title — savingsMs} (de `topOpportunities`).

### SEO
- Indexabilidad: meta robots `{robots}` · X-Robots-Tag `{xRobotsTag}`
- Title ({len} chars), description ({len} chars), canonical `{canonical}`
- Open Graph: {title/description/image/type presentes?} · Twitter: {card/image?}
- Sitemap: {accesible, N urls}
- Issues: {lista de `seo.json.issues`}

### GEO
- **llms.txt:** {accesible · secciones · sizeBytes · llms-full.txt?}
- **Crawlers (robots.txt):** training {GPTBot/ClaudeBot/Google-Extended/CCBot} · retrieval {OAI-SearchBot/ChatGPT-User/Claude-*/Perplexity*} — marcar BLOQUEADOS
- **JSON-LD:** {schemas con type/valid/errors; @graph soportado}
- **Headings:** h1 ×{n} · jerarquía {limpia/saltos} · directAnswerFirst {sí/no}
- **SSR:** {ssrTextBytes} bytes de texto visible sin JS

### A11y
| Impact | Count | Reglas |
|---|---|---|
| critical | {n} | {ids} |
| serious | {n} | {ids} |
| moderate | {n} | {ids} |
| minor | {n} | {ids} |

Passes: {passes}. Incompleto (revisión humana): {incomplete ids}. Por cada violation: regla, impact, nodeCount, selector(es) de muestra, helpUrl.

### Motion
> Solo si se ejecutó y hay presupuesto (`audit.config.json` → `motion`). Si no, anotar "omitida: sin presupuesto definido".

- Librerías detectadas vs permitidas: {servidas/source vs allowedLibraries}
- Easings fuera del spec: {offSpec} (drift código ↔ design system)
- prefers-reduced-motion: {coreografías sin guard}
- Scroll-pins: {pinCandidates} vs maxScrollPins — clasificar layout vs coreografía
- **Juicio del agente (heurístico):** ¿hay exactamente 1 wow? ¿el easing reservado está acotado a su uso? (ver `wowEasingUsers`, `pinCandidates`)
