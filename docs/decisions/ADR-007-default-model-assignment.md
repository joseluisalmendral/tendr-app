# ADR-007 · Asignación de modelo por defecto por feature

> Decisión arquitectónica versionada. Cambios mayores requieren nuevo ADR que supersede a este. Este ADR nace con criterio de revisión explícito y se reabrirá en F10 con datos de Langfuse y `ai_usage_ledger`.

---

## Estado

Aceptada

## Fecha

2026-06-07

## Contexto

Cada feature IA de Tendr (`adapt_template`, `summarize`, `suggest`, `extract_document`; en F7c se añade `beautify_email` — ver Revisiones) necesita un modelo por defecto que los workspaces nuevos heredan sin configurar nada. El default vive en el seed del manifest (`db/seeds/ai_model_manifest.ts`, campo `default_for_features`) y `getModelForFeature` cae a él cuando el workspace no tiene override en `ai_feature_model_mapping`.

Restricción de producto decidida durante este ciclo: **el producto debe poder operar de extremo a extremo con la capa gratuita de la API de Gemini, sin tarjeta de crédito**. Desde abril/mayo de 2026 el free tier de Google cubre únicamente la familia Flash/Flash-Lite (Gemini 3.x Flash: 10 RPM, 250K TPM, ~1.500 req/día, contexto 1M); los modelos Pro pasaron a facturación. El resto de providers del manifest (OpenAI, Anthropic, DeepSeek, Moonshot) no ofrecen free tier de API equiparable.

Candidatos evaluados por feature (coste por 1K tokens in/out, datos verificados 2026-06-07 contra fuentes oficiales):

| Feature | Candidatos | Tradeoff |
|---|---|---|
| `adapt_template` | Sonnet 4.6 ($0.003/$0.015) · GPT-5.5 ($0.005/$0.030) · **Gemini 3.5 Flash** ($0.0015/$0.009) | Calidad de redacción vs coste y free tier; streaming en los tres |
| `summarize` | **Gemini 3.5 Flash** · Haiku 4.5 ($0.001/$0.005) · DeepSeek V4 Flash ($0.00014/$0.00028) | Tarea de baja dificultad; consistencia de una sola key gratuita |
| `suggest` | **Gemini 3.5 Flash** · DeepSeek V4 Flash · Haiku 4.5 | Feature efímera de bajo riesgo |
| `extract_document` | **Gemini 3.5 Flash + fallback pdf-parse** · Gemini 3.1 Pro ($0.002/$0.012, PDF nativo) · Sonnet 4.6 (PDF nativo) | Ningún modelo gratuito declara PDF nativo; el fallback `pdf-parse` (F6) extrae el text layer antes de la llamada |

## Decisión

`default_per_feature` para workspaces nuevos: **`google / gemini-3.5-flash` en las cuatro features**.

- `adapt_template` → `gemini-3.5-flash` (streaming, calidad suficiente para adaptación de plantillas; es la feature más visible y la primera candidata a subir de modelo si los datos lo piden).
- `summarize` → `gemini-3.5-flash` (resumen de 4-6 frases: tarea simple, Flash sobra).
- `suggest` → `gemini-3.5-flash` (sugerencia efímera, no persiste; el riesgo de calidad es el más bajo del producto).
- `extract_document` → `gemini-3.5-flash` **con fallback `pdf-parse` activo** (el extractor convierte el PDF a texto antes de la llamada; se renuncia a la comprensión visual del documento).

Justificación transversal: una única API key gratuita de Google cubre todo el producto en desarrollo y en la validación del curso; coste real €0; el free tier (10 RPM / ~1.500 req/día) supera con margen la frecuencia de uso de un CRM unipersonal. El manifest conserva los cinco providers y el model picker per-feature permite a cualquier workspace hacer override inmediato (`setFeatureModel`, con auditoría en `audit_log`).

## Tradeoffs aceptados

1. **Sin PDF nativo en `extract_document`**: el fallback `pdf-parse` pierde layout, tablas complejas y escaneados. Aceptado porque los documentos del caso de uso (presupuestos/briefs digitales simples) tienen text layer suficiente.
2. **Calidad de redacción Flash < Sonnet/GPT-5.5 en `adapt_template`**: aceptado a cambio de coste €0; es exactamente lo que el criterio de revisión vigila (señal de latencia/calidad).
3. **Techo operativo del free tier** (10 RPM, ~1.500 req/día): suficiente hoy; su agotamiento es una señal medible (errores `RATE_LIMIT`), no un fallo silencioso.
4. **Concentración en un provider**: todo el producto depende por defecto de Google. Mitigado por la abstracción multi-provider (ADR-003) y el override per-feature: cambiar de provider es una fila en `ai_feature_model_mapping`.

## Consecuencias

- El seed del manifest declara `default_for_features` apuntando las cuatro features a `gemini-3.5-flash`; `getModelForFeature` lo usa como fallback cuando no hay override.
- `setFeatureModel` acepta para `extract_document` modelos sin `supports_pdf` mientras el fallback `pdf-parse` esté activo en el extractor.
- El ledger `ai_usage_ledger` registra el coste TEÓRICO calculado desde el manifest aunque la key sea free tier: es la métrica que alimenta el criterio de revisión.
- Onboarding de un workspace nuevo: una sola key (Google) habilita las cuatro features; los demás providers quedan visibles como "No configurado".

## Criterio de revisión

Reabrir este ADR en F10 (o antes) si se cumple **cualquiera** de los tres umbrales:

1. **Coste teórico**: coste medio por workspace/mes en `ai_usage_ledger` > **€3** (lo que se pagaría si se facturara: el uso ya justificaría evaluar un modelo de pago).
2. **Techo del free tier**: > **5%** de las llamadas IA de una semana terminan en `RATE_LIMIT` (error curado, filtrable en Langfuse por `metadata.feature`).
3. **Calidad/latencia en Langfuse**: `extract_document` con campos vacíos o erróneos en > **10%** de los traces, o p95 de time-to-first-token de `adapt_template` > **5s**.

## Revisiones

### 2026-06-07 · 5.ª feature `beautify_email` (F7c PR-F7C-4)

Se añade `beautify_email` como quinta feature IA (decision Engram #777): transforma el texto de una adaptación ya generada en un email HTML seguro para clientes de correo, vía `generateObject` (no streaming) con paleta curada. **El default sigue siendo `google / gemini-3.5-flash`** — el criterio "free-tier-first" se mantiene sin cambios: una sola key gratuita de Google cubre ahora las CINCO features. La feature impone requisitos de capability vacíos (`{}`) en el model picker (entra texto plano, sale HTML estructurado: ni streaming ni PDF), por lo que cualquier modelo del manifest es elegible para el override per-feature.

Esto NO altera la decisión ni los tradeoffs originales (sigue siendo Flash por defecto, override per-feature disponible). El coste de `beautify_email` se registra en `ai_usage_ledger` con su propio `feature='beautify_email'` (cost_microcents + legacy cost_cents) y es medible por separado en Langfuse (`metadata.feature`), de modo que alimenta los mismos umbrales del criterio de revisión de F10.

## Referencias

- `db/seeds/ai_model_manifest.ts` — seed del manifest con `default_for_features`.
- ADR-003 — capa de abstracción Vercel AI SDK (multi-provider BYO key).
- [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) y [pricing](https://ai.google.dev/gemini-api/docs/pricing) — free tier verificado 2026-06-07.
- `docs/curso/plan.md` §11.7 bloque B y §11.10 — loop observabilidad → decisión (reapertura en F10).
- Engram `sdd/tendr-f7-ai-platform/manifest-research` — verificación de IDs, costes y capabilities (2026-06-07).
