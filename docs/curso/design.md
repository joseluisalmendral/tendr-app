# Design System · Tendr (v2 — dirección limpia/cálida)

> Spec versionado del sistema visual. Lock para todas las fases de construcción. Cualquier desviación es bug, no creatividad.

**Versión:** 2.0. **Última actualización:** 2026-06-03. **Producto:** Tendr (landing pública).

> **Por qué v2.** La dirección v1 (wash cálido amber→clay, esquinas sharp `radius-none`) se itera hacia una dirección **más limpia y minimalista sin perder la esencia**: base cálida clara, alto contraste, un sistema de acento ink-led, redondeo suave-medio, y la firma hand-drawn + "notas vivas" conservada pero **más moderna y sparing**. Inspiración de estructura: adora.ai (lienzo limpio, un acento exclusivo para interacción, tracking apretado en display) y folk.app (CRM de relaciones: CTA en tinta + pasteles suaves de adorno). Lo que NO tomamos de adora: su violeta (ley anti-lila de Tendr), su base blanca fría, ni su grid genérico de 3 columnas. Acento validado en el **showcase** (`/showcase/design`) con auditoría WCAG 2.2 PASS (2026-06-03).

---

## 1. Voz

- Confiable, ágil, sin corporativismo.
- Sin jerga ("synergy", "leverage", "empower", "unlock").
- Frases cortas. Verbos directos. Cero adjetivos huecos.
- Sentence case en títulos. Title case prohibido.
- Cálida y humana, nunca fría ni "enterprise". Habla a un freelance/consultor B2B junior de tú a tú.

---

## 2. Tokens

Modelo de 3 capas (re-paletear = cambiar solo capa 1 · primitives):

```
LAYER 1 — PRIMITIVES (valores raw)  →  LAYER 2 — SEMANTIC  →  LAYER 3 — COMPONENT
```

### 2.1 Color

Notación: hex + oklch de referencia. AA mínimo contra el fondo en cualquier combinación texto+fondo (objetivo AA+ en body). Acento validado: surface `near-white` + combo `folk-pastel`, auditoría WCAG 2.2 de 64 pares = PASS (showcase, 2026-06-03).

| Token semántico | Valor | oklch aprox. | Rol |
|---|---|---|---|
| `--color-surface` | `#FEFEFC` | `0.994 0.001 90` aprox. | Fondo de página. **Warm-white, nunca blanco puro ni gris frío** (calidez mínima, un grado más claro que eggshell) |
| `--color-surface-raised` | `#FFFFFF` | `1 0 0` | Cards, paneles elevados |
| `--color-surface-sunken` | `#F7F6F2` | `0.972 0.004 90` aprox. | Inputs, code blocks |
| `--color-text-primary` | `#1F1B16` | `0.22 0.012 70` | Titulares y body. Warm-ink, **alto contraste** sobre surface |
| `--color-text-secondary` | `#5A5247` | `0.45 0.015 70` | Meta, labels |
| `--color-text-tertiary` | `#736B5E` | `0.52 0.012 75` aprox. | Dimmed, placeholders. Oscurecido desde `#8A8275` por SC 1.4.3 (5.21:1 vs surface). **El par más justo del sistema — no aclarar sin re-verificar AA** |
| `--color-border-hairline` | `#EEECE6` | `0.94 0.004 90` aprox. | Bordes 1px **decorativos** (estructura ligera, en vez de sombras) |
| `--color-border-strong` | `#DEDBD2` | `0.89 0.006 90` aprox. | Bordes estructurales 1-2px |
| `--color-border-interactive` | `#87837B` | `0.58 0.006 80` aprox. | **Borde de límites interactivos** (botones outline, pills, toggles). SC 1.4.11: ≥3:1 vs surface y raised (3.74:1 / 3.78:1). **No usar en hairlines decorativos** |
| `--color-accent-primary` | `#101010` | `0.20 0 0` aprox. | **CTAs, links activos, focus. Warm-ink. Uso EXCLUSIVO para lo interactivo.** Texto blanco a 19.02:1 |
| `--color-accent-fg` | `#FFFFFF` | `1 0 0` | Texto sobre acento primario (19.02:1, AAA) |
| `--color-support` | `#B23A86` | `0.52 0.18 350` aprox. | **Firma humana (wisp):** SOLO anotaciones hand-drawn (flechas/círculos/órbita/rescate) + checks. 5.4-5.5:1 vs surfaces (pasa SC 1.4.11). Texto de badge sobre tint 12% = 4.97:1 (**margen fino, documentado**) |
| `--color-support-cobalt` | `#2456A8` | `0.45 0.15 260` aprox. | **"Lo máquina" (cobalt):** todo lo IA/automatización no-textual — chip/pill ✦+texto IA, acentos de la burbuja IA, anillo de click del cursor. Stroke AA 7.0:1 vs surface. **No usar como texto plano sin grado de texto** |
| `--color-support-cobalt-fg` | `#1F4C94` | `0.41 0.15 260` aprox. | Grado de **texto** del cobalt (label "IA" del pill, texto sobre tint 12%). Más oscuro que el stroke para pasar AA en texto pequeño |
| `--color-support-cobalt-soft` | `color-mix(in oklab, var(--color-support-cobalt) 12%, var(--color-surface-raised))` | — | Tinte suave del cobalt para fondos IA (mismo patrón que `accent-soft`). **Fórmula, no hex fijo** |
| `--color-support-teal` | `#1B7163` | `0.50 0.07 185` aprox. | **"Progreso" (teal):** rails, dots de status/timeline, stage chips, drop targets, spotlight, numerales de viaje 01/02/03, conectores del viaje, dot indicador. Stroke AA 5.79:1 vs `#FEFEFC` / 5.85:1 vs `#FFFFFF`. **REGLA DURA: nunca carga semántica success/OK** (success green `#356E48` es el único verde de estado) |
| `--color-support-teal-fg` | `#15604F` | `0.44 0.07 175` aprox. | Grado de **texto** del teal (numerales, dots con texto). 7.38:1 sobre near-white |
| `--color-support-teal-soft` | `color-mix(in oklab, var(--color-support-teal) 12%, var(--color-surface-raised))` | — | Tinte suave del teal para fondos de progreso (mismo patrón que `accent-soft`). **Fórmula, no hex fijo** |
| `--color-highlight` | `#FFF8BB` | `0.97 0.06 100` aprox. | **EXCLUSIVAMENTE fondo de texto:** subrayador `Mark` (ink encima 15.82:1) y pills tipo "Recomendado". **REGLA DURA: nunca como elemento no-textual** (dot/borde/stripe) — sobre near-white da 1.08:1, invisible |
| `--color-highlight-fg` | `#7A6A10` | `0.50 0.11 100` aprox. | Texto sobre tint de highlight (pill "Recomendado", 5.32:1) |
| `--color-accent-soft` | `color-mix(in oklab, var(--color-support) 12%, var(--color-surface-raised))` | — | Lavado suave del support para fondos decorativos (badges, washes). **Fórmula, no hex fijo** |
| `--color-handdrawn` | `var(--color-support)` | — | Color de las anotaciones hand-drawn (flechas, círculos) = rol support (`#B23A86`) |
| `--color-success` | `#3E7D52` | `0.55 0.10 150` | Estados OK. El primario es ink, no hay clash de hue |
| `--color-danger` | `#B3402E` | `0.52 0.16 30` | Errores, destructivos (rojo cálido) |
| `--color-warning` | `#B5832E` | `0.62 0.11 75` | Caution (uso mínimo; ocre, no el amber-wash de v1) |
| `--color-focus` | `var(--color-accent-primary)` | — | Ring de foco = acento primario (ink) |

**Regla de oro de color (ink-led, validada en showcase):** lo **interactivo es tinta** (`--color-accent-primary` #101010: CTAs, links, focus). El **color** aparece solo en dos roles acotados: `--color-support` (firma — anotaciones, checks, dots, strokes) y `--color-highlight` (optimismo — solo como fondo de texto: subrayado y pills). Superficie warm-white + hairlines hacen el resto. Contrato de tres roles:

- **primary = acción** (ink, interactivo: CTA, link, focus).
- **support = firma** (humanidad: hand-drawn, checks; nunca texto largo).
- **highlight = optimismo** (subrayado/pill; **solo fondo de texto**, jamás elemento no-textual).

**Familia de apoyo "Folk Twins" (linaje: el trío folk profundizado).** El antiguo `support` cubría tres trabajos a la vez (firma + máquina + progreso). En B2-fix-1 se reparte el rol en **una familia de tres matices** que comparten la disciplina "el color vive solo en micro-UI no-textual de firma", pero cada matiz tiene un trabajo:

- **wisp (`--color-support` #B23A86) = firma.** SOLO anotaciones hand-drawn (flecha/círculo/órbita/rescate) y checks. El token `--color-handdrawn` sigue apuntando aquí, sin cambios.
- **cobalt (`--color-support-cobalt` #2456A8) = "lo máquina".** Todo lo IA/automatización: chip/pill ✦+texto IA, acentos de la burbuja IA, anillo de click del cursor. Stroke 7.0:1; texto vía `--color-support-cobalt-fg` #1F4C94; tinte `--color-support-cobalt-soft`.
- **teal (`--color-support-teal` #1B7163) = "progreso".** Rails, dots de status/timeline, stage chips, drop targets, spotlight tints, numerales 01/02/03, conectores del viaje, dot indicador. Stroke 5.79:1 vs `#FEFEFC` / 5.85:1 vs `#FFFFFF`; texto vía `--color-support-teal-fg` #15604F (7.38:1 sobre near-white); tinte `--color-support-teal-soft`. **Linaje:** teal era el runner-up del workshop de color; en B3-fix-1 absorbe el rol de progreso que antes llevaba ochre (retirado por proximidad a `--color-warning`).

**Regla de rotación (monogramas/chips + secuencias).** Los monogramas y chips de cliente (tríptico del hero, viaje, y donde aparezcan) rotan los tres matices por índice: `index % 3` → wisp, cobalt, teal. Un mismo cliente puede llevar matiz distinto según su posición, pero el rol de cada matiz (firma/máquina/progreso) manda sobre la rotación cuando el elemento ES uno de esos roles.

  **Cláusula de alternancia en secuencias (B3-fix-1).** Cuando hay un **run de 2+ hermanos decorativos idénticos** (los 2 conectores del viaje, los numerales 01/02/03, los runs de dots de timeline/actividad, el indicador de acto si aplica, los monogramas — que ya rotan), alternan **teal→wisp→cobalt por índice** para que el mismo matiz no se repita en posiciones adyacentes. Los roles a NIVEL DE BLOQUE se mantienen (un rail sigue siendo progreso=teal); la alternancia aplica SÓLO a runs secuenciales de 2+ hermanos decorativos idénticos. Excepción documentada: el indicador de acto 01·02·03 del hero NO alterna porque sólo hay un dot visible a la vez (los otros van a `opacity:0`), así que no existe run adyacente; el dot activo conserva progreso=teal.

**REGLA DURA (negativa).** **teal NUNCA carga semántica success/OK.** El verde de estado es exclusivamente success green `#356E48`; teal es un matiz ~175-190 (más azul y más oscuro). Mantener la frontera para no romper la lectura semántica de "completado/cobrado". El subrayador buttermilk (`--color-highlight`) sigue igual, sin tocar.

### 2.2 Tipografía

| Rol | Familia | Pesos | Origen | Notas |
|---|---|---|---|---|
| Display | **Bricolage Grotesque** | 600, 700 | Google Fonts vía `next/font` | Grotesca con carácter, contemporánea. Validada en showcase; swappable |
| Body / UI | **Plus Jakarta Sans** | 400, 500, 600 | Google Fonts vía `next/font` | Limpia, geométrica, legible |
| Mono | **Geist Mono** | 400, 500 | Google Fonts vía `next/font` | Numerales `01/02/03`, etiquetas meta |

Restricciones tipográficas:
- Ninguna fuente con licencia comercial restrictiva. **Inter prohibido** (overused en SaaS 2026, debilita carácter).
- Tracking apretado **solo en display/headings** (`-0.02em`). En body, tracking normal (`0` a `-0.005em`) para no perder legibilidad.

### 2.3 Escala tipográfica

Base 16px. Ratio 1.25 (subir a 1.333 si el display pide más drama).

| Nivel | Tamaño | Line-height | Letter-spacing |
|---|---|---|---|
| `display-xl` | 64–72px (clamp) | 1.05 | -0.02em |
| `display-lg` | 48–56px | 1.08 | -0.02em |
| `h1` | 38px | 1.1 | -0.02em |
| `h2` | 30px | 1.15 | -0.015em |
| `h3` | 22px | 1.2 | -0.01em |
| `body-lg` | 20px | 1.55 | 0 |
| `body` | 17px | 1.6 | 0 |
| `body-sm` | 15px | 1.5 | 0 |
| `caption` | 13px | 1.4 | 0.01em |

### 2.4 Espacio

Base 4pt. Densidad "comfortable" con whitespace generoso entre secciones.

| Token | Valor | Token | Valor |
|---|---|---|---|
| `space-1` | 4px | `space-8` | 32px |
| `space-2` | 8px | `space-12` | 48px |
| `space-3` | 12px | `space-16` | 64px |
| `space-4` | 16px | `space-24` | 96px |
| `space-6` | 24px | `space-32` | 128px |

Section gap mínimo: `space-16` (64px). Card padding: `space-6`–`space-8`.

### 2.5 Radii (suave-medio — el cambio clave vs v1)

| Token | Valor | Uso |
|---|---|---|
| `radius-sm` | 8px | Inputs, small buttons, badges pequeños |
| `radius-md` | 12px | Botones, controles |
| `radius-lg` | 16px | Cards, dialogs |
| `radius-xl` | 20px | Hero blocks, superficies grandes |
| `radius-full` | 9999px | Pills, avatars |

> v1 era `radius-none` (sharp/editorial). v2 pasa a **suave-medio**: limpia y amable, sin irse al 26px muy redondeado de adora. Punto medio.

### 2.6 Sombras (base plana; sombra reservada como firma)

| Token | Valor | Uso |
|---|---|---|
| `shadow-flat` | `none` | Base: cards limpias con **hairline border**, sin sombra (estética limpia) |
| `shadow-soft` | `0 1px 2px rgba(31,27,22,.06), 0 2px 8px rgba(31,27,22,.09)` | Hover sutil, popovers. Opacidades subidas (.06/.09) para legibilidad de cards sobre near-white |
| `shadow-note` | `0 6px 18px rgba(31,27,22,.10)` | **Exclusivo de las "notas vivas"** (cards de papel con leve rotación). Es la firma; no se usa en el resto |

### 2.7 Movimiento

| Token | Valor | Uso |
|---|---|---|
| `duration-fast` | 150ms | Hover, micro-interactions |
| `duration-base` | 250ms | Transitions de UI |
| `duration-slow` | 400ms | Reveals on scroll |
| `easing-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | Default |
| `easing-emphasis` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Reveals |
| `easing-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` | El wow con scroll-pin (Hero→"Cómo funciona") y los reveals de transición (page-peel) |
| `ease-snap` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Overshoot de resorte: FLIP de Pricing, press de la mano del tablero, pops de micro-UI (settle/pop). El único easing con overshoot del sistema; reservado para elementos que "encajan en su sitio" |

Tope de 3 librerías de animación: **Motion (`motion/react`) + CSS scroll-driven nativo + Lenis**. Reduced-motion: estado final estático en cada coreografía.

**Focus ring (SC 2.4.13):** patrón offset sólido `0 0 0 2px var(--color-surface-raised), 0 0 0 4px var(--color-accent-primary)` (gap interno de 2px en surface-raised + anillo de 2px en acento, ≥3:1 vs adyacente).

---

## 3. Componentes destacados

- **Botón primario:** fondo `--color-accent-primary` (#101010 ink), texto `--color-accent-fg` (#FFFFFF, 19.02:1), `radius-md` (12px), padding cómodo. El único elemento sólido de acción.
- **Botón ghost / outline:** transparente, texto `--color-text-primary`, border `--color-border-interactive` 1px (≥3:1, SC 1.4.11), `radius-md`.
- **Card limpia:** `--color-surface-raised`, `radius-lg` (16px), `shadow-flat` + hairline border. Plana y limpia (base del sistema).
- **Nota viva (firma):** card de papel, `--color-surface-raised`, leve rotación ±1°, `shadow-note`, opcional chincheta SVG. Muestra **faux-UI real del CRM** dentro (mini-kanban, card de cliente, toast). Los dots de columna usan `--color-support`. NUNCA grid genérico de iconos. Es la identidad de Tendr.
- **Badge:** pill (`radius-full`), texto `--color-support-fg` sobre fondo tint del support al 12% (`color-mix(in oklab, var(--color-support) 12%, var(--color-surface-raised))`, 4.97:1).
- **Pill "Recomendado":** texto `--color-highlight-fg` (#7A6A10) sobre tint de highlight al 18% (5.32:1). El único uso de highlight además del subrayado.
- **Subrayador (`Mark`):** fondo `--color-highlight` (#FFF8BB) con texto ink encima (15.82:1). Solo fondo de texto.
- **Anotación hand-drawn (firma, moderna):** flecha/círculo/subrayado SVG `stroke` en `--color-handdrawn` (= support #B23A86), `stroke-linecap: round`. **Más limpia que v1: menos jitter, trazo más geométrico, 1-2 por sección como acento.** Hand-made, pero moderno.

---

## 4. Animaciones recurrentes

| Patrón | Descripción | Duración | Easing | Trigger | Librería |
|---|---|---|---|---|---|
| Reveal on scroll | Fade+rise de secciones | 400ms | emphasis | whileInView once | Motion |
| Hand-drawn draw-in | `stroke-dashoffset` de flechas/círculos | ~600ms | standard | in-view once | CSS/Motion |
| Wow Hero→Cómo funciona | Sticky overlap (el único wow con scroll-pin) | scroll | expo | scroll-driven + Lenis | CSS scroll-driven + Lenis |
| Page-peel Funciones→Pricing | Reveal de transición (transform-only, sin pin) | scroll | expo | view-timeline | CSS scroll-driven + Lenis |
| Hover lift nota viva | Leve scale + shadow-soft | 150ms | standard | hover | Motion/CSS |
| FLIP recomendador pricing | Flecha/tag salta al tier | ~400ms | emphasis | toggle | Motion layout |

---

## 5. Principios

- Jerarquía con **peso tipográfico y tamaño de display**, no con color.
- **Whitespace generoso** entre secciones (mínimo `space-16`).
- **Lo interactivo es tinta; el color vive solo en firma (support) y subrayado (highlight).** Tres roles acotados, nunca un acento difuso.
- **Base siempre cálida** (warm-white near-white), alto contraste de texto (AA+).
- **Hand-drawn + notas vivas como firma**, usadas con disciplina (sparing) y en versión moderna (trazo limpio).
- Mostrar el producto con **faux-UI**, no describirlo con iconos.
- Motion sutil: **un único wow con scroll-pin** (Hero→"Cómo funciona") como pico de la página. Los **reveals de transición** (page-peel Funciones→Pricing) se permiten como recursos de costura entre secciones: son transform-only, no fijan (`pin`) ni secuestran el scroll, y nunca compiten con el wow. La regla es no acumular wows ni añadir más scroll-pins.
- Bordes hairline para estructura; sombra solo en las notas vivas.

---

## 6. Restricciones (negative instructions)

- **No lila / violeta / AI-purple.** **Motivo:** cliché de SaaS IA 2026; Tendr es cálido y humano.
- **No base blanca fría ni gris frío.** **Motivo:** mata la calidez que es esencia de Tendr.
- **No Inter.** **Motivo:** overused en SaaS landings 2026, debilita carácter.
- **No grid de 3 columnas de features con icono arriba.** **Motivo:** patrón saturado, lectura de tutorial; Tendr usa bento "notas vivas".
- **No `radius-none` (sharp total).** **Motivo:** v2 va a suave-medio para limpiar y dar amabilidad.
- **No sombras pesadas por todos lados.** **Motivo:** base plana + hairlines = limpio; la sombra se reserva como firma de las notas vivas.
- **No gradiente sobre el texto del hero.** **Motivo:** baja AA y se ve generado por IA.
- **No tracking apretado en el body.** **Motivo:** perjudica legibilidad; el tracking apretado es solo para display.
- **No usar `--color-highlight` en elementos no textuales** (dots, bordes, stripes). **Motivo:** sobre near-white da 1.08:1, invisible; highlight es exclusivamente fondo de texto.
- **No aclarar `--color-text-tertiary` ni oscurecer la surface sin re-verificar AA.** **Motivo:** el par tertiary/surface tiene margen +0.71 sobre el umbral (5.21:1); cualquier cambio puede romper SC 1.4.3.

---

## 7. Sugerencias premium (catálogo 2026)

Patrones de **referencia que se re-implementan en Motion**, nunca dependencias instaladas. Máx. 3 librerías de animación reales (Motion + CSS scroll-driven + Lenis).

| Patrón de referencia | De dónde | Qué aporta | Dónde en Tendr |
|---|---|---|---|
| Sticky overlap inter-sección | Motion Primitives / scroll-driven | El único wow con scroll-pin | Hero → Cómo funciona |
| Page-peel inter-sección | scroll-driven (view-timeline) | Reveal de transición (sin pin) | Funciones → Pricing |
| Drag físico de cards | Motion (`drag`, `useMotionValue`) | "Tú organizas tus clientes" | Bento Features (notas vivas) |
| Reveal escalonado | Motion `whileInView` | Entrada editorial | Cómo funciona, secciones |
| Draw-in de trazo a mano | CSS `stroke-dashoffset` | Firma hand-drawn moderna | Anotaciones por sección |

---

## 8. Cómo validar este `design.md`

- [ ] Lighthouse Performance ≥ 95 en mobile.
- [ ] CLS < 0.1 en producción.
- [x] Accesibilidad AA (AA+ en body) en todos los componentes; contraste verificado tras fijar el acento. **Auditoría de 64 pares en showcase `/showcase/design`, WCAG 2.2 PASS (2026-06-03).**
- [ ] Tokens al 100% (cero hex hardcoded en componentes; todo vía `--color-*`).
- [ ] Ningún patrón de la sección Restricciones presente en código (ni lila, ni Inter, ni grid 3-col, ni base fría, ni radius-none).
- [ ] Acento usado **solo** según contrato de roles (primary interactivo, support firma, highlight fondo de texto).

---

## 9. Referencias

- **adora.ai** — destilado: lienzo limpio, **un acento exclusivo para interacción**, tracking apretado en display, radios suaves, plano con hairlines. **NO tomado:** su violeta (ley anti-lila), su base blanca fría, su grid de 3 columnas.
- **folk.app** — destilado: CRM de relaciones con **CTA en tinta (#101010) + pasteles suaves de adorno** (rosa firma + buttermilk subrayado). La base del sistema ink-led validado.
- **amplemarket.com** — destilado: **captura de email en el hero** + screenshot de producto prominente sobre lienzo limpio cálido.
- **geniestudio.app** — destilado: **aire y delight de motion** (elementos flotando, micro-motion). **NO tomado:** sus mascotas ilustradas (identidad ajena, choca con CRM profesional).

---

## 10. Quick start

### CSS Custom Properties

```css
:root {
  /* Surfaces — preset near-white (warm-white, nunca blanco puro) */
  --color-surface:           #FEFEFC;
  --color-surface-raised:    #FFFFFF;
  --color-surface-sunken:    #F7F6F2;
  /* Text */
  --color-text-primary:      #1F1B16;
  --color-text-secondary:    #5A5247;
  --color-text-tertiary:     #736B5E; /* SC 1.4.3: no aclarar sin re-verificar */
  /* Borders */
  --color-border-hairline:   #EEECE6; /* decorativo */
  --color-border-strong:     #DEDBD2;
  --color-border-interactive:#87837B; /* SC 1.4.11: ≥3:1, solo límites interactivos */
  /* Accent system — combo folk-pastel (ink-led + pasteles) */
  --color-accent-primary:    #101010; /* interactivo: CTA, link, focus */
  --color-accent-fg:         #FFFFFF; /* 19.02:1 */
  --color-support:           #B23A86; /* wisp = firma: hand-drawn, checks */
  --color-support-fg:        #B23A86; /* texto de badge sobre tint 12% (4.97:1) */
  /* Folk Twins — familia de apoyo (B2-fix-1; B3-fix-1 teal): wisp(firma) → cobalt(máquina) → teal(progreso) */
  --color-support-cobalt:    #2456A8; /* "lo máquina": IA/automatización (stroke 7.0:1) */
  --color-support-cobalt-fg: #1F4C94; /* grado de texto del cobalt (label IA) */
  --color-support-cobalt-soft: color-mix(in oklab, var(--color-support-cobalt) 12%, var(--color-surface-raised));
  --color-support-teal:      #1B7163; /* "progreso": rails/dots/chips/numerales/conectores (stroke 5.79:1) · NUNCA success/OK */
  --color-support-teal-fg:   #15604F; /* grado de texto del teal (7.38:1 sobre near-white) */
  --color-support-teal-soft: color-mix(in oklab, var(--color-support-teal) 12%, var(--color-surface-raised));
  --color-highlight:         #FFF8BB; /* SOLO fondo de texto (Mark, pills) */
  --color-highlight-fg:      #7A6A10; /* texto sobre tint de highlight (5.32:1) */
  --color-accent-soft:       color-mix(in oklab, var(--color-support) 12%, var(--color-surface-raised));
  --color-handdrawn:         var(--color-support);
  --color-success:           #3E7D52;
  --color-danger:            #B3402E;
  --color-warning:           #B5832E;
  --color-focus:             var(--color-accent-primary);
  /* Radii */
  --radius-sm: 8px;  --radius-md: 12px;  --radius-lg: 16px;  --radius-xl: 20px;  --radius-full: 9999px;
  /* Shadows */
  --shadow-flat: none;
  --shadow-soft: 0 1px 2px rgba(31,27,22,.06), 0 2px 8px rgba(31,27,22,.09);
  --shadow-note: 0 6px 18px rgba(31,27,22,.10);
}
```

### Tailwind v4

```css
@theme {
  --color-surface: #FEFEFC;
  --color-surface-raised: #FFFFFF;
  --color-surface-sunken: #F7F6F2;
  --color-text-primary: #1F1B16;
  --color-text-secondary: #5A5247;
  --color-text-tertiary: #736B5E;
  --color-border-hairline: #EEECE6;
  --color-border-strong: #DEDBD2;
  --color-border-interactive: #87837B;
  --color-accent-primary: #101010;
  --color-accent-fg: #FFFFFF;
  --color-support: #B23A86;
  --color-support-fg: #B23A86;
  --color-support-cobalt: #2456A8;
  --color-support-cobalt-fg: #1F4C94;
  --color-support-cobalt-soft: color-mix(in oklab, var(--color-support-cobalt) 12%, var(--color-surface-raised));
  --color-support-teal: #1B7163;
  --color-support-teal-fg: #15604F;
  --color-support-teal-soft: color-mix(in oklab, var(--color-support-teal) 12%, var(--color-surface-raised));
  --color-highlight: #FFF8BB;
  --color-highlight-fg: #7A6A10;
  --color-handdrawn: #B23A86;
  --color-success: #3E7D52;
  --color-danger: #B3402E;
  --color-warning: #B5832E;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --font-display: "Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif;
  --font-body: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, monospace;
}
```

> `--color-accent-soft` se deriva por `color-mix` (fórmula, no hex fijo); en `@theme` se aplica donde se use, no como token estático.

---

*Spec vivo. Cambios significativos requieren commit con prefijo `docs(design): ...` y bump de versión en cabecera. El acento quedó fijado tras el showcase (2026-06-03).*
