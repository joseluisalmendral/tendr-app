# Spec MVP · Tendr

> Documento vivo. Se versiona. Cambios mayores requieren revisión explícita. Asociado al `jtbd.md` de la misma carpeta.

---

## 1. Resumen ejecutivo

Tendr es un mini-CRM con IA para profesionales B2B junior que gestionan clientes externos: organiza clientes, casos y notas con asistencia inteligente, sin la sobrecarga de Salesforce ni la rigidez de Notion, en el momento en que su sistema ad-hoc (Excel + Outlook + post-its) deja de escalar.

---

## 2. JTBD de referencia

Ver `jtbd.md`. El contrato es:

> Cuando llevo más de 5-6 clientes externos y empiezo a perder hilo de qué casos tengo abiertos con cada uno, quiero una herramienta que me deje ver de un vistazo dónde estoy con cada cliente y qué toca hacer hoy, para que no se me caigan oportunidades ni tareas, y pueda comunicarme con la marca personal que necesito sin reescribir cada email desde cero.

---

## 3. Alcance MVP · qué entra

Lista por categorías. Máximo 3 bullets por categoría. Cada bullet es funcionalidad concreta, no aspiración.

### 3.1 Clientes
- CRUD completo con info, contactos y etiquetas
- Estado activo/archivado

### 3.2 Casos / oportunidades
- Casos por cliente con pipeline de estados: prospect → propuesta → en curso → cerrado
- Kanban global: vista transversal de todos los casos por estado

### 3.3 Notas
- Por cliente y por caso
- En markdown

### 3.4 Documentos
- Subida por cliente a Supabase Storage

### 3.5 Plantillas de email
- Con marca propia y variables del cliente
- Preview antes de usar

### 3.6 AI features
- Adapta plantillas al contexto del cliente
- Resume la relación y sugiere próxima acción
- Extrae deals y next steps de documentos subidos

### 3.7 Pagos
- Planes Free (3 clientes, 5 plantillas, sin IA) y Pro (ilimitado + IA con BYO key) con Stripe en test mode y webhook firmado
- Team visible como "próximamente", no implementado

### 3.8 Dashboard de inicio
- Home con contadores básicos: clientes activos, casos abiertos por estado, próximas acciones pendientes
- Sin gráficas históricas ni filtros avanzados: solo el estado actual de la cartera

---

## 4. Alcance fuera · qué NO entra (roadmap)

Crítico. Lo que no aparece aquí, el lector asume que sí está dentro.

| Item | Por qué no entra ahora | Cuándo se reabre |
|---|---|---|
| Multi-usuario por workspace (plan Team) | El modelo de datos y RLS del MVP son mono-usuario; colaboración multiplica la complejidad de permisos | Con base de usuarios Pro pagando y demanda real de equipos; señalizado como "próximamente" |
| Integración con Outlook/Gmail (envío desde la app) | OAuth + scopes de envío + deliverability es un proyecto entero; el MVP resuelve con copy/mailto | Cuando la métrica de uso de plantillas valide que el flujo de email es core |
| Integraciones Slack/Notion | Anti-scope: Tendr es independiente; cada integración es superficie de mantenimiento | Post-MVP, si el churn muestra que la falta de integraciones expulsa usuarios |
| App nativa móvil | La web responsive cubre el caso de uso; nativo duplica el coste de cada feature | Si analytics muestra uso móvil sostenido con fricción real |
| Multi-idioma | Decisión cerrada: UI solo en español en MVP; i18n desde el día 1 ralentiza todo | Demanda de mercado no hispanohablante |
| Email marketing / campañas masivas | Anti-scope: las plantillas son para envío personal; campañas exigen compliance (listas, bajas) | Probablemente nunca — cambiaría la identidad del producto |
| Facturación / propuestas legales | Las propuestas son markdown, no documentos legales; facturación es otro dominio (impuestos, numeración) | Si el perfil freelance crece y lo pide; antes se integraría con terceros |
| SSO y permisos granulares por rol | Anti-scope: eso es enterprise, y Tendr explícitamente no es para enterprise | Nunca en la visión actual — reabrirlo implicaría pivotar de público |
| Integración con Salesforce/HubSpot | Tendr es alternativa a ellos para el perfil junior; integrarse diluye el posicionamiento | Nunca — es decisión de identidad, no de capacidad |
| Cobros reales (Stripe production) | MVP en test mode por decisión pedagógica y ToS de Vercel Hobby | En el paso a producción real, con hosting que permita uso comercial |
| Dashboards analíticos avanzados (históricos, tendencias, filtros) | El home del MVP trae solo contadores del estado actual; sin datos acumulados, las gráficas históricas son decoración | Cuando existan ≥3 meses de datos reales de casos por usuario |

---

## 5. Decisiones de producto clave (ADR-light embebido)

### 5.1 {Decisión 1}

- **Qué se decide:** {decisión en una frase}.
- **Por qué:** {3-4 bullets con razones técnicas y de producto}.
- **Implicaciones:** {qué condiciona en el resto del producto}.

### 5.2 Modelo de costes de IA · BYO key + multi-provider

- **Qué se decide:** cada workspace mete su API key cifrada de su provider preferido (OpenAI, Anthropic, Gemini, DeepSeek, Kimi) y elige modelo por feature.
- **Por qué:**
  - Patrón premium B2B (Cursor, Linear, Notion AI lo hacen).
  - Transfiere el coste de IA al usuario; el producto no factura tokens.
  - Enseña abstracción real sobre providers + envelope encryption.
  - Privacidad: la key es del usuario.
- **Implicaciones:** condiciona el modelo de datos (tablas `ai_provider_configs` y `ai_feature_model_mapping`, que F3 implementará) y la arquitectura IA del producto entera.

---

## 6. Criterios de éxito del MVP

Medibles por SQL o por métrica externa cuando el producto esté en producción.

- El 80% de los workspaces que crean su primer cliente registran al menos un caso en las primeras 24 horas (SQL: `clients` × `cases` por `created_at`).
- El 60% de los workspaces que configuran al menos un cliente vuelven al día siguiente, midiendo actividad como escritura en BD: nota, caso o email (SQL: timestamps de actividad por workspace en días consecutivos).
- La mediana de workspaces activos usa 3 o más plantillas por semana, con tendencia creciente las primeras 4 semanas (SQL: eventos de uso de plantilla por workspace/semana).
- El 70% de los workspaces Pro con BYO key configurada ejecutan al menos una feature de IA por semana (Langfuse: traces por workspace y feature, denominador en `ai_provider_configs`).

---

## 7. Restricciones

| Restricción | Implicación práctica |
|---|---|
| Stack 100% gratuito excepto IA (BYO key del usuario) | Cada pieza tiene caveats de free tier; sin la key del usuario las features IA no funcionan — la UI debe degradar bien, no romper |
| Hosting en Vercel Hobby | Prohíbe uso comercial (Fair Use Guidelines); disclaimer documentado en README con caminos de salida (Vercel Pro, Cloudflare, Netlify) |
| Supabase free tier | Pausa tras 1 semana sin actividad (despausa en 1 click); al superar 500MB la BD pasa a read-only sin error explícito |
| Stripe en sandbox | No hay cobros reales en MVP; webhooks y Checkout se prueban con test cards |
| Inngest free tier (50k runs/mes) | El extractor de documentos y los jobs IA consumen runs; suficiente para aprendizaje, vigilar si se automatizan recordatorios |

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| RLS mal configurada expone datos entre workspaces | Policies por `workspace_id` en todas las tablas operativas + tests de aislamiento cross-tenant en CI desde F3 |
| Usuario Pro no configura su BYO key y el diferencial IA queda sin uso | Onboarding guiado de la key con validación; criterio de éxito 4 (§6) lo monitoriza vía Langfuse |
| Promoción anónimo → autenticado falla en silencio y pierde data | Tests del flujo de promoción en F4; verificar que workspace, clientes y casos sobreviven a la promoción |
| Trabajo IA largo se cuelga o excede el timeout de Vercel | Jobs persistidos con Inngest + estado visible vía Realtime; nunca IA larga en Server Actions |
| Priorización plana (33 de 34 tareas en P0) sin válvula si el time-box aprieta | Revisión de alcance al cierre de cada fase; si una fase se desborda, renegociar P0 → P1 explícitamente antes de continuar |
| Supabase free tier pausa el proyecto o entra en read-only sin error claro | Despausa documentada (1 click); vigilar tamaño de BD; restricción documentada en §7 |

---

## 9. Revisiones

| Fecha | Cambio | Razón |
|---|---|---|
| 2026-06-06 | Versión inicial | Cierre de F1 del caso |

---

*Spec MVP. Cuando un cambio modifique el alcance, añadir fila a §9 y actualizar §3/§4 según corresponda.*
