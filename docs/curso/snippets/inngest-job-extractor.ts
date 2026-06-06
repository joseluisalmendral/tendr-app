// Inngest function extractDocument · F6
// Patrón canónico de trabajo IA largo persistido + capability routing.
// El alumno NO copia literal; el agente genera adaptado al proyecto.

import { Inngest } from 'inngest'
import { z } from 'zod'
import { generateObject } from 'ai'
import { startObservation } from '@langfuse/tracing'
import { langfuseSpanProcessor } from '@/lib/observability/instrumentation'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { jobs, documents, aiUsageLedger, aiFeatureModelMapping, aiModelManifest } from '@/db/schema'
// F6 usa la key de sistema del .env.local (solo OpenAI) para probar el extractor.
// F7 sustituye este import por getProviderClient (BYO key cifrada por workspace).
import { createOpenAI } from '@ai-sdk/openai'
import { extractTextFromPdf } from '@/lib/ai/pdf-parse'

export const inngest = new Inngest({
  id: 'tendr-app',
  eventKey: process.env.INNGEST_EVENT_KEY!,
})

// Langfuse SDK v4 (OTEL). El tracer se inicializa una sola vez en
// `lib/observability/instrumentation.ts` registrando un LangfuseSpanProcessor
// en un NodeSDK:
//
//   import { NodeSDK } from '@opentelemetry/sdk-node'
//   import { LangfuseSpanProcessor } from '@langfuse/otel'
//   export const langfuseSpanProcessor = new LangfuseSpanProcessor()
//   new NodeSDK({ spanProcessors: [langfuseSpanProcessor] }).start()
//
// Las observaciones se crean con `startObservation` de `@langfuse/tracing`
// (el `langfuse.trace()` del SDK antiguo quedó retirado en v4).

// ============================================================================
// Schema Zod del output esperado
// ============================================================================
const extractionSchema = z.object({
  fechasClave: z.array(z.object({
    fecha: z.string().describe('Fecha en formato ISO 8601'),
    descripcion: z.string(),
  })),
  importes: z.array(z.object({
    cantidad: z.number(),
    moneda: z.string().default('EUR'),
    descripcion: z.string(),
  })),
  partesImplicadas: z.array(z.object({
    nombre: z.string(),
    rol: z.string(),
  })),
  resumen: z.string().max(500),
})

type ExtractionResult = z.infer<typeof extractionSchema>

// ============================================================================
// Inngest function · extractDocument
// ============================================================================
export const extractDocument = inngest.createFunction(
  {
    id: 'extract-document',
    retries: 3,
    onFailure: async ({ event, error, step }) => {
      const jobId = (event.data as { jobId: string }).jobId
      await db
        .update(jobs)
        .set({
          status: 'failed',
          error: error.message.slice(0, 500),
          completedAt: new Date(),
        })
        .where(eq(jobs.id, jobId))
    },
  },
  { event: 'documents/extract' },
  async ({ event, step }) => {
    const { jobId, documentId, workspaceId } = event.data as {
      jobId: string
      documentId: string
      workspaceId: string
    }

    // -------------------------------------------------------------------------
    // 1. Marcar running
    // -------------------------------------------------------------------------
    await step.run('mark-running', async () => {
      await db
        .update(jobs)
        .set({ status: 'running', startedAt: new Date() })
        .where(eq(jobs.id, jobId))
    })

    // -------------------------------------------------------------------------
    // 2. Lookup del modelo + capabilities
    // -------------------------------------------------------------------------
    const modelInfo = await step.run('lookup-model', async () => {
      const mapping = await db
        .select()
        .from(aiFeatureModelMapping)
        .where(eq(aiFeatureModelMapping.workspaceId, workspaceId))
        .limit(1)

      if (mapping.length === 0 || mapping[0].feature !== 'extract_document') {
        throw new Error('No model configured for extract_document')
      }

      const manifest = await db
        .select()
        .from(aiModelManifest)
        .where(eq(aiModelManifest.modelId, mapping[0].modelId))
        .limit(1)

      return {
        provider: mapping[0].provider,
        modelId: mapping[0].modelId,
        supportsPdf: manifest[0]?.supportsPdf ?? false,
        costPer1kInput: manifest[0]?.costPer1kInput ?? 0,
        costPer1kOutput: manifest[0]?.costPer1kOutput ?? 0,
      }
    })

    // -------------------------------------------------------------------------
    // 3. Descargar PDF de Storage
    // -------------------------------------------------------------------------
    const pdfBuffer = await step.run('fetch-document', async () => {
      const doc = await db
        .select()
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1)
      if (doc.length === 0) throw new Error('Document not found')
      // Descarga el binario via signed URL TTL 1h.
      // Implementación real omitida; depende del helper de Storage.
      return Buffer.from([])  // placeholder
    })

    // -------------------------------------------------------------------------
    // 4. Capability routing
    // -------------------------------------------------------------------------
    const aiInput = await step.run('prepare-input', async () => {
      if (modelInfo.supportsPdf) {
        // Rama nativa: el modelo acepta PDF como attachment.
        return { kind: 'pdf' as const, data: pdfBuffer }
      }
      // Rama fallback: extraer texto del PDF antes de mandar.
      const text = await extractTextFromPdf(pdfBuffer)
      return { kind: 'text' as const, data: text }
    })

    // -------------------------------------------------------------------------
    // 5. Llamada al modelo + trace Langfuse
    // -------------------------------------------------------------------------
    const extraction = await step.run('extract', async () => {
      // Langfuse v4 OTEL: una observación raíz de tipo generation con
      // startObservation. El contenido del PDF/texto NUNCA entra al trace,
      // solo metadata (tipo de input y longitud).
      const generation = startObservation(
        'extract-call',
        {
          model: modelInfo.modelId,
          input: {
            kind: aiInput.kind,
            contentLength:
              aiInput.data instanceof Buffer ? aiInput.data.byteLength : aiInput.data.length,
          },
          metadata: {
            workspaceId,
            documentId,
            feature: 'extract_document',
            provider: modelInfo.provider,
            inputKind: aiInput.kind,
          },
        },
        { asType: 'generation' },
      )

      // TODO (F7): sustituir por getProviderClient(workspaceId, modelInfo.provider) con BYO key cifrada.
      // En F6, key de sistema del .env.local para probar el extractor (modelInfo.provider será OpenAI).
      const client = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })

      try {
        const result = await generateObject({
          model: client(modelInfo.modelId),
          schema: extractionSchema,
          messages:
            aiInput.kind === 'pdf'
              ? [
                  {
                    role: 'user',
                    content: [
                      { type: 'text', text: 'Extrae fechas, importes, partes y resumen del PDF adjunto.' },
                      { type: 'file', data: aiInput.data, mediaType: 'application/pdf' },
                    ],
                  },
                ]
              : [
                  {
                    role: 'user',
                    content: `Extrae fechas, importes, partes y resumen del siguiente contenido:\n\n${aiInput.data}`,
                  },
                ],
        })

        // AI SDK v5: la usage llega como inputTokens / outputTokens / totalTokens.
        // Langfuse v4 las mapea en usageDetails con las claves input / output / total.
        generation.update({
          output: { schemaName: 'extractionSchema' },  // sin el contenido
          usageDetails: {
            input: result.usage.inputTokens,
            output: result.usage.outputTokens,
            total: result.usage.totalTokens,
          },
        })
        generation.end()

        // En un job corto conviene forzar el flush del span processor antes de
        // que el runtime se apague, o los spans pendientes se pierden.
        await langfuseSpanProcessor.forceFlush()

        return {
          data: result.object,
          tokensIn: result.usage.inputTokens,
          tokensOut: result.usage.outputTokens,
        }
      } catch (e) {
        generation.update({ output: { error: 'failed' } })
        generation.end()
        await langfuseSpanProcessor.forceFlush()
        throw e
      }
    })

    // -------------------------------------------------------------------------
    // 6. Persistencia
    // -------------------------------------------------------------------------
    await step.run('persist', async () => {
      const costCents = Math.ceil(
        (extraction.tokensIn / 1000) * modelInfo.costPer1kInput * 100 +
          (extraction.tokensOut / 1000) * modelInfo.costPer1kOutput * 100,
      )

      await db.transaction(async (tx) => {
        await tx
          .update(documents)
          .set({ extractedMetadata: extraction.data })
          .where(eq(documents.id, documentId))

        await tx.insert(aiUsageLedger).values({
          workspaceId,
          feature: 'extract_document',
          provider: modelInfo.provider,
          modelId: modelInfo.modelId,
          tokensIn: extraction.tokensIn,
          tokensOut: extraction.tokensOut,
          costCents,
        })

        await tx
          .update(jobs)
          .set({
            status: 'completed',
            result: extraction.data as ExtractionResult,
            completedAt: new Date(),
          })
          .where(eq(jobs.id, jobId))
      })
    })
  },
)
