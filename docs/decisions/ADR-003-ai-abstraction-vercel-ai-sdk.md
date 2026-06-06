# ADR-003 · Capa de abstracción IA: Vercel AI SDK

> Decisión arquitectónica versionada. Cambios mayores requieren nuevo ADR que supersede a este.

---

## Estado

Aceptada

## Fecha

2026-06-06

## Contexto

El spec de Tendr exige multi-provider con BYO key: cada workspace aporta su propia API key (OpenAI, Anthropic, Google, DeepSeek, Kimi/Moonshot) cifrada con envelope AES-256-GCM, y elige modelo por feature (manifest `ai_model_manifest` + mapping `ai_feature_model_mapping`, ADR-001/F3). Sin una capa de abstracción, cada feature IA tendría que implementarse N veces —una por provider— y cada provider nuevo costaría días. La capa se usará en F6 (extractor de documentos con salida estructurada, ejecutado en Inngest functions) y F7 (adaptador de plantillas con streaming).

Requisitos concretos: (1) instanciar el provider en runtime con la key del workspace, no con env vars globales; (2) salida estructurada validada; (3) streaming; (4) file input nativo (PDF) para capability routing; (5) tool calling disponible para evolución.

## Decisión

Adoptar Vercel AI SDK (paquetes `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/deepseek`) como única capa de acceso a LLMs. Se pinea la línea estable **v5.x**; la v6 está en beta (6.0.0-beta.128 a fecha de este ADR) y se migrará cuando sea estable —la v6 añade streaming de objetos parciales vía `Output.object`, relevante para F7—.

Features verificadas que justifican la elección (todas verificadas 2026-06-06 vía Context7):

- **BYO key por request**: `createOpenAI` / `createAnthropic` / `createGoogle` / `createDeepSeek` aceptan `apiKey` en opciones → el provider se instancia por request con la key descifrada del workspace; nunca keys en env vars de aplicación.
- **`generateObject` con schema Zod** → JSON validado sin parsing manual (extractor F6).
- **`streamText`** → streaming de plantillas (F7).
- **File input nativo**: message parts `{ type: 'file', mediaType: 'application/pdf' }`; Anthropic, Google y OpenAI aceptan PDF directo → habilita capability routing por `supports_pdf` del manifest.
- **Tool calling** disponible (no usado en MVP, margen de evolución).
- **Providers soportados**: OpenAI, Anthropic, Google, DeepSeek; Kimi/Moonshot vía provider OpenAI-compatible.

## Alternativas consideradas

| Opción | Tradeoff principal |
|---|---|
| DeepAgents (`deepagentsjs`, sobre LangGraph) | Descartada: foco en agentes multi-step con planning, sub-agentes, VFS y checkpointers; las 4 features de Tendr son llamadas cortas de un solo paso y el anti-scope del spec excluye agentes en el runtime del producto. Su multi-provider pasa por clases LangChain distintas por provider (`ChatOpenAI`, `ChatAnthropic`…), sin la abstracción uniforme requerida. Se referencia para el track de AI Engineering. |
| SDKs nativos por provider | Descartada: control total y acceso día-cero a features propietarias (prompt caching de Anthropic, Responses API de OpenAI), pero con 5 providers cada feature transversal (streaming, structured output, file input, errores) son 5 implementaciones más una capa de normalización propia —un mini-SDK casero peor testeado—. Rompe la abstracción multi-provider que el spec exige. |
| Vercel AI SDK (elegida) | Gana por abstracción uniforme multi-provider, BYO key por request, salida estructurada con Zod, streaming y file input nativo en una sola superficie. |

## Tradeoffs aceptados

- **Transición v5→v6 en curso**: se pinea v5 estable; la deuda de migración se asume y se fecha.
- **La abstracción tiene fugas**: los quirks por provider se filtran (ejemplo verificado: el structured output de OpenAI exige `.nullable()` en el schema Zod, no `.optional()`, o lanza `NoObjectGeneratedError`). Multi-provider no exime de testear por provider.
- **Acoplamiento al ecosistema Vercel** en la capa más estratégica del producto (mitigación: el SDK es open source y la superficie usada —`generateObject` / `streamText` / file parts— es portable).

## Consecuencias

Qué condiciona esta decisión en el resto del producto.

- Fases del caso afectadas: **F6** y **F7**.
- **F6 (extractor)**: `generateObject` con schema Zod dentro de Inngest functions —nunca en Server Actions, timeout Hobby (ADR-001)—; capability routing previo: si el modelo del workspace soporta PDF (manifest `supports_pdf`), file part directo; si no, extracción de texto previa con `pdf-parse`.
- **F7 (plantillas)**: `streamText` para el adaptador con la voz del usuario; instancia de provider creada por request con la key BYO descifrada (envelope AES-256-GCM; plaintext nunca en BD, logs ni cliente).
- Toda llamada lleva trace de Langfuse (integración oficial con AI SDK, ADR-001) y registra coste en `ai_usage_ledger`.
- Los quirks por provider se documentan junto al manifest a medida que aparezcan (empezando por el de `.nullable()` de OpenAI).
- Kimi/Moonshot se integra vía endpoint OpenAI-compatible; si su divergencia crece, se evalúa provider dedicado en un ADR posterior.
- Camino de salida: la superficie usada es portable; migrar implicaría reescribir la capa de instanciación de providers y la normalización de errores.

## Criterio de revisión

Bajo qué condiciones se reabre esta decisión.

- Release estable de AI SDK v6 (dispara la migración planificada).
- Divergencia de Kimi/Moonshot respecto al contrato OpenAI-compatible.
- Necesidad real de features propietarias no expuestas por la abstracción.
- Aparición de agentes multi-step en el roadmap (reabriría la comparación con DeepAgents).

## Referencias

Todas verificadas el 2026-06-06.

- Context7 `/vercel/ai` (`generateObject`, `streamText`, `createAnthropic` con `apiKey`, file parts PDF, versiones 5.x / 6.0.0-beta.128)
- Context7 `/langchain-ai/deepagentsjs` (`createDeepAgent` sobre LangGraph)
- https://sdk.vercel.ai/docs
- ADR-001 (docs/decisions/ADR-001-architecture.md), capas observabilidad y jobs.
- ADR-004 futuro (BYO key envelope, F7).

---

*ADR-003. Última revisión: 2026-06-06.*
