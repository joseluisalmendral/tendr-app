# Tendr · spec de producto

> Documento de producto. Sirve de contexto persistente al agente cuando redacta copy, features, FAQ, pricing y variantes. Vive en `docs/product.md` del repo del proyecto. El agente lo lee SIEMPRE antes de escribir contenido sustantivo en la landing.

**Estado:** documento vivo. Actualizar cuando el producto cambie.

---

## One-liner

Tendr es un mini-CRM con IA para profesionales B2B junior que gestionan clientes externos. Organiza clientes, casos y notas con asistencia inteligente, sin la sobrecarga de Salesforce ni la rigidez de Notion.

---

## Quién lo usa

| Perfil | Edad típica | Por qué le aporta |
|---|---|---|
| Customer success / account manager junior | 25-32 | Reconoce el modelo Salesforce/HubSpot pero más rápido de aprender y gratis para empezar |
| Ventas junior / business development | 22-28 | Practica el modelo de oportunidades + pipeline kanban sin la curva de Salesforce |
| Project manager junior | 25-35 | Casos por cliente con estados claros y vista global kanban |
| Consultor junior | 25-35 | Plantillas de onboarding, propuestas y comunicación con voz propia |
| Marketing ops | 25-35 | Sistema de plantillas con marca y variables |
| Freelance en paralelo | 28-40 | Lo usa de verdad como herramienta personal para su cartera de clientes |

Tendr **NO** está pensado para enterprise, equipos de más de 10 personas, ni roles senior con CRM corporativo ya implantado.

---

## Qué hace

| Bloque | Detalle |
|---|---|
| Clientes | CRUD con info, contactos, etiquetas, estado activo/archivado |
| Casos / oportunidades | Por cliente, con pipeline de estados (prospect → propuesta → en curso → cerrado) |
| Kanban global | Vista transversal de todos los casos por estado |
| Notas | Por cliente y por caso, en markdown |
| Documentos | Por cliente, subidos a Supabase Storage. AI extractor saca deals y next steps |
| Plantillas de email | Con marca propia, variables del cliente, preview |
| AI features | Adapta plantillas a contexto del cliente, resume relación, sugiere próxima acción, extrae info de documentos |
| Pagos | Free, Pro y Team con Stripe |

---

## Qué NO hace (anti-scope)

- No es un CRM enterprise. Sin SSO, sin permisos granulares por rol, sin integraciones de empresa grande.
- No automatiza email marketing. Las plantillas son para envío personal, no para campañas masivas.
- No tiene módulo de facturación. Las propuestas son texto markdown, no documentos legales.
- No integra con Salesforce ni HubSpot. Tendr es alternativa para perfil junior y freelance.
- No reemplaza Slack ni email. Las notas son internas tuyas, no canal de comunicación con el cliente.

---

## Pricing

| Plan | Precio | Incluye | Estado en L17 |
|---|---|---|---|
| Free | 0€ | 3 clientes, 5 plantillas, sin IA | Implementado |
| Pro | 9€/mes | Ilimitado + features IA con tu BYO key | Implementado |
| Team | 29€/mes | Pro + colaboradores hasta 10 | Próximamente (visible en landing) |

El plan Team aparece en la landing con badge "próximamente" para enseñar cómo se comunica un roadmap honesto sin engañar al usuario.

**Modelo de coste de IA.** El usuario aporta su propia API key (OpenAI, Anthropic, Gemini, DeepSeek, Kimi) cifrada con envelope encryption AES-256-GCM. El coste de IA es del usuario, no de Tendr. Patrón premium B2B que usan Cursor, Linear AI y Notion AI.

---

## JTBD · qué tarea hace contigo

**Cuando** llevo más de 3-5 clientes externos y empiezo a perder hilo de qué casos tengo abiertos con cada uno,
**quiero** una herramienta que me deje ver de un vistazo dónde estoy con cada cliente y qué toca hacer hoy,
**para que** no se me caigan oportunidades ni tareas, y pueda comunicarme con la marca personal que necesito sin reescribir cada email desde cero.

---

## Diferencial vs competencia conocida

| Herramienta | Por qué no encaja al público de Tendr | Por qué Tendr sí |
|---|---|---|
| **Salesforce / HubSpot** | Diseñados para equipos de ventas grandes, configuración pesada, caros | Ligero, individual o equipo pequeño, gratis para arrancar |
| **Notion / Airtable** | Flexibles pero no opinionados; tienes que diseñar tu propio CRM | Modelo CRM ya hecho con clientes, casos, kanban y plantillas listas |
| **Pipedrive** | Centrado solo en pipeline de ventas | Pipeline + casos + plantillas + AI en una pieza |
| **CRM caseros en Excel** | Sin estructura, sin pipeline, sin templates, sin IA | Estructura clara y completa desde el primer día |

---

## Tono de voz

Heredado del `design.md` y anclado al producto:

- **Directo y profesional cercano**, no corporativo.
- **Beneficio antes que feature**: "encuentra el caso por estado en 2 clicks", no "kanban interactivo con drag-and-drop".
- **Sin jerga de Salesforce**: oportunidad, lead, MQL, SQL son palabras de empresa grande. Tendr habla de **cliente** y **caso**.
- **Sin promesas vacías**: "te organizas mejor", "no se te caen tareas", "te ahorras 20 minutos al día" son honestas si las puede defender el producto.
- **Español neutro**, sin voseo. UI del producto solo en español en MVP (decisión `preguntas-compartidas.md §6`).

---

## FAQ semilla · 10 preguntas reales del público

Estas son las 10 preguntas que la audiencia se hace antes de probar Tendr. La sección FAQ de la landing las responde con respuesta directa para SEO y para citaciones de LLMs (GEO).

1. **¿Qué es Tendr y para quién?**
   Mini-CRM para profesionales B2B junior y freelances que gestionan clientes externos sin la complejidad de Salesforce.

2. **¿Qué lo diferencia de HubSpot o Salesforce?**
   Pensado para una persona o equipo pequeño, no para empresa grande. Arranca gratis, sin configuración de semanas.

3. **¿Cuánto cuesta?**
   Free con 3 clientes y 5 plantillas. Pro 9€/mes con uso ilimitado y features de IA. Team 29€/mes próximamente.

4. **¿Tengo que pagar la IA aparte?**
   No directamente a Tendr. Usas tu propia API key (OpenAI, Anthropic, Gemini, DeepSeek o Kimi). Pagas solo el consumo real de tu IA al proveedor que elijas. La key viaja cifrada con envelope encryption.

5. **¿Puedo integrar con Notion, Slack o mi email?**
   No por ahora. Tendr es independiente. Las plantillas se copian o se envían vía mailto.

6. **¿Mis datos están seguros?**
   Sí. Postgres en Supabase con RLS (Row-Level Security) activada desde el primer día. Cada usuario solo ve sus datos. API keys cifradas con envelope encryption AES-256-GCM.

7. **¿Funciona en móvil?**
   La interfaz web es responsive y funciona en móvil. No hay app nativa todavía.

8. **¿Puedo exportar mis datos si dejo de usarlo?**
   Sí. Exportación a CSV de clientes, casos y notas en cualquier momento.

9. **¿Tiene multi-idioma?**
   No en MVP. La UI es solo en español. Multi-idioma está en el roadmap futuro.

10. **¿Cómo se compara con mi CRM casero en Notion o Airtable?**
    Notion y Airtable son flexibles pero te toca diseñar tu propio CRM. Tendr llega con modelo CRM ya hecho y funcionando: clientes, casos, kanban, plantillas e IA.

---

## Cómo lo usa el agente

Cuando vas a redactar copy de la landing (F5) o variantes (F6.5), pídele al agente que lea este doc primero:

- "Lee `docs/product.md` antes de escribir el Hero. Aplica el JTBD y el diferencial."
- "Para la FAQ, parte de las 10 preguntas semilla de `docs/product.md`. Ajusta el wording al tono pero no cambies la respuesta sustantiva."
- "Si una sección no encuentra contenido aquí, dímelo antes de inventar; ampliamos este doc juntos."

---

*Documento vivo del producto Tendr. Última actualización 2026-05-28.*
