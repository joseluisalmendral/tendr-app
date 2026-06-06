# Preguntas compartidas · L16 + L17

> Decisiones que afectan a las dos lecciones y deben quedar cerradas **antes de grabar cualquiera de las dos**.

---

## 1. Nombre del producto

**Propuesta tentativa:** Tendr.

Alternativas a discutir:

| Nombre | Pros | Contras |
|---|---|---|
| Tendr | Claro, B2B, suena producto real | Genérico, hay servicios con nombre similar |
| Caseboard | Captura cases + kanban | Suena solo a tablero |
| Atelier | Artesanal, encaja con consultoría | Suena solo a freelance |
| ClientHub | Directo | Existe ya como producto |

**Decisión necesaria:** elegir uno y bloquearlo en ambas lecciones.

---

## 2. Pricing tiers

**Propuesta tentativa:**

| Plan | Precio | Incluye | Visible en landing | Implementado en L17 |
|---|---|---|---|---|
| Free | 0 | 3 clientes, 5 plantillas, sin IA | Sí | Sí |
| Pro | €9/mes | Ilimitado + features IA | Sí | Sí |
| Team | €29/mes | Pro + colaboradores | Sí ("próximamente") | Roadmap post-MVP |

**Decisión necesaria:** confirmar precios y qué incluye cada tier. L16 lo pinta, L17 lo implementa. Tienen que coincidir.

---

## 3. Stack de hosting

**Propuesta:** Vercel Hobby + disclaimer honesto sobre ToS.

Razón: Vercel Hobby prohíbe uso comercial, pero como proyecto personal de aprendizaje funciona. Se enseña al alumno a:

- Leer ToS antes de comprometerse con un stack.
- Delegar esa lectura al agente como caso de uso real.
- Conocer los caminos de salida cuando deje de ser personal: Vercel Pro $20/mes/desarrollador, o migrar a Cloudflare Pages + Workers (gratis para uso comercial), o Netlify.

**Decisión necesaria:** confirmar Vercel Hobby con disclaimer, o pivotar a Cloudflare desde el inicio para que el alumno pueda monetizar sin gotchas.

---

## 4. Identidad visual compartida

**Propuesta:** el `design.md` que el alumno destila en L16 fase 3 se reutiliza en L17 para que la app tenga la misma identidad que la landing.

**Decisión necesaria:** confirmar que L17 lee este artefacto como contexto del agente al construir el dashboard.

---

## 5. Skill de auditoría SEO

**Propuesta:** el alumno la construye en L16 fase 8 y opcionalmente la reutiliza en L17 antes de deploy.

**Pregunta abierta:** ¿se construye realmente en L16 (caso práctico) o se referencia desde L16 y se construye en L15 (Skills) del tronco común? La segunda opción es más limpia conceptualmente pero requiere que L15 esté terminada antes.

**Decisión necesaria:** ubicación canónica de la construcción de la Skill.

---

## 6. Idioma de la UI del producto

**Propuesta:** español, alineado con el programa.

Alternativas:

- Solo inglés (más realista profesionalmente, audiencia global).
- Bilingüe con i18n (sobreingeniería para MVP).

**Decisión necesaria:** fijar idioma. Afecta a copy de la landing (L16) y de la app (L17).

---

## 7. Plan Team como "próximamente"

**Propuesta:** mostrarlo en la landing como roadmap aunque L17 no lo implemente.

**Justificación pedagógica:** enseña al alumno cómo se comunica un plan que todavía no existe, decisión real de producto.

**Decisión necesaria:** ¿lo mostramos o lo escondemos hasta que exista?

---

## 8. Coordinación de timing

L16 y L17 son las dos lecciones del track Fullstack que el alumno hace en orden. Para que la narrativa funcione:

- L16 debe terminar con el `design.md` listo y la landing pública con el pricing.
- L17 debe arrancar leyendo el `design.md` y referenciando el pricing visual.

**Decisión necesaria:** confirmar que esta secuencia funciona en el calendario de grabación.

---

*Cierre de este documento: cuando todas las decisiones de aquí estén marcadas como resueltas, las dos lecciones quedan desbloqueadas para grabación.*
