# Design System · Tendr (v2 — dirección limpia/cálida)

> Spec versionado del sistema visual. Lock para todas las fases de construcción. Cualquier desviación es bug, no creatividad.

**Versión:** 2.0. **Última actualización:** TODO. **Producto:** Tendr (landing pública).

> **Por qué v2.** La dirección v1 (wash cálido amber→clay, esquinas sharp `radius-none`) se itera hacia una dirección **más limpia y minimalista sin perder la esencia**: base cálida clara, alto contraste, un solo acento, redondeo suave-medio, y la firma hand-drawn + "notas vivas" conservada pero **más moderna y sparing**. Inspiración de estructura: adora.ai (lienzo limpio, un acento exclusivo para interacción, tracking apretado en display). Lo que NO tomamos de adora: su violeta (ley anti-lila de Tendr), su base blanca fría, ni su grid genérico de 3 columnas.

> **Acento pendiente.** El acento primario se decide tras validar en el **showcase** (`/_showcase/design`). Candidato líder: **teal apagado**. Hasta esa decisión, los tokens de acento quedan como `TODO` y el resto del sistema NO depende de ese valor.

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

Notación: hex + oklch de referencia. AA mínimo contra el fondo en cualquier combinación texto+fondo (objetivo AA+ en body).

| Token semántico | Valor | oklch aprox. | Rol |
|---|---|---|---|
| `--color-surface` | `#FAF8F4` | `0.985 0.006 80` | Fondo de página. **Warm-white, nunca blanco puro ni gris frío** (conserva calidez) |
| `--color-surface-raised` | `#FFFFFF` | `1 0 0` | Cards, paneles elevados |
| `--color-surface-sunken` | `#F2EFE8` | `0.95 0.008 80` | Inputs, code blocks |
| `--color-text-primary` | `#1F1B16` | `0.22 0.012 70` | Titulares y body. Warm-ink, **alto contraste** sobre surface |
| `--color-text-secondary` | `#5A5247` | `0.45 0.015 70` | Meta, labels |
| `--color-text-tertiary` | `#8A8275` | `0.62 0.012 75` | Dimmed, placeholders |
| `--color-border-hairline` | `#E7E2D8` | `0.92 0.01 80` | Bordes 1px sutiles (estructura ligera, en vez de sombras) |
| `--color-border-strong` | `#D9D3C6` | `0.86 0.012 80` | Bordes estructurales 1-2px |
| `--color-accent-primary` | `TODO` | `TODO` | **CTAs, focus, links activos. Se decide en showcase. Candidato: teal apagado ~ `#2F7269` / `oklch(0.54 0.06 190)`. Uso EXCLUSIVO para lo interactivo.** |
| `--color-accent-soft` | `TODO` | `TODO` | Lavado suave del acento para fondos de card decorativa. Deriva del acento (post-showcase) |
| `--color-handdrawn` | `TODO` | `TODO` | Color de las anotaciones hand-drawn (flechas, círculos). Suele = acento o un secundario apagado. Post-showcase |
| `--color-success` | `#3E7D52` | `0.55 0.10 150` | Estados OK (si el acento final es verde, oscurecer/apagar este para diferenciar) |
| `--color-danger` | `#B3402E` | `0.52 0.16 30` | Errores, destructivos (rojo cálido) |
| `--color-warning` | `#B5832E` | `0.62 0.11 75` | Caution (uso mínimo; ocre, no el amber-wash de v1) |
| `--color-focus` | `var(--color-accent-primary)` | — | Ring de foco = acento |

**Regla de oro de color (de adora, adoptada):** el acento aparece **solo** en elementos interactivos (CTAs, links, estados activos, foco). El resto del sistema es warm-white + warm-ink + hairlines. Ahí está el "limpio".

### 2.2 Tipografía

| Rol | Familia | Pesos | Origen | Notas |
|---|---|---|---|---|
| Display | **Bricolage Grotesque** | 600, 700 | Google Fonts (libre) | Grotesca con carácter, contemporánea. Propuesta a validar en showcase; swappable |
| Body / UI | **Plus Jakarta Sans** | 400, 500, 600 | Google Fonts (libre) | Limpia, geométrica, legible (la de adora, libre) |
| Mono | **Geist Mono** | 400, 500 | Google Fonts (libre) | Numerales `01/02/03`, etiquetas meta |

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
| `shadow-soft` | `0 1px 2px rgba(31,27,22,.04), 0 2px 8px rgba(31,27,22,.06)` | Hover sutil, popovers |
| `shadow-note` | `0 6px 18px rgba(31,27,22,.10)` | **Exclusivo de las "notas vivas"** (cards de papel con leve rotación). Es la firma; no se usa en el resto |

### 2.7 Movimiento

| Token | Valor | Uso |
|---|---|---|
| `duration-fast` | 150ms | Hover, micro-interactions |
| `duration-base` | 250ms | Transitions de UI |
| `duration-slow` | 400ms | Reveals on scroll |
| `easing-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | Default |
| `easing-emphasis` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Reveals |
| `easing-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` | El único momento wow (Hero→"Cómo funciona") |

Tope de 3 librerías de animación: **Motion (`motion/react`) + CSS scroll-driven nativo + Lenis**. Reduced-motion: estado final estático en cada coreografía.

---

## 3. Componentes destacados

- **Botón primario:** fondo `--color-accent-primary`, texto `--color-accent-fg` (blanco/warm-white según AA), `radius-md` (12px), padding cómodo. El único elemento con color saturado.
- **Botón ghost / outline:** transparente, texto `--color-text-primary`, border `--color-border-strong` 1px, `radius-md`.
- **Card limpia:** `--color-surface-raised`, `radius-lg` (16px), `shadow-flat` + hairline border. Plana y limpia (base del sistema).
- **Nota viva (firma):** card de papel, `--color-surface-raised`, leve rotación ±1°, `shadow-note`, opcional chincheta SVG. Muestra **faux-UI real del CRM** dentro (mini-kanban, card de cliente, toast). NUNCA grid genérico de iconos. Es la identidad de Tendr.
- **Badge:** pill (`radius-full`), texto en acento o secundario, fondo transparente o `--color-accent-soft`.
- **Anotación hand-drawn (firma, moderna):** flecha/círculo SVG `stroke` en `--color-handdrawn`, `stroke-linecap: round`. **Más limpia que v1: menos jitter, trazo más geométrico, 1-2 por sección como acento.** Hand-made, pero moderno.

---

## 4. Animaciones recurrentes

| Patrón | Descripción | Duración | Easing | Trigger | Librería |
|---|---|---|---|---|---|
| Reveal on scroll | Fade+rise de secciones | 400ms | emphasis | whileInView once | Motion |
| Hand-drawn draw-in | `stroke-dashoffset` de flechas/círculos | ~600ms | standard | in-view once | CSS/Motion |
| Wow Hero→Cómo funciona | Sticky overlap (único wow) | scroll | expo | scroll-driven + Lenis | CSS scroll-driven + Lenis |
| Hover lift nota viva | Leve scale + shadow-soft | 150ms | standard | hover | Motion/CSS |
| FLIP recomendador pricing | Flecha/tag salta al tier | ~400ms | emphasis | toggle | Motion layout |

---

## 5. Principios

- Jerarquía con **peso tipográfico y tamaño de display**, no con color.
- **Whitespace generoso** entre secciones (mínimo `space-16`).
- **Un solo acento, exclusivo para lo interactivo.** El color = interacción.
- **Base siempre cálida** (warm-white), alto contraste de texto (AA+).
- **Hand-drawn + notas vivas como firma**, usadas con disciplina (sparing) y en versión moderna (trazo limpio).
- Mostrar el producto con **faux-UI**, no describirlo con iconos.
- Motion sutil; un único momento wow en toda la página.
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

---

## 7. Sugerencias premium (catálogo 2026)

Patrones de **referencia que se re-implementan en Motion**, nunca dependencias instaladas. Máx. 3 librerías de animación reales (Motion + CSS scroll-driven + Lenis).

| Patrón de referencia | De dónde | Qué aporta | Dónde en Tendr |
|---|---|---|---|
| Sticky overlap inter-sección | Motion Primitives / scroll-driven | El único wow | Hero → Cómo funciona |
| Drag físico de cards | Motion (`drag`, `useMotionValue`) | "Tú organizas tus clientes" | Bento Features (notas vivas) |
| Reveal escalonado | Motion `whileInView` | Entrada editorial | Cómo funciona, secciones |
| Draw-in de trazo a mano | CSS `stroke-dashoffset` | Firma hand-drawn moderna | Anotaciones por sección |

---

## 8. Cómo validar este `design.md`

- [ ] Lighthouse Performance ≥ 95 en mobile.
- [ ] CLS < 0.1 en producción.
- [ ] Accesibilidad AA (AA+ en body) en todos los componentes; contraste verificado tras fijar el acento.
- [ ] Tokens al 100% (cero hex hardcoded en componentes; todo vía `--color-*`).
- [ ] Ningún patrón de la sección Restricciones presente en código (ni lila, ni Inter, ni grid 3-col, ni base fría, ni radius-none).
- [ ] Acento usado **solo** en elementos interactivos.

---

## 9. Referencias

- **adora.ai** — destilado: lienzo limpio, **un acento exclusivo para interacción**, tracking apretado en display, radios suaves, plano con hairlines. **NO tomado:** su violeta (ley anti-lila), su base blanca fría, su grid de 3 columnas.
- **amplemarket.com** — destilado: **captura de email en el hero** + screenshot de producto prominente sobre lienzo limpio cálido.
- **geniestudio.app** — destilado: **aire y delight de motion** (elementos flotando, micro-motion). **NO tomado:** sus mascotas ilustradas (identidad ajena, choca con CRM profesional).

---

## 10. Quick start

### CSS Custom Properties

```css
:root {
  /* Surfaces */
  --color-surface:        #FAF8F4;
  --color-surface-raised: #FFFFFF;
  --color-surface-sunken: #F2EFE8;
  /* Text */
  --color-text-primary:   #1F1B16;
  --color-text-secondary: #5A5247;
  --color-text-tertiary:  #8A8275;
  /* Borders */
  --color-border-hairline:#E7E2D8;
  --color-border-strong:  #D9D3C6;
  /* Accents — TODO: definir tras showcase (candidato teal apagado #2F7269) */
  --color-accent-primary: /* TODO */;
  --color-accent-fg:      /* TODO: texto sobre acento, AA */;
  --color-accent-soft:    /* TODO: lavado del acento */;
  --color-handdrawn:      /* TODO: = acento o secundario apagado */;
  --color-success:        #3E7D52;
  --color-danger:         #B3402E;
  --color-warning:        #B5832E;
  --color-focus:          var(--color-accent-primary);
  /* Radii */
  --radius-sm: 8px;  --radius-md: 12px;  --radius-lg: 16px;  --radius-xl: 20px;  --radius-full: 9999px;
  /* Shadows */
  --shadow-flat: none;
  --shadow-soft: 0 1px 2px rgba(31,27,22,.04), 0 2px 8px rgba(31,27,22,.06);
  --shadow-note: 0 6px 18px rgba(31,27,22,.10);
}
```

### Tailwind v4

```css
@theme {
  --color-surface: #FAF8F4;
  --color-surface-raised: #FFFFFF;
  --color-surface-sunken: #F2EFE8;
  --color-text-primary: #1F1B16;
  --color-text-secondary: #5A5247;
  --color-text-tertiary: #8A8275;
  --color-border-hairline: #E7E2D8;
  --color-border-strong: #D9D3C6;
  /* --color-accent-primary: TODO (showcase) */
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

---

*Spec vivo. Cambios significativos requieren commit `docs(design): ...` y bump de versión en cabecera. El acento se fija tras el showcase.*
