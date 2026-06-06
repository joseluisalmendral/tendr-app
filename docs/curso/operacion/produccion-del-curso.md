# Producción del curso · workflow operativo del equipo

> Documento de trabajo del equipo que construye y graba el track Fullstack. Define cómo se organizan los dos repos de Tendr, cómo se versiona, cómo se enseña al alumno tanto a arrancar de cero como a operar sobre código existente, y qué cuidados aplicar al ser repos públicos desde el día uno.

---

## 1. Decisiones bloqueantes (tomadas)

- **Dos repos separados**, no monorepo.
  - `tendr-landing` para L16.
  - `tendr-app` para L17.
  - Razón: la landing es estática y autónoma; la app es fullstack y compleja. Mezclarlas obligaría a explicar herramientas de monorepo (Turborepo, pnpm workspaces) que no tocan al programa.
- **Públicos desde el día uno**.
  - Razón: el valor pedagógico de "build in public" supera la fricción operativa.
  - Coste: requiere disciplina desde el primer commit (sin "wip", sin secretos, sin caos).

Estas dos decisiones condicionan todo lo demás. Si cambian, reabrir este documento.

---

## 2. Estructura de los repos

### 2.1 `tendr-landing` (L16)

```
tendr-landing/
├── README.md                     ← qué es, cómo arrancar, cómo seguir el curso
├── LICENSE                       ← MIT (decisión §10.4)
├── CLAUDE.md                     ← contexto del proyecto para el agente
├── AGENTS.md                     ← misma idea, herramientas-agnóstico
├── CHANGELOG-CURSO.md            ← qué fase cubre cada tag, con enlaces a PRs
├── .env.example                  ← variables documentadas (sin valores reales)
├── .gitignore
├── docs/
│   ├── curso/                    ← copia versionada de _planificacion + _compartido relevantes
│   │   ├── plan.md
│   │   ├── flujo-de-trabajo.md
│   │   ├── preguntas-compartidas.md
│   │   └── (otros que el alumno necesite consultar)
│   ├── decisions/                ← ADRs nacidos durante construcción
│   │   ├── 001-stack.md
│   │   ├── 002-vercel-tos.md
│   │   └── ...
│   └── design.md                 ← spec del sistema de diseño (fase 3)
├── exploration/                  ← Stitch + galerías (fase 2)
│   ├── dir-1-clean-saas/
│   ├── dir-2-editorial/
│   ├── galleries-references/
│   └── decision.md
├── app/, components/, db/, ...   ← código del proyecto
└── e2e/                          ← Playwright smoke
```

### 2.2 `tendr-app` (L17)

```
tendr-app/
├── README.md
├── LICENSE
├── CLAUDE.md
├── AGENTS.md
├── CHANGELOG-CURSO.md
├── .env.example
├── .gitignore
├── docs/
│   ├── curso/                    ← copia versionada de _planificacion + _compartido relevantes
│   ├── decisions/                ← ADRs 001..007 nacidos durante construcción
│   ├── spec.md                   ← MVP de Tendr (fase 1)
│   ├── jtbd.md                   ← bloque previo de fase 1
│   ├── architecture.md           ← diagrama lógico (fase 2)
│   └── postmortems/              ← cuando haya incidente (fase 10)
├── app/, components/, db/, ...
├── e2e/                          ← Playwright + axe-core
└── .github/
    └── workflows/                ← CI/CD agéntico (fase 10)
```

### 2.3 `docs/curso/` como copia, no symlink

El repo del proyecto debe ser autocontenido. El alumno hace `git clone` y tiene todo lo necesario para seguir el curso sin tener que ir a otro sitio. Por tanto:

- `docs/curso/plan.md` es una **copia versionada** del `_planificacion/plan.md` correspondiente.
- Cuando el módulo (`guias/modulo-5/leccion-X/_planificacion/`) cambie, hay que **propagar el cambio al repo del proyecto** con un commit explícito (`docs: sync docs/curso con módulo`).
- Sí, esto duplica contenido. Es deliberado: el repo del alumno no debe depender del repo del módulo.

---

## 3. Convenciones de control de versiones

### 3.1 Naming de branches

```
fase-N-slug-corto

Ejemplos:
- fase-1-jtbd-spec
- fase-3-schema-rls
- fase-5-workspace-core
- fase-7-multi-provider-byo-key
```

Una fase puede tener varias features SDD independientes. Si se necesitan sub-branches, usar:

```
fase-7-multi-provider-byo-key
├── fase-7a-envelope-encryption
├── fase-7b-manifest
└── fase-7c-cost-budget
```

Cada sub-branch se mergea a la branch de fase, y la branch de fase se mergea a `main` al cerrar la fase.

### 3.2 Conventional commits

Formato obligatorio:

```
<type>(<scope>): <descripción corta en minúsculas>

[cuerpo opcional]
```

Types permitidos:

- `feat` — nueva funcionalidad
- `fix` — corrección de bug
- `refactor` — cambio de código sin cambiar comportamiento
- `docs` — solo documentación
- `chore` — tareas de mantenimiento (deps, config)
- `test` — tests nuevos o ajustes
- `style` — formateo, sin cambio de lógica
- `perf` — optimización de rendimiento
- `ci` — cambios en CI/CD

Scopes recomendados:

- `L16`, `L17` cuando el cambio toca solo a una lección.
- Nombres de módulos del producto: `auth`, `workspace`, `documents`, `templates`, `byo-key`, `stripe`, `manifest`, etc.

Ejemplos válidos:

```
feat(workspace): add Kanban with DnD Kit and Realtime sync
fix(auth): handle expired session in proxy.ts redirect
docs(decisions): add ADR-007 default model assignment
refactor(byo-key): extract envelope encryption to dedicated module
chore: bump @supabase/ssr to 0.5.x
test(rls): add cross-tenant isolation suite
```

**Sin Co-Authored-By, sin "🤖 Generated with Claude Code"**. El autor del commit es la persona que lo firma.

### 3.3 Política de PRs

- **Toda fase entra a `main` vía PR**, nunca commit directo.
- **Small CL**: target < 200 líneas, máximo absoluto ~400 (aplicar el bloque pedagógico de L17 C5).
- **Una fase puede generar varios PRs** si la fase es densa (caso típico: fase 7 de L17 con 4-5 PRs encadenados).
- **PR title** sigue conventional commits: `feat(workspace): ...`.
- **PR body** estructurado:

```markdown
## Qué
[1-3 líneas]

## Por qué
[ligar con plan.md §X.Y o ADR-NNN]

## Cómo probarlo
- [ ] Pasos manuales para reviewers
- [ ] Tests ejecutados

## Captura para el curso
[Si esta sesión generó momentos útiles para grabar, mencionarlo:
"Capturado: alucinación del agente en linkIdentity (clip 35s)"
"Capturado: RLS test falla por OR en policy (clip 90s)"]
```

### 3.4 Protección de main

En GitHub repository settings:

- **Branch protection rule** en `main`:
  - Require pull request before merging.
  - Require status checks (lint + typecheck + test + build).
  - Require linear history (no merge commits, solo rebase or squash).
  - Disallow force pushes.
- **Tags protegidos** con prefijo `clase-*` (no pueden borrarse ni reescribirse).

### 3.5 .gitignore mínimo

```gitignore
# dependencias
node_modules/
.pnpm-store/

# build
.next/
dist/
.turbo/

# entornos
.env
.env.local
.env.*.local

# editor / sistema
.vscode/
.idea/
.DS_Store
*.swp

# coverage
coverage/
*.lcov

# captura local (no público en el repo del alumno)
/captura-local/
```

---

## 4. Hitos del curso · tags por fase

### 4.1 L16 (tendr-landing)

| Tag | Estado del repo al final de la fase |
|---|---|
| `clase-0` | Repo recién creado: README + LICENSE + CLAUDE.md + AGENTS.md + .gitignore + .env.example. Sin código. |
| `clase-1` | Stack decidido. ADR-001 firmado. Scaffold Next.js 16 + Tailwind v4 + shadcn + Drizzle + Neon. Primer commit funcional. |
| `clase-2` | `exploration/` poblada con 3-5 direcciones, decisión documentada en `exploration/decision.md`. Sin código nuevo del producto. |
| `clase-3` | `docs/design.md` versionado con tokens, voz, principios y restricciones. AGENTS.md actualizado con `@docs/design.md`. |
| `clase-4` | Biblioteca de componentes en `components/` con SEO + GEO + a11y integrados. Showcase route en `/_showcase`. |
| `clase-5` | Landing v1 funcional: `/`, `/pricing`, `/legal/*`. `llms.txt`, `robots.ts` ajustado, JSON-LD profundo. Lighthouse ≥ 95. |
| `clase-6` | 2 variantes de hero + 1 variante completa de vertical. Decisiones documentadas en `exploration/variants/`. |
| `clase-7` | Captura de email funcional: Server Action + Zod + Drizzle + Neon + Turnstile + rate limiting. Tests verdes. |
| `clase-8` | Skill `landing-auditor` versionada en `.claude/skills/`. Reporte multicapa contra preview deploy. |
| `clase-9` | Producción en Vercel con dominio (si aplica). CI/CD verde. Smoke test pasando. README final con disclaimer ToS. |

### 4.2 L17 (tendr-app)

| Tag | Estado del repo al final de la fase |
|---|---|
| `clase-0` | Repo recién creado: README + LICENSE + CLAUDE.md + AGENTS.md + .gitignore + .env.example. |
| `clase-1` | `docs/jtbd.md` y `docs/spec.md` versionados. `docs/tasks.md` priorizado. AGENTS.md actualiza con `@jtbd.md @spec.md`. |
| `clase-2` | ADRs 001-003 (arquitectura, ToS Vercel, capa IA) en `docs/decisions/`. `docs/architecture.md` con diagrama. Disclaimer ToS en README. |
| `clase-3` | Schema completo en Drizzle. RLS policies vigentes. Vitest de aislamiento en verde. Proyecto único `tendr-app-dev` migrado (Branching descartado: requiere plan Pro). |
| `clase-4` | Auth funcional con magic link + patrón anónimo → autenticado. `proxy.ts` protegiendo rutas. Tests de promoción. |
| `clase-5` | Workspace core: clientes, casos, Kanban con DnD + Realtime + `useOptimistic`. **PRs ejemplo del bloque code review explicado**. |
| `clase-6` | Upload de documentos + Inngest function `extractDocument` + capability routing + Langfuse trazando. |
| `clase-7` | Editor plantillas + `/settings/ai` página única + envelope encryption + manifest seed + cost budget MVP + inserts en `audit_log`. ADR-007 firmado. |
| `clase-8` | Stripe sandbox + Checkout + webhook signed + idempotencia + helper `requirePlan` en Server Actions. |
| `clase-9` | Suite E2E Playwright + axe-core verde (Supabase local; en CI, preview deploy sobre el proyecto único). Checklist QA pasado. |
| `clase-10` | Producción + Sentry + Langfuse activos + smoke check + claude-code-action + feature flag rollout iniciado. ADR-007 reabierto con datos reales. |

### 4.3 CHANGELOG-CURSO.md

Cada tag tiene su entrada. Plantilla:

```markdown
## clase-5 · Workspace core con bloque de code review

**PRs incluidos**: #12, #13, #14

**Qué se construyó**:
- Páginas `/clients`, `/clients/[id]`, `/kanban`
- Server Actions con `useOptimistic`
- Suscripción Realtime filtrada por workspace
- DnD Kit accesible

**Bloque pedagógico aplicado**: code review + tamaño de PR (L17 plan §11.5).

**Decisiones tomadas**:
- (ninguna nueva; sigue las decisiones de C2 y C3)

**Capturado para el curso**:
- Clip 30s: PR #12 inicial era 600 líneas, agente dividió en tres.
- Clip 45s: RLS test cruzado detecta leak en `cases` (corregido en PR #13).
```

---

## 5. Issues como roadmap público

Los repos públicos permiten **un issue por fase** como roadmap visible. Aporta tres cosas:

1. Transparencia: cualquiera ve qué se está construyendo y por qué.
2. Trazabilidad: el PR cierra el issue, el issue queda en el historial.
3. Material pedagógico: el alumno **entiende el flujo profesional issue → branch → PR → merge → tag**.

### 5.1 Plantilla de issue por fase

```markdown
## Fase NN · {nombre}

**Ref**: docs/curso/plan.md §X.Y
**Tag al cerrar**: clase-N

### Qué se construye
[1-3 líneas]

### Criterios de cierre
- [ ] Tests verdes
- [ ] Validación visual de cierre pasada (si aplica)
- [ ] ADR firmado (si aplica)
- [ ] CHANGELOG-CURSO.md actualizado
- [ ] PR mergeado a main
- [ ] Tag `clase-N` creado

### Bloques pedagógicos relevantes
- (citar si en esta fase entra algún bloque del curso como code review, JTBD, ADR reabierto, etc.)
```

### 5.2 Labels recomendadas

- `fase-1` ... `fase-10` para clasificar issues por fase.
- `bloque-pedagogico` cuando un issue es soporte de un momento del curso.
- `bug-en-construccion` cuando algo se descubre roto durante la grabación previa.
- `decision-pendiente` cuando un issue espera input humano.

### 5.3 Issues vs PRs vs Discussions

- **Issues**: roadmap del curso, bugs detectados, decisiones pendientes.
- **PRs**: cambios concretos que entran a `main`.
- **Discussions**: hilos abiertos para feedback de alumnos cuando el curso esté lanzado. Desactivadas hasta entonces.

---

## 6. Releases de GitHub

Cada tag `clase-N` tiene su **GitHub Release** con notas legibles que el alumno puede leer sin abrir el código.

### 6.1 Plantilla de release

```markdown
# Clase C5 · Workspace core: clientes, casos y Kanban

🎯 **Estado del repo**: el alumno tiene aquí el workspace core funcional con
Kanban interactivo, optimistic updates y sincronía multi-tab vía Realtime.

## ¿Qué construye esta clase?

- Páginas `/clients` y `/kanban`.
- Server Actions con `useOptimistic`.
- Realtime de Supabase filtrado por `workspace_id`.
- Drag and drop accesible con DnD Kit.

## Bloque pedagógico incluido

Esta clase introduce el **patrón de code review profesional en la era agéntica**:
cómo se revisa un PR del agente, criterios de "small CL", división de PRs por
responsabilidad y orden de revisión (spec → seguridad → correctitud →
performance → readability).

Ver el PR #12 (inicial, 600 líneas) y los tres PRs en los que se dividió
(#13, #14, #15) para ver el patrón aplicado.

## Estado de partida vs estado final

```diff
git diff clase-4..clase-5 --stat
[ejemplo de output]
```

## Próxima clase

C6 · Documentos con Storage + AI extractor (job persistido).
Antes de pasar, verifica que:
- [ ] `pnpm test` está verde
- [ ] La landing local pasa Lighthouse > 95
- [ ] No hay TODOs sin cerrar en el código
```

### 6.2 Cuándo crear el release

Inmediatamente después de crear el tag, antes de pasar a la siguiente fase. Si se hace al final con todos a la vez, las notas pierden frescura y se inventan.

---

## 7. Workflow de sesión típica de construcción

Lo que tú haces (no el alumno) durante cada fase. **Ocho pasos**.

### 7.1 Antes de empezar la sesión

- [ ] OBS abierto, escena correcta, audio probado.
- [ ] Pantalla limpia (cerrar Slack, notificaciones silenciadas).
- [ ] Carpeta `captura-local/` con espacio (>10 GB libres).
- [ ] Issue de la fase abierto en GitHub.
- [ ] Tab abierto: `docs/curso/plan.md §X.Y` (la fase concreta).
- [ ] Tab abierto: `docs/decisions/` por si hay que reabrir un ADR.

### 7.2 Los ocho pasos durante la sesión

```
1. Brief mental (5 min)
   Lees plan.md §X.Y de la fase y cualquier doc de soporte
   (produccion-y-seguridad.md si la fase es sensible).

2. Activar grabación
   Atajo de OBS, escena Tendr.

3. Branch desde tag anterior
   git checkout main
   git pull
   git checkout -b fase-N-slug clase-N-1

4. Aplicar SDD por feature
   Una fase puede tener una o varias features SDD.
   Para cada feature:
     /sdd-new feature-name
     /sdd-propose ... aprobación humana
     /sdd-spec ... aprobación humana
     /sdd-design ... aprobación humana
     /sdd-tasks ... aprobación humana
     /sdd-apply ... commits pequeños
     /sdd-verify
     /sdd-archive

5. Commits pequeños (small CL)
   Cada commit cohesivo y firmado con conventional commit.
   Push frecuente al remoto (es público, build in public real).

6. Abrir PR
   gh pr create --title "..." --body "..."
   CI verde antes de mergear.
   Si esta fase introduce un bloque pedagógico de code review
   (L17 C5), aplicártelo a ti mismo en el PR.

7. Merge + tag + release
   gh pr merge --squash
   git checkout main && git pull
   git tag -a clase-N -m "Cierre fase N: ..."
   git push origin clase-N
   gh release create clase-N --notes-file release-notes.md

8. Cierre de sesión
   - Detener OBS.
   - Renombrar archivo con YYYY-MM-DD_descripcion.mkv.
   - Crear notas.md con timestamps de momentos clave (mientras está fresco).
   - Actualizar INDEX.md de captura local.
   - Cerrar issue de GitHub con referencia al tag.
   - Actualizar CHANGELOG-CURSO.md.
```

### 7.3 Al cerrar fase, qué debe existir

- Branch mergeada a `main`, branch borrada del remoto.
- Tag `clase-N` creado y pusheado.
- GitHub Release publicado con notas.
- Issue cerrado.
- CHANGELOG-CURSO.md con entrada nueva.
- ADR firmado si la fase tomó decisión arquitectónica.
- Material capturado archivado en `captura-local/` con notas.

---

## 8. Calibración construir-de-cero vs sobre-estado-existente

Patrón pedagógico clave. **El curso enseña las dos cosas, no solo bootstrap**.

### 8.1 Tabla por lección

| Lección | Fases desde cero | Fases sobre estado anterior |
|---|---|---|
| L16 | C1, C2, C3 | C4 → C9 (parte de `clase-3`) |
| L17 | C1, C2, C3 | C4 → C10 (parte de `clase-3`) |

### 8.2 Por qué C1-C3 desde cero y C4+ sobre estado

Las primeras tres fases de cada lección **fijan el contexto del proyecto**:

- C1 · Spec y dirección visual: si el alumno no entiende qué se construye y para quién, todo lo demás se vuelve copy-paste.
- C2 · Arquitectura y stack: las decisiones grandes (Next.js + Supabase + ...) son caras de revertir y el alumno tiene que defenderlas con criterio.
- C3 · Datos / schema / fundamentos visuales: la pieza que condiciona el resto.

A partir de C4, el aprendizaje deja de ser "decidir el rumbo" y pasa a ser "construir bien sobre lo decidido". Ahí es donde el alumno **lee el estado actual y aplica el cambio**, que es el 80% del trabajo real de un developer junior en empresa.

### 8.3 Cómo se materializa en el curso

Al inicio de cada clase a partir de C4:

```bash
# El alumno parte del tag de la clase anterior
git clone https://github.com/.../tendr-app.git
cd tendr-app
git checkout clase-3
pnpm install
pnpm dev
```

Ahora el alumno **tiene el proyecto exactamente como debe estar al empezar C4**, y construye encima.

---

## 9. Patrón pedagógico por clase

Cuatro bloques en cada grabación de clase a partir de C4. Cada bloque tiene su función específica.

### 9.1 Bloque 1 · Walkthrough del estado (60-90 segundos)

```bash
git checkout clase-N-1
```

Tú abres el repo y narras:

- Estructura de carpetas relevante.
- Último ADR firmado (lo lees en directo).
- Último CHANGELOG entry.
- Tabla de tests vigentes.

Cierre: "ahora estamos aquí. Lo que vamos a hacer en esta clase es...".

### 9.2 Bloque 2 · "¿Qué cambia y por qué?" (30-60 segundos)

- Mostrar el issue de GitHub de esta fase.
- Mostrar el JTBD o historia de usuario que motiva el cambio.
- Mostrar qué archivos vas a tocar (sin entrar al cómo).

Cierre: "el reflejo profesional es leer esto antes de teclear. Vamos a hacerlo".

### 9.3 Bloque 3 · Construcción guiada (cuerpo de la clase)

- SDD aplicado a la feature, paso a paso.
- Tu narración explicando qué se le pide al agente y por qué.
- **Inserts auténticos** de la construcción previa (clips de OBS de 30-90 seg) en los momentos de fricción real.

Esto **no es trampa**: es lo que hace cualquier instructor profesional. Lo que cuentas es real, simplemente no es la primera vez que lo haces.

### 9.4 Bloque 4 · Diff y cierre (60 segundos)

```bash
git diff clase-N-1..clase-N --stat
gh pr view <numero>
```

- Mostrar qué cambió.
- Abrir el PR mergeado.
- Leer la entrada del CHANGELOG.
- Anunciar siguiente clase.

Cierre: "el aprendizaje de esta clase queda capturado en el ADR-NNN / el commit X / el test Y. Ya está en producción si has pusheado. Pasa a C{N+1}".

### 9.5 Cómo encajan los clips auténticos

Los clips capturados durante la construcción previa entran en el **Bloque 3** como inserts naturales. Cada clip se introduce con una frase del estilo:

> "Mira lo que pasó la primera vez que construí esto..."
> "Aquí el agente la lió. Fíjate cómo recupero..."
> "Esto debería funcionar a la primera, pero no lo hizo..."

Frecuencia recomendada: **1-2 clips por clase**, no más. Más satura y rompe el ritmo.

---

## 10. Cuidados de repos públicos desde día uno

### 10.1 Secretos · cero tolerancia

- **Nunca** commitear `.env` o `.env.local`.
- `.env.example` con todas las variables documentadas pero sin valores reales.
- **Pre-commit hook** que escanee secretos (gitleaks o equivalente) configurado **antes del primer commit**.
- Si por accidente se commitea un secret: rotar inmediatamente la key y considerar el incidente como "secret pública para siempre" (los reescrituras de historia no garantizan limpieza en repos públicos forkeados).

### 10.2 README inicial

Plantilla del primer commit:

```markdown
# Tendr · {Landing|App}

Proyecto en construcción pública como caso práctico del **track Fullstack**
de [Desarrollo Agéntico](<link al curso cuando exista>).

⚠️ **Aviso**: el repo está en construcción activa. El estado de `main` es el
producto final cuando el curso esté grabado. Para el **estado por clase**, ver
los tags `clase-0` ... `clase-N`.

## Cómo se usa este repo

1. Clona el repo:
   ```bash
   git clone https://github.com/.../tendr-{landing,app}.git
   ```
2. Para empezar desde el principio del curso:
   ```bash
   git checkout clase-0
   ```
3. Para empezar desde una clase concreta:
   ```bash
   git checkout clase-N  # reemplaza N por la clase
   ```
4. Sigue el curso. Cada release de GitHub explica qué construye su clase.

## Documentación del curso

- `docs/curso/plan.md` · plan completo de la lección.
- `docs/curso/flujo-de-trabajo.md` · meta-flujo profesional.
- `docs/decisions/` · ADRs producidos durante la construcción.
- `docs/curso/...` · otros documentos de referencia.

## Estado del proyecto

Última clase publicada: **clase-N**. Próxima clase: **clase-{N+1}**.

[Lista viva de tags con enlaces a su release.]

## Licencia

Código bajo [MIT](LICENSE).
```

### 10.3 Disclaimer de "build in public"

Durante construcción activa, el README debe avisar:

> Este repo es material de un curso en producción. El código que veas hoy
> puede no ser el final; las decisiones se documentan en ADRs y se reabren
> cuando los datos lo piden (ver `docs/curso/flujo-de-trabajo.md §4`). Si
> usas este proyecto como base, pinea el tag de la última clase publicada.

### 10.4 Licencia

**MIT para el código** (estándar, todo el mundo lo conoce, máxima compatibilidad).

```
MIT License

Copyright (c) 2026 [Tu nombre o empresa]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, ...
[texto estándar MIT]
```

**Para los documentos del curso** (`docs/curso/`): aviso en el README de que el contenido educativo está protegido por derechos de autor del programa. No es necesario un archivo de licencia separado; basta con el aviso.

### 10.5 CLAUDE.md y AGENTS.md en cada repo

Plantilla mínima del `CLAUDE.md`:

```markdown
# CLAUDE.md

## Contexto del proyecto

Tendr · {landing|app}. Caso práctico del track Fullstack de Desarrollo Agéntico.

- Plan completo: ver `docs/curso/plan.md`
- Flujo de trabajo profesional: ver `docs/curso/flujo-de-trabajo.md`
- Producción y seguridad (solo app): ver `docs/curso/produccion-y-seguridad.md`
- Pricing y decisiones compartidas: ver `docs/curso/preguntas-compartidas.md`
- ADRs vigentes: ver `docs/decisions/`

## Estado actual

Última clase cerrada: clase-N.
Próxima clase: clase-{N+1}.

## Convenciones del proyecto

- Stack: Next.js 16 + Tailwind v4 + shadcn + {Neon|Supabase} + Drizzle + Vercel.
- RLS siempre activa (solo app).
- Server Actions para mutaciones, Server Components por defecto.
- proxy.ts, no middleware.ts (Next.js 16).
- Claves sb_publishable_xxx / sb_secret_xxx (Supabase 2026, solo app).
- Conventional commits sin Co-Authored-By.
- Small CL: PRs < 200 líneas, máximo absoluto ~400.

## Convenciones de IA

- Para BD: usar Drizzle, no SQL crudo (excepto migraciones).
- Para auth: cookies httpOnly siempre, jamás localStorage.
- Para IA: Vercel AI SDK, generateObject con Zod, streaming con streamText.
- Para envelope encryption (solo app): AES-256-GCM con DEK + KEK, KEK en env.

## Comandos útiles

[lista de comandos relevantes del proyecto]
```

`AGENTS.md` es prácticamente la misma información pero con el formato genérico para Codex / OpenCode / otros agentes.

### 10.6 GitHub repository settings al crear el repo

- [ ] Visibilidad: público.
- [ ] Branch protection en `main` (ver §3.4).
- [ ] Tags protegidos con prefijo `clase-*`.
- [ ] Issues activos.
- [ ] Discussions desactivadas hasta el lanzamiento.
- [ ] Wiki desactivada (la documentación vive en `docs/`).
- [ ] Topics: `nextjs`, `supabase`, `claude-code`, `developer-course`, `agentic-development`, ...
- [ ] Description: "Caso práctico del track Fullstack · Tendr {landing|app}".
- [ ] Website: link al curso cuando exista.

---

## 11. Checklist antes de arrancar la construcción real

Antes del primer commit en cualquiera de los dos repos:

### Repo y archivos base
- [ ] Repo creado en GitHub público.
- [ ] LICENSE (MIT) commiteado.
- [ ] README inicial con plantilla de §10.2.
- [ ] CLAUDE.md y AGENTS.md commiteados con plantilla de §10.5 e incluyendo la política de aislamiento del agente de §13.9.
- [ ] .gitignore commiteado con plantilla de §3.5.
- [ ] .env.example commiteado con variables documentadas.
- [ ] `docs/curso/` poblado con copia de los documentos relevantes del módulo.

### Seguridad de la cadena de suministro (§13)
- [ ] `pnpm@>=11.0.0` instalado localmente (`pnpm --version`).
- [ ] `.npmrc` con `strict-dep-builds`, `minimum-release-age`, `block-exotic-subdeps`, `audit-level=high` (plantilla §13.4).
- [ ] `package.json` con `packageManager`, `engines.node >=22`, `engines.pnpm >=11` y `pnpm.allowBuilds` corto y revisado (§13.4).
- [ ] Pre-commit hook con gitleaks configurado y probado con un fake-secret (§13.10).
- [ ] `.github/dependabot.yml` con cooldown de 7 días para minor/patch y 14 para major (§13.8).
- [ ] GitHub **Secret Scanning** activado (Settings → Code security and analysis) (§13.6).
- [ ] GitHub **Push Protection** activado (Settings → Code security and analysis) (§13.6).
- [ ] Política de scopes mínimos para todos los tokens documentada en `docs/decisions/secrets.md` (§13.7).
- [ ] CI de GitHub Actions con `pnpm install --frozen-lockfile` y `pnpm audit signatures` (§13.5).

### GitHub repository settings
- [ ] Branch protection en `main` activada (require PR, status checks, linear history, no force push).
- [ ] Tags protegidos con prefijo `clase-*`.
- [ ] Issues activos, Discussions desactivadas, Wiki desactivada.
- [ ] Topics añadidos (`nextjs`, `claude-code`, `agentic-development`, etc.).

### Material del curso
- [ ] Issue de "Fase 1" abierto con plantilla de §5.1.
- [ ] Tag `clase-0` creado y pusheado.
- [ ] GitHub Release de C0 publicado con notas mínimas.

### Captura y producción
- [ ] OBS configurado y probado en una grabación de 30 seg.

Cuando este checklist esté verde, ya puedes empezar `fase-1-...`.

---

## 12. Sincronización entre el módulo y los repos del proyecto

El módulo (`guias/modulo-5/`) y los repos de los proyectos (`tendr-landing`, `tendr-app`) viven en sitios distintos. Cuando algo cambia en el módulo (típicamente porque has aprendido algo durante la construcción y has actualizado un ADR o el plan), hay que propagarlo:

```
guias/modulo-5/_planificacion/plan.md
       ↓
       cp
       ↓
tendr-{landing,app}/docs/curso/plan.md
       ↓
       commit: "docs(curso): sync con módulo, ADR-007 reabierto"
```

Frecuencia de sincronización: **al cerrar cada fase**. Si una sesión generó un ADR nuevo o un cambio del plan, propagar en el mismo commit que cierra la fase.

---

## 13. Seguridad de la cadena de suministro

### 13.1 Por qué esta sección existe

Entre septiembre de 2025 y mayo de 2026 el ecosistema npm ha sufrido la mayor cadena de incidentes de su historia. El worm autopropagante **Shai-Hulud** (septiembre 2025) y su variante **Mini Shai-Hulud** (abril-mayo 2026) reescriben el modelo de amenaza:

- Se ejecutan a través de scripts de lifecycle (`preinstall`, `postinstall`) de cualquier dependencia transitiva.
- Roban tokens de CI/CD, workstations y agentes (npm, GitHub, AWS, GCP, Azure, OpenAI, Anthropic, etc.).
- Con esas credenciales **publican versiones maliciosas de paquetes adicionales** y propagan la infección.
- A 11 de mayo de 2026 Microsoft Security reporta más de 170 paquetes comprometidos y 404 versiones maliciosas, afectando proyectos como TanStack, Mistral AI, UiPath y OpenSearch.

Si el equipo construye en público con repos accesibles y ejecuta agentes con tokens, **somos un objetivo válido**. Esta sección define la postura mínima de defensa para que ni el curso, ni los repos del proyecto, ni la máquina del equipo se conviertan en vector.

### 13.2 Decisión: pnpm 11+ obligatorio, Bun queda fuera

El curso fija **pnpm 11+** como gestor de paquetes obligatorio en ambos repos. Las menciones a "pnpm o bun" en briefs antiguos quedan obsoletas; cuando se toquen los briefs, se eliminará Bun de las alternativas. Razones:

- **pnpm 11 trae cuatro defaults de seguridad activos** que npm no tiene (ver §14.3).
- **Mini Shai-Hulud usa Bun como vector activo** en la campaña de abril-mayo 2026 (encrypta credenciales y abusa de su runtime para propagación). No es responsable recomendar Bun en un curso público mientras esta campaña esté activa.
- **Node 22 LTS + pnpm 11** es el stack defensivo del ecosistema en 2026.

Versión mínima: `pnpm@>=11.0.0`. Se fija en `package.json` del proyecto con `"packageManager": "pnpm@11.x.y"` y se verifica en CI.

### 13.3 Defaults de seguridad de pnpm 11

Cuatro piezas que pnpm 11 activa por defecto y que conviene **verificar explícitamente** en cada repo del curso:

| Default | Qué hace | Qué bloquea |
|---|---|---|
| **`strictDepBuilds: true`** | Las dependencias no pueden ejecutar `preinstall` ni `postinstall` por defecto. Solo se permiten las explícitamente declaradas en `allowBuilds` | El vector principal de Mini Shai-Hulud |
| **`minimumReleaseAge: 1440`** (24h) | Paquetes recién publicados no se resuelven durante 24 horas | El ataque "burn-and-grab" tras compromiso de credenciales |
| **`blockExoticSubdeps: true`** | Subdependencias que resuelven desde Git URLs o tarballs directos quedan bloqueadas | Inyección de dependencias por rutas no estándar al registry |
| **Lockfile estricto** | El lockfile se respeta; en CI con `--frozen-lockfile` cualquier divergencia falla el build | Resolución silenciosa de versiones distintas a las del lockfile |

### 13.4 Plantilla `.npmrc` del proyecto

Cada repo (tendr-landing y tendr-app) incluye un `.npmrc` versionado con los defaults explícitos. Aunque pnpm 11 ya los trae por defecto, **declararlos explícitamente** sirve como auditoría y como protección si alguien instala con una versión de pnpm más antigua.

```ini
# .npmrc

# Defensa contra supply chain attacks (Shai-Hulud y variantes)
strict-dep-builds=true
minimum-release-age=1440
block-exotic-subdeps=true

# Solo el registry oficial; sin mirrors privados ni Git URLs ocultas
registry=https://registry.npmjs.org/
git-checks=true

# Auditoría obligatoria (no instala si hay vulnerabilidad de severidad alta)
audit-level=high

# Lockfile como fuente de verdad
prefer-frozen-lockfile=true
save-exact=false
```

Y en `package.json`:

```json
{
  "packageManager": "pnpm@11.0.0",
  "engines": {
    "node": ">=22",
    "pnpm": ">=11"
  },
  "pnpm": {
    "allowBuilds": {
      "@biomejs/biome": true,
      "esbuild": true,
      "sharp": true
    }
  }
}
```

`allowBuilds` se mantiene **explícitamente corto** y solo se añade un paquete a la lista cuando se ha auditado que su script de build es legítimo. Cualquier dependencia que requiera `postinstall` y no esté aquí, fallará en `pnpm install` con un mensaje claro y el alumno debe revisar antes de añadirla.

### 13.5 CI: `pnpm install --frozen-lockfile` no negociable

El workflow de GitHub Actions (fase 10 de L17) corre **siempre** con `--frozen-lockfile`. Si el `pnpm-lock.yaml` no coincide exactamente con `package.json`, el CI falla. Esto bloquea dos escenarios de ataque:

1. Un commit modifica `package.json` añadiendo una dependencia nueva sin actualizar el lockfile (intento de inyección).
2. Una dependencia transitiva cambia su resolución entre el momento del lockfile y el del CI.

```yaml
# .github/workflows/ci.yml (extracto relevante)
- uses: pnpm/action-setup@v4
  with:
    version: 11

- name: Install dependencies (frozen)
  run: pnpm install --frozen-lockfile

- name: Verify provenance signatures (when available)
  run: pnpm audit signatures
  continue-on-error: true  # por ahora warning; en cuanto la cobertura sea alta, fail
```

`pnpm audit signatures` verifica las **provenance attestations** de Sigstore: link criptográfico entre la versión publicada, el commit fuente y el build system. Cuando un paquete tiene provenance y la verificación falla, es señal fuerte de compromiso.

### 13.6 GitHub Secret Scanning + Push Protection

GitHub ofrece dos capas de protección gratis en repos públicos que **se activan desde Settings**:

- **Secret scanning**: GitHub escanea automáticamente todos los commits y alerta si detecta secretos conocidos (npm tokens, AWS keys, OpenAI keys, etc.).
- **Push protection**: GitHub **bloquea el push** si detecta un secret en los commits a punto de subir. Es la segunda capa, complementaria al pre-commit hook local.

Settings → Code security and analysis → activar las dos en ambos repos antes del primer commit.

### 13.7 Política de scopes mínimos para tokens

Cada token de servicio externo se crea con el **mínimo scope posible** para su función. Lista vigente para el curso:

| Servicio | Token de | Scope mínimo |
|---|---|---|
| GitHub (CI personal) | `gh auth` interactivo | (lo que pida la sesión, sin tokens largos) |
| GitHub Actions | `GITHUB_TOKEN` automático | scope de la repo, expira con el job |
| Vercel | Deploy hook por proyecto | Project-scoped, no Account-wide |
| Supabase | Service role (server-only) y anon | Nunca exponer service_role al cliente |
| Stripe | Test mode keys mientras dure el curso | Modo test, no live |
| OpenAI / Anthropic / Google / DeepSeek / Kimi | API keys del usuario (BYO) | Idealmente proyecto-scope si el provider lo permite |
| Neon (solo L16) | Branch dev y prod separadas | Roles distintos por branch |
| Resend (opcional L16) | Domain-scoped sending key | Solo si se activa Resend |

Cuando un token se filtra (incluso por sospecha), **rotación inmediata** + revisión de logs del servicio en las últimas 48 horas. Documentar en un postmortem si tuvo impacto.

### 13.8 Renovate o Dependabot con cooldown

Cada repo debe tener **mantenimiento automático de dependencias** con dos reglas clave:

- **Cooldown de 7 días** mínimo antes de aceptar una versión nueva (refuerza el `minimumReleaseAge` de pnpm).
- **PRs separados por dependencia** (no agrupar) para que se puedan revisar uno a uno.

Plantilla `.github/dependabot.yml` para ambos repos:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    open-pull-requests-limit: 5
    cooldown:
      default-days: 7
      semver-major-days: 14
    labels:
      - "deps"
      - "needs-review"
    commit-message:
      prefix: "chore(deps)"
    versioning-strategy: "increase-if-necessary"
```

Alternativa: Renovate con perfil similar (más configurable pero requiere conocer Renovate). En este curso queda **Dependabot** por simplicidad y porque ya viene integrado con GitHub.

### 13.9 Aislamiento del agente

Esto es la pieza más sutil y más importante para el desarrollador agéntico. Cuando el agente (Claude Code, Codex, OpenCode) ejecuta `pnpm install` en una sesión del alumno, **opera con las credenciales de esa sesión**: variables de entorno, tokens del sistema, archivos `.env.local`, claves SSH. Si una dependencia es maliciosa, esas credenciales se exfiltran junto con las del alumno.

Reglas de aislamiento que aplica el equipo y que **se documentan en `CLAUDE.md` del repo de cada proyecto**:

1. **Cuando el agente vaya a ejecutar `pnpm install` por primera vez o tras añadir una dependencia nueva**, el alumno (o tú, durante la construcción) revisa los cambios al `pnpm-lock.yaml` antes de aceptar la operación. Sin revisión, no se ejecuta.
2. **El agente no tiene acceso directo a `.env.local` ni a las cuentas de servicios externos**. Las variables sensibles van solo al runtime de la app, no a la sesión del agente como variables que puede leer.
3. **Las sesiones del agente que ejecuten dependencias nuevas se hacen idealmente en una shell separada** sin tokens largos cargados. Si el agente necesita un token específico para una tarea, se le da con scope mínimo y duración corta.
4. **Cualquier `pnpm install` que el agente proponga ejecutar y que toque una dependencia nueva** debe pasar por revisión humana antes de mergear al PR. No se acepta "lo ejecuta el agente y ya está".

### 13.10 Pre-commit hook de gitleaks

Mantiene la capa local de defensa contra fuga de secretos antes de que un commit llegue a GitHub. Setup mínimo:

```bash
brew install gitleaks
mkdir -p .git/hooks
cat > .git/hooks/pre-commit <<'EOF'
#!/bin/sh
gitleaks protect --staged --verbose
if [ $? -ne 0 ]; then
  echo "❌ Posible secret detectado. Revisa antes de commitear."
  exit 1
fi
EOF
chmod +x .git/hooks/pre-commit
```

Verificación: hacer `git commit` tras añadir un fake `OPENAI_API_KEY=sk-test-xxxxxxxxxxxx` a un archivo y confirmar que se bloquea.

Configuración opcional en `.gitleaks.toml` para añadir reglas específicas del curso (por ejemplo, formato de `sb_secret_xxx` de Supabase 2026).

### 13.11 Auditoría manual antes de añadir una dependencia nueva

Cuando el agente o el alumno **proponga añadir una dependencia nueva** al `package.json`, el equipo (o el alumno en su versión del proyecto) pasa por un mini-checklist:

1. ¿La dependencia tiene **provenance attestation**? Verificar con `pnpm view <pkg> --json | jq '.dist'`. Si tiene `attestations`, mejor.
2. ¿Cuándo se publicó la última versión? Si fue **hace menos de 24 horas**, esperar (el `minimumReleaseAge` ya lo bloquea, pero hay que entender por qué).
3. ¿Cuántos downloads semanales tiene? `pnpm view <pkg> --json | jq '.dist-tags'` + npm dashboard. Una librería con < 100 downloads/semana requiere más auditoría.
4. ¿Tiene mantenedor reconocido y repo público vigente? El paquete con repo abandonado o sin tests es señal de riesgo.
5. ¿Trae `postinstall` o `preinstall`? Si sí, **se queda en `allowBuilds`** solo si se ha verificado qué hace exactamente.

Esto se hace **una vez por dependencia nueva**, no por cada update. Updates dentro de la misma major los gestiona Dependabot con cooldown.

### 13.12 Resumen accionable

Antes del primer commit en cualquier repo de Tendr, esta sección de seguridad debe estar implementada. El checklist de §11 ya incluye los items concretos.

---

## 14. Métricas operativas del workflow

Para saber si el workflow está sano, mide tras cerrar cada fase:

- **Tamaño medio del PR**: target < 200 líneas. Si supera 400 con frecuencia, los hitos son demasiado grandes; partir en sub-branches.
- **Tiempo entre tag y release publicado**: target < 24h. Si pasa más, las notas pierden frescura.
- **Cantidad de clips útiles capturados por fase**: target 1-3. Si son 0, la grabación va a sonar acartonada; si son >5, hay material para varias fases siguientes.
- **Commits con `wip` o `fix typo` o "asdf"**: target 0. Si aparecen, el alumno los verá en el historial público.
- **ADRs reabiertos por fase**: 0-1 normal, 2+ es señal de que las decisiones iniciales necesitan revisión seria.

---

*Documento vivo del equipo. Si el workflow cambia, actualizarlo antes de la siguiente sesión para que el cambio quede capturado.*
