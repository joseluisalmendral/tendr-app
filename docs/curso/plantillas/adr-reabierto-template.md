# ADR-007 · Default model assignment per feature

> Decisión arquitectónica versionada. Reabierta en F10 con datos reales del primer periodo en producción.

---

## Estado

Aceptada (revisión 1 aplicada {fecha} basada en datos de Langfuse)

## Fecha original

{YYYY-MM-DD en F7}

## Contexto

Cada feature IA de Tendr necesita un default cuando un workspace nuevo se crea (antes de que el usuario abra `/settings/ai` y elija explícitamente).

## Decisión original (F7)

`default_per_feature` para las cuatro features iniciales:

| Feature | Provider | Model |
|---|---|---|
| adapt_template | openai | gpt-5.5 |
| summarize | openai | gpt-5.5 |
| suggest | openai | gpt-5.5 |
| extract_document | openai | gpt-5.5 |

Justificación: cubre todas las capabilities con calidad alta y latencia razonable.

## Criterio de revisión (escrito en F7)

> Reabrir si el coste medio por workspace al mes en `ai_usage_ledger` supera X EUR, o si Langfuse muestra que la latencia/calidad de alguna feature no justifica el coste del modelo elegido.

---

## Revisión {fecha en F10}

### Datos observados

Tras 48h con tráfico real / simulado controlado, observado en Langfuse + `ai_usage_ledger`:

| Feature | Modelo actual | Coste medio /workspace /mes proyectado | Latencia P95 | Calidad subjetiva |
|---|---|---|---|---|
| adapt_template | gpt-5.5 | X EUR | Y ms | OK · respuestas elaboradas justifican el modelo |
| summarize | gpt-5.5 | X EUR | Y ms | OK |
| **suggest** | **gpt-5.5** | **Z EUR** | **Y ms** | **Overkill · outputs típicamente < 100 tokens, no requieren razonamiento profundo** |
| extract_document | gpt-5.5 | X EUR | Y ms | OK · necesita PDF nativo + razonamiento estructurado |

### Análisis

La feature `suggest` consume coste relativo alto para una tarea simple: una sugerencia corta basada en estado del caso. GPT-5.5 está sobredimensionado.

### Nueva decisión

Cambiar `default_per_feature` para `suggest`:

- Antes: `{ provider: 'openai', modelId: 'gpt-5.5' }`.
- Después: `{ provider: 'anthropic', modelId: 'claude-haiku-4-5' }` (o `{ provider: 'openai', modelId: 'gpt-5.4-mini' }` según resultado del rollout).

Justificación:

- **Coste:** notablemente menor en output tokens. GPT-5.5 cuesta $30 por millón de tokens de output frente a $1.25 de Claude Haiku 4.5, una diferencia grande para una tarea que solo emite sugerencias cortas.
- **Latencia esperada:** 200-400ms vs 800-1500ms.
- **Calidad equivalente:** benchmarks públicos muestran paridad para tareas cortas tipo "recomienda siguiente acción dado estado X". Los outputs de 'suggest' son cortos, donde Haiku 4.5 o GPT-5.4-mini rinden parecido a GPT-5.5.

### Plan de aplicación

**NO** aplicar al 100% de golpe. Rollout con feature flag `ai_default_model_suggest_v2` en PostHog según ADR-008 (creado al mismo tiempo que esta revisión):

1. Día 0: flag al 5%.
2. Día 2: 25% si North Star tracking y guardrails OK.
3. Día 4: 100% si idem.
4. Si en cualquier salto algo va mal: apagar el flag, vuelta a v1 sin redeploy.

North Star + guardrails detallados en ADR-008.

### Workspaces ya creados

Los workspaces que han elegido manualmente un modelo para `suggest` (con `setFeatureModel`) NO se ven afectados. El cambio del default solo aplica a workspaces que usan el resolveDefaultModel (sin entrada en `ai_feature_model_mapping`).

### Referencias

- Langfuse dashboard: <https://cloud.langfuse.com/project/tendr-app/traces?feature=suggest>
- `ai_usage_ledger` query: ver `docs/queries/cost-by-feature.sql`
- ADR-008: rollout del flag con guardrails y North Star.
- Patrón "default vs override manual": ver `lib/ai/get-model-for-feature.ts`.

---

## Criterio de revisión (vigente)

- Reabrir si tras 30 días con `suggest` en Haiku 4.5 o GPT-5.4-mini la calidad subjetiva o las quejas en `audit_log` indican que un % no trivial de outputs son insuficientes.
- Reabrir si aparece un modelo nuevo con coste/calidad superior al de Haiku para tareas cortas.
- Reabrir si el cron de manifest refresh (roadmap) detecta deprecación de uno de los dos candidatos.

---

*ADR-007. Última revisión: {fecha F10}.*
