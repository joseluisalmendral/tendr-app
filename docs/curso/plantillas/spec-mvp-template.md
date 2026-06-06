# Spec MVP · {Nombre del producto}

> Documento vivo. Se versiona. Cambios mayores requieren revisión explícita. Asociado al `jtbd.md` de la misma carpeta.

---

## 1. Resumen ejecutivo

{Una línea: qué hace el producto, para quién y por qué ahora.}

---

## 2. JTBD de referencia

Ver `jtbd.md`. El contrato es:

> Cuando {situación}, quiero {capacidad}, para {resultado}.

---

## 3. Alcance MVP · qué entra

Lista por categorías. Máximo 3 bullets por categoría. Cada bullet es funcionalidad concreta, no aspiración.

### 3.1 {Categoría 1}
- {Funcionalidad concreta}
- {Funcionalidad concreta}

### 3.2 {Categoría 2}
- {Funcionalidad concreta}

### 3.3 ...

---

## 4. Alcance fuera · qué NO entra (roadmap)

Crítico. Lo que no aparece aquí, el lector asume que sí está dentro.

| Item | Por qué no entra ahora | Cuándo se reabre |
|---|---|---|
| {Item 1} | {Razón concreta} | {Trigger o fecha aproximada} |
| {Item 2} | {Razón concreta} | {Trigger o fecha aproximada} |

Mínimo 8 items realistas.

---

## 5. Decisiones de producto clave (ADR-light embebido)

### 5.1 {Decisión 1}

- **Qué se decide:** {decisión en una frase}.
- **Por qué:** {3-4 bullets con razones técnicas y de producto}.
- **Implicaciones:** {qué condiciona en el resto del producto}.

### 5.2 Modelo de costes de IA · BYO key + multi-provider

- **Qué se decide:** cada workspace mete su API key cifrada de su provider preferido (OpenAI, Anthropic, Google, DeepSeek, Kimi) y elige modelo por feature.
- **Por qué:**
  - Patrón premium B2B (Cursor, Linear, Notion AI lo hacen).
  - Transfiere el coste de IA al usuario; el producto no factura tokens.
  - Enseña abstracción real sobre providers + envelope encryption.
  - Privacidad: la key es del usuario.
- **Implicaciones:** condiciona el modelo de datos (tablas `ai_provider_configs`, `ai_feature_model_mapping`, `ai_model_manifest`, `ai_usage_ledger`) y la arquitectura IA del producto entera.

---

## 6. Criterios de éxito del MVP

Medibles por SQL o por métrica externa cuando el producto esté en producción.

- {Criterio 1 con métrica concreta}
- {Criterio 2 con métrica concreta}
- {Criterio 3 con métrica concreta}

---

## 7. Restricciones

| Restricción | Implicación práctica |
|---|---|
| Stack 100% gratuito excepto IA | Cada pieza tiene caveats de free tier (cuotas, pausa, etc.) |
| Hosting en Vercel Hobby | Prohíbe uso comercial estricto; disclaimer documentado en README |
| Supabase free tier | Pausa tras 1 semana sin actividad; despausa en 1 click |
| Stripe en sandbox | No hay cobros reales en MVP; útil pedagógicamente |
| {...} | {...} |

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| {Riesgo 1} | {Mitigación 1} |
| {Riesgo 2} | {Mitigación 2} |

---

## 9. Revisiones

| Fecha | Cambio | Razón |
|---|---|---|
| {YYYY-MM-DD} | Versión inicial | Cierre de F1 del caso |

---

*Spec MVP. Cuando un cambio modifique el alcance, añadir fila a §9 y actualizar §3/§4 según corresponda.*
