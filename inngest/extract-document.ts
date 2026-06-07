import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { startObservation } from "@langfuse/tracing";
import {
  generateObject,
  NoObjectGeneratedError,
  type LanguageModel,
} from "ai";
import { eq, sql } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { z } from "zod";

import { serviceDb } from "@/db/service";
import {
  aiFeatureModelMapping,
  aiModelManifest,
  aiUsageLedger,
  documents,
  jobs,
} from "@/db/schema";
import { langfuseSpanProcessor } from "@/lib/observability/instrumentation";
import { extractTextFromPdf } from "@/lib/ai/pdf-parse";
import {
  resolveExtractionModel,
  type ExtractionModelRoute,
} from "@/lib/ai/route-extraction-model";

import { inngest, type DocumentsExtractEventData } from "./client";

/**
 * F6 document extractor (Inngest function).
 *
 * Steps (each appends to `jobs.progress` so the Realtime UPDATE fires per step):
 *   mark-running -> lookup-model -> create-signed-url -> extract -> persist
 *
 * Job state is advanced with the SERVER-ONLY service_role connection
 * (`serviceDb`): `jobs` RLS is SELECT+INSERT only for users, so status
 * advancement and the persist transaction require the privileged path. This
 * module is only reachable from the Inngest route and its onFailure handler;
 * it never runs in client-reachable code.
 *
 * Error taxonomy (written to `jobs.result.error_code`): validation_error |
 * provider_error | invalid_api_key | document_error. A schema-validation
 * failure is fail-fast (NonRetriableError, no retry burn); provider errors are
 * retried up to 3 times before onFailure records the terminal failure.
 *
 * OBSERVABILITY: the Langfuse trace carries METADATA ONLY — workspace id,
 * document id, feature, provider, input kind/length, token usage. The PDF
 * bytes and extracted text NEVER enter a span.
 */

// ---------------------------------------------------------------------------
// Structured output contract (course domain — Spanish field names are the
// product contract and are intentionally not anglicised).
// ---------------------------------------------------------------------------
export const extractionSchema = z.object({
  fechasClave: z.array(
    z.object({
      fecha: z.string().describe("Fecha en formato ISO 8601"),
      descripcion: z.string(),
    }),
  ),
  importes: z.array(
    z.object({
      cantidad: z.number(),
      moneda: z.string().default("EUR"),
      descripcion: z.string(),
    }),
  ),
  partesImplicadas: z.array(
    z.object({
      nombre: z.string(),
      rol: z.string(),
    }),
  ),
  resumen: z.string().max(500),
});

export type ExtractionResult = z.infer<typeof extractionSchema>;

const EXTRACT_FEATURE = "extract_document" as const;
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h
const STORAGE_BUCKET = "documents";

/** Per-step progress entry appended to `jobs.progress` (jsonb array). */
type ProgressEntry = { step: string; at: string };

/**
 * Resolves the provider model client used by the extract step. Injectable so
 * tests can pass an `ai/test` MockLanguageModelV3 instead of a real provider.
 * F6 supports only Google; F7 swaps this for `getProviderClient` (BYO key).
 */
export type ResolveModelClient = (
  route: ExtractionModelRoute,
) => LanguageModel;

const defaultResolveModelClient: ResolveModelClient = (route) => {
  // F6: system Google key from the environment. F7 replaces this with
  // getProviderClient(workspaceId, provider) (per-workspace BYO key).
  const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });
  return google(route.modelId);
};

// Module-level seam so tests can swap the model client without Inngest plumbing.
let resolveModelClient: ResolveModelClient = defaultResolveModelClient;

/** Test-only: override the model-client resolver (e.g. inject a mock). */
export function __setResolveModelClient(fn: ResolveModelClient | null): void {
  resolveModelClient = fn ?? defaultResolveModelClient;
}

/** Appends one progress entry to `jobs.progress` (atomic jsonb concat). */
async function appendProgress(jobId: string, step: string): Promise<void> {
  const entry: ProgressEntry = { step, at: new Date().toISOString() };
  await serviceDb
    .update(jobs)
    .set({
      progress: sql`coalesce(${jobs.progress}, '[]'::jsonb) || ${JSON.stringify([entry])}::jsonb`,
    })
    .where(eq(jobs.id, jobId));
}

/**
 * Marks a job failed with a structured `result.error_code`. Reused by the main
 * body (for fail-fast) and the onFailure handler (for retry exhaustion).
 */
async function markJobFailed(
  jobId: string,
  errorCode: "validation_error" | "provider_error" | "invalid_api_key" | "document_error",
  message: string,
): Promise<void> {
  await serviceDb
    .update(jobs)
    .set({
      status: "failed",
      error: message.slice(0, 500),
      result: { error_code: errorCode, message: message.slice(0, 500) },
      completedAt: new Date(),
    })
    .where(eq(jobs.id, jobId));
}

/**
 * Cost in whole cents for a model call, from the manifest per-1k-token costs.
 *
 * Manifest costs are per 1k tokens in USD; multiply by 100 to get cents and
 * round UP so a non-zero usage never bills as 0. Pure so the ledger math is
 * unit-testable.
 */
export function computeCostCents(
  tokensIn: number,
  tokensOut: number,
  costPer1kInput: number,
  costPer1kOutput: number,
): number {
  return Math.ceil(
    (tokensIn / 1000) * costPer1kInput * 100 +
      (tokensOut / 1000) * costPer1kOutput * 100,
  );
}

/** Result of a successful extraction attempt. */
export interface ExtractAttempt {
  data: ExtractionResult;
  tokensIn: number;
  tokensOut: number;
}

export interface RunExtractAttemptArgs {
  jobId: string;
  documentId: string;
  workspaceId: string;
  route: ExtractionModelRoute;
  pdfBytes: Uint8Array;
  /** The model client (real provider in prod; mock in tests). */
  model: LanguageModel;
}

/**
 * Core extraction attempt: capability routing -> generateObject -> classify.
 *
 * On success returns the validated object + token usage. On a schema-validation
 * failure (`NoObjectGeneratedError`) it marks the job `failed` with
 * `result.error_code='validation_error'` and throws `NonRetriableError` so
 * Inngest does NOT retry (fail-fast, no retry burn). Other provider errors are
 * rethrown unchanged so Inngest's `retries` apply.
 *
 * Exported so verify gate (b) can drive it with an injected mock model against
 * a real local-stack job row, without the Inngest engine.
 */
export async function runExtractAttempt(
  args: RunExtractAttemptArgs,
): Promise<ExtractAttempt> {
  const { jobId, documentId, workspaceId, route, pdfBytes, model } = args;

  // Capability routing: native PDF file part vs. extracted text.
  let inputKind: "pdf" | "text";
  let contentLength: number;
  let messages: Parameters<typeof generateObject>[0]["messages"];

  if (route.supportsPdf) {
    inputKind = "pdf";
    contentLength = pdfBytes.byteLength;
    messages = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extrae fechas clave, importes, partes implicadas y un resumen del PDF adjunto.",
          },
          {
            type: "file",
            data: pdfBytes,
            mediaType: "application/pdf",
          },
        ],
      },
    ];
  } else {
    let text: string;
    try {
      text = await extractTextFromPdf(pdfBytes);
    } catch {
      await markJobFailed(jobId, "document_error", "Unreadable PDF.");
      throw new NonRetriableError("Unreadable PDF.");
    }
    inputKind = "text";
    contentLength = text.length;
    messages = [
      {
        role: "user",
        content: `Extrae fechas clave, importes, partes implicadas y un resumen del siguiente contenido:\n\n${text}`,
      },
    ];
  }

  // Langfuse: metadata-only observation (no PDF bytes/text ever attached).
  const generation = startObservation(
    "extract-document",
    {
      model: route.modelId,
      metadata: {
        workspaceId,
        documentId,
        feature: EXTRACT_FEATURE,
        provider: route.provider,
        inputKind,
        contentLength,
      },
    },
    { asType: "generation" },
  );

  try {
    const result = await generateObject({
      model,
      schema: extractionSchema,
      messages,
    });

    const inputTokens = result.usage.inputTokens ?? 0;
    const outputTokens = result.usage.outputTokens ?? 0;

    generation.update({
      output: { schemaName: "extractionSchema" }, // never the content
      usageDetails: {
        input: inputTokens,
        output: outputTokens,
        total: result.usage.totalTokens ?? inputTokens + outputTokens,
      },
    });
    generation.end();
    await langfuseSpanProcessor.forceFlush();

    return {
      data: result.object,
      tokensIn: inputTokens,
      tokensOut: outputTokens,
    };
  } catch (e) {
    generation.update({ output: { error: "failed" } });
    generation.end();
    await langfuseSpanProcessor.forceFlush();

    // Fail-fast on schema validation: deterministic, no retry burn.
    if (NoObjectGeneratedError.isInstance(e)) {
      await markJobFailed(
        jobId,
        "validation_error",
        "Model output failed schema validation.",
      );
      throw new NonRetriableError("Model output failed schema validation.");
    }
    // Any other model/provider error is retriable (up to `retries`).
    throw e;
  }
}

export const extractDocument = inngest.createFunction(
  {
    id: "extract-document",
    retries: 3,
    triggers: [{ event: "documents/extract" }],
    onFailure: async ({ event, error }) => {
      // Final retry exhausted (or a NonRetriableError surfaced): record the
      // terminal failure. If the body already wrote a structured error_code we
      // keep it; otherwise default to provider_error (retry exhaustion).
      // The failure wrapper nests the ORIGINAL event under `event.data.event`.
      const data = event.data.event.data as DocumentsExtractEventData;
      const existing = await serviceDb
        .select({ result: jobs.result, status: jobs.status })
        .from(jobs)
        .where(eq(jobs.id, data.jobId))
        .limit(1);

      const alreadyClassified =
        existing[0]?.status === "failed" &&
        existing[0]?.result != null &&
        typeof (existing[0].result as { error_code?: unknown }).error_code ===
          "string";

      if (!alreadyClassified) {
        await markJobFailed(
          data.jobId,
          "provider_error",
          error.message ?? "Extraction failed.",
        );
      }
    },
  },
  async ({ event, step }) => {
    const { jobId, documentId, workspaceId } =
      event.data as DocumentsExtractEventData;

    // 1. mark-running
    await step.run("mark-running", async () => {
      await serviceDb
        .update(jobs)
        .set({ status: "running", startedAt: new Date() })
        .where(eq(jobs.id, jobId));
      await appendProgress(jobId, "mark-running");
    });

    // 2. lookup-model: two DB reads, then the pure resolver. A missing mapping
    //    or manifest is a non-retriable provider_error.
    const route = await step.run("lookup-model", async () => {
      const [mapping] = await serviceDb
        .select()
        .from(aiFeatureModelMapping)
        .where(eq(aiFeatureModelMapping.workspaceId, workspaceId))
        .limit(1);

      const [manifest] = mapping
        ? await serviceDb
            .select()
            .from(aiModelManifest)
            .where(
              sql`${aiModelManifest.provider} = ${mapping.provider} and ${aiModelManifest.modelId} = ${mapping.modelId}`,
            )
            .limit(1)
        : [undefined];

      let resolved: ExtractionModelRoute;
      try {
        resolved = resolveExtractionModel({ mapping, manifest });
      } catch (e) {
        await markJobFailed(
          jobId,
          "provider_error",
          e instanceof Error ? e.message : "No model configured.",
        );
        throw new NonRetriableError(
          e instanceof Error ? e.message : "No model configured.",
        );
      }

      await appendProgress(jobId, "lookup-model");
      return resolved;
    });

    // 3. create-signed-url: return ONLY the URL string. NEVER return the PDF
    //    buffer from a step — Inngest step output is capped (~4MB) and the PDF
    //    can be larger; the buffer is fetched inside the extract step instead.
    const signedUrl = await step.run("create-signed-url", async () => {
      const [doc] = await serviceDb
        .select({ storagePath: documents.storagePath })
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);

      if (!doc) {
        await markJobFailed(jobId, "document_error", "Document not found.");
        throw new NonRetriableError("Document not found.");
      }

      const { createSignedDownloadUrl } = await import("./storage-signer");
      const url = await createSignedDownloadUrl(
        STORAGE_BUCKET,
        doc.storagePath,
        SIGNED_URL_TTL_SECONDS,
      ).catch(() => null);

      if (!url) {
        await markJobFailed(jobId, "document_error", "Could not sign URL.");
        throw new NonRetriableError("Could not sign URL.");
      }

      await appendProgress(jobId, "create-signed-url");
      return url;
    });

    // 4. extract: ONE step — download the PDF, route by capability, call the
    //    model with generateObject. The attempt logic is factored into
    //    `runExtractAttempt` so the fail-fast gate (b) can drive it directly
    //    with an injected mock model, without the Inngest engine.
    const extraction = await step.run("extract", async () => {
      // Download via the signed URL (the buffer never leaves this step).
      const response = await fetch(signedUrl).catch(() => null);
      if (!response || !response.ok) {
        await markJobFailed(jobId, "document_error", "Download failed.");
        throw new NonRetriableError("Download failed.");
      }
      const pdfBytes = new Uint8Array(await response.arrayBuffer());

      const result = await runExtractAttempt({
        jobId,
        documentId,
        workspaceId,
        route,
        pdfBytes,
        model: resolveModelClient(route),
      });
      await appendProgress(jobId, "extract");
      return result;
    });

    // 5. persist: one transaction — extracted_metadata + usage ledger + job
    //    completed. costCents derived from the manifest costs.
    await step.run("persist", async () => {
      const costCents = computeCostCents(
        extraction.tokensIn,
        extraction.tokensOut,
        route.costPer1kInput,
        route.costPer1kOutput,
      );

      await serviceDb.transaction(async (tx) => {
        await tx
          .update(documents)
          .set({ extractedMetadata: extraction.data })
          .where(eq(documents.id, documentId));

        await tx.insert(aiUsageLedger).values({
          workspaceId,
          feature: EXTRACT_FEATURE,
          provider: route.provider,
          modelId: route.modelId,
          tokensIn: extraction.tokensIn,
          tokensOut: extraction.tokensOut,
          costCents,
        });

        await tx
          .update(jobs)
          .set({
            status: "completed",
            result: extraction.data,
            completedAt: new Date(),
          })
          .where(eq(jobs.id, jobId));
      });

      await appendProgress(jobId, "persist");
    });
  },
);
