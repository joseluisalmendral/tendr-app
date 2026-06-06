# Spec MVP · ReadStack (producto inventado · ejemplo de referencia)

> Ejemplo de un spec MVP relleno para el mismo producto del `jtbd-ejemplo.md`. Léelo antes de empezar tu propio `spec.md`. El formato es el de la plantilla; el contenido es ficticio.

---

## 1. Resumen ejecutivo

ReadStack es un capturador y planificador semanal de lectura técnica para devs senior. Captura posts desde browser y Slack, los prioriza por afinidad temática con los intereses recientes del usuario, y sugiere 2 posts cada lunes.

---

## 2. JTBD de referencia

Ver `jtbd.md`. El contrato es:

> Cuando bookmarkeo un post técnico que quiero leer sin tiempo en el momento, quiero que ReadStack lo capture, lo priorice por afinidad temática y me sugiera 2 posts cada lunes, para que no se me pasen los más importantes en el ruido de mis 50 tabs abiertas.

---

## 3. Alcance MVP · qué entra

### 3.1 Captura

- Extensión Chrome con atajo `cmd+shift+S` para añadir el tab activo.
- Comando Slack `/readstack <url>` para añadir desde un canal o DM.
- Auto-fetch de título, autor, fecha y reading time.

### 3.2 Pila priorizada

- Lista cronológica con score de afinidad calculado por temas detectados.
- Filtros básicos: por estado (sin leer / pospuesto / leído / descartado) y por tema.
- Búsqueda full-text en título y primeros 500 chars del post.

### 3.3 Sugerencia semanal

- Email los lunes a las 9:00 hora local del usuario con 2 posts recomendados.
- Los 2 posts mezclan: 1 reciente con alta afinidad, 1 del backlog que envejece.

### 3.4 Marcado

- Estados por post: sin leer, pospuesto, leído, descartado.
- Botón "marcado en 1 click" desde el email semanal.

### 3.5 Cuenta

- Login con GitHub OAuth.
- Sync local-first con backup opcional vía Gist privado.

---

## 4. Alcance fuera · qué NO entra (roadmap)

| Item | Por qué no entra ahora | Cuándo se reabre |
|---|---|---|
| Equipos compartidos (workspaces) | Modelo de datos cambia mucho; primero validar usuario individual | Tras 1.000 MAU |
| AI summarization de posts | Coste de IA opaco al usuario; modelo de pricing aún no definido | Post-pricing |
| Podcasts y vídeos largos | Pipeline de extracción distinto; primero textos | V2 |
| App móvil nativa | Esfuerzo alto; web responsive cubre 90% del caso | Tras 3 meses de uso real |
| Integración Pocket | Migración masiva tiene compliance; primero captura fresca | Post-MVP |
| Recomendaciones cross-usuario | Privacy reviewable; primero un usuario solo | Post-pricing |
| Modo offline en extensión | Service worker requiere otra arquitectura | V2 |
| Export a PDF / EPUB | Casuística baja en validaciones tempranas | Tras feedback explícito |

---

## 5. Decisiones de producto clave (ADR-light embebido)

### 5.1 Local-first con sync opcional · NO SaaS puro

- **Qué se decide:** los datos del usuario viven en IndexedDB local. El sync a backend es opcional vía Gist privado del propio usuario.
- **Por qué:**
  - Privacy: los temas que el usuario lee revelan lo que está aprendiendo. No queremos ese dato en nuestra BD.
  - Velocidad: la app es instantánea sin red.
  - Confianza: el usuario nunca pierde acceso a sus posts aunque el producto cierre.
- **Implicaciones:** schema en IndexedDB con migraciones cliente, conflict resolution si syncan en varios dispositivos, recomendación semanal computa en cliente (o vía edge function efímera que no persiste).

### 5.2 Sugerencia semanal por email · NO push notifications

- **Qué se decide:** las recomendaciones llegan los lunes por email, no por push.
- **Por qué:**
  - Audiencia de dev senior consume email técnico (newsletters); push lo encuentra ruidoso.
  - Email es asincrónico: el usuario lee cuando puede el lunes o el martes.
  - Métricas de open rate y click-through están maduras; push tendría que reimplementarse.
- **Implicaciones:** Resend (o equivalente) en stack desde día 1; template HTML compatible con dark mode de clientes mail.

---

## 6. Criterios de éxito del MVP

Medibles a las 4 semanas de lanzamiento.

- El 80% de usuarios abren al menos 1 de las 4 emails semanales recibidas.
- La tasa de "marcado como leído" sobre posts sugeridos supera el 30% en la semana 4.
- Menos del 5% de usuarios solicitan export y cancelan dentro de los primeros 30 días.
- Tiempo medio de captura (extensión activada → post guardado) por debajo de 5 segundos.

---

## 7. Restricciones

| Restricción | Implicación práctica |
|---|---|
| Solo Chrome y Slack en MVP | Firefox/Safari y Discord/Teams quedan fuera. Documentado en landing. |
| Sin app móvil | Web responsive cubre lectura desde móvil; captura desde móvil solo vía PWA "share to". |
| Local-first | Si el usuario borra cookies, pierde acceso salvo que tenga sync activado. README lo avisa. |
| Sin AI en MVP | La afinidad temática se computa por tags + TF-IDF clásico, no por embeddings. |
| Free unlimited durante MVP | Sin pricing tier; validamos uso antes de monetizar. |

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Pocket libera versión similar | Acelerar diferencial (afinidad temática) y publicar antes |
| Tasa de email muy baja (<40% open) | A/B test del subject + hora del lunes; fallback a Slack DM nativa |
| Usuario captura mucho y nunca lee | UX honesto: la app dice "tienes 200 sin leer; ¿purgas?" cada 4 semanas |

---

## 9. Revisiones

| Fecha | Cambio | Razón |
|---|---|---|
| 2026-05-28 | Versión inicial | Cierre de F1 ficticio del producto ejemplo |

---

*Ejemplo. ReadStack no existe. Sirve solo para que veas cómo se ve un spec MVP bien rellenado antes de hacer el tuyo.*
