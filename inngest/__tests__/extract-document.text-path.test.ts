import { MockLanguageModelV3 } from "ai/test";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { serviceDb } from "@/db/service";
import { jobs } from "@/db/schema";
import {
  provisionTenant,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";
import { runExtractAttempt } from "@/inngest/extract-document";
import type { ExtractionModelRoute } from "@/lib/ai/route-extraction-model";

/**
 * W1 REMEDIATION (verify-report-b): the capability TEXT path through the WORKER.
 *
 * Gate (a) only tests the resolver DECISION; the schema-rejection gate only
 * drives `supports_pdf=true` (native file part). This test closes the gap: a
 * `supports_pdf=false` route MUST make `runExtractAttempt` extract text via the
 * pdf-parse wrapper and send THAT TEXT to the model — not the raw bytes as a
 * native file part. Same structured output contract is produced.
 *
 * Assertion strategy (proves pdf-parse was genuinely exercised, not inferred):
 * the mock captures the prompt the worker built. On the text branch the prompt
 * is a single user message whose text CONTAINS the literal string embedded in
 * the fixture PDF ("Tendr F6 extraction") — that string can only be present if
 * pdf-parse actually parsed the bytes. The prompt MUST NOT contain a file part.
 */

const TEXT_ROUTE: ExtractionModelRoute = {
  provider: "google",
  modelId: "gemini-text-only",
  supportsPdf: false,
  costPer1kInput: 0.000075,
  costPer1kOutput: 0.0003,
};

/** Minimal VALID single-page PDF with the literal text "Tendr F6 extraction". */
function tinyPdf(): Uint8Array {
  const pdf = [
    "%PDF-1.4",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
    "4 0 obj << /Length 64 >>",
    "stream",
    "BT /F1 18 Tf 20 100 Td (Tendr F6 extraction) Tj ET",
    "endstream",
    "endobj",
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    "trailer << /Root 1 0 R /Size 6 >>",
    "%%EOF",
    "",
  ].join("\n");
  return new TextEncoder().encode(pdf);
}

/** A valid extraction payload so generateObject succeeds on the text branch. */
const VALID_OBJECT = {
  fechasClave: [],
  importes: [],
  partesImplicadas: [],
  resumen: "Resumen de prueba.",
};

/** A single provider prompt message (we only assert on its content parts). */
type PromptMessage = { role: string; content: unknown };
type ContentPart = { type: string; text?: string };

/**
 * Mock that records the prompt it received and returns a schema-valid object.
 * The doGenerate response shape is the provider-level (V3) one the SDK expects.
 */
function recordingModel(): {
  model: MockLanguageModelV3;
  prompt: () => PromptMessage[] | null;
} {
  let captured: PromptMessage[] | null = null;
  const model = new MockLanguageModelV3({
    provider: "mock",
    modelId: "mock-text",
    doGenerate: async (options) => {
      captured = options.prompt as unknown as PromptMessage[];
      return {
        content: [{ type: "text" as const, text: JSON.stringify(VALID_OBJECT) }],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage: {
          inputTokens: {
            total: 12,
            noCache: 12,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: { total: 6, text: 6, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
  return { model, prompt: () => captured };
}

describe("extract attempt — capability TEXT path (W1)", () => {
  let tenant: Tenant;
  let jobId: string;

  beforeAll(async () => {
    tenant = await provisionTenant("extract-text");
    const [job] = await serviceDb
      .insert(jobs)
      .values({
        workspaceId: tenant.workspaceId,
        type: "extract_document",
        status: "running",
        startedAt: new Date(),
      })
      .returning({ id: jobs.id });
    jobId = job.id;
  });

  afterAll(async () => {
    await serviceDb.delete(jobs).where(eq(jobs.id, jobId)).catch(() => undefined);
    await teardownTenants(tenant);
  });

  it("supports_pdf=false routes through pdf-parse and sends extracted TEXT (no native file part)", async () => {
    const { model, prompt } = recordingModel();

    const result = await runExtractAttempt({
      jobId,
      documentId: "00000000-0000-0000-0000-0000000000d1",
      workspaceId: tenant.workspaceId,
      route: TEXT_ROUTE,
      pdfBytes: tinyPdf(),
      model,
    });

    // Same structured output contract is produced on the text path.
    expect(result.data.resumen).toBe("Resumen de prueba.");

    const captured = prompt();
    expect(captured).not.toBeNull();

    // Flatten every content part the worker sent to the model.
    const parts: ContentPart[] = (captured ?? []).flatMap((m) =>
      Array.isArray(m.content)
        ? (m.content as ContentPart[])
        : [{ type: "text", text: String(m.content) }],
    );

    // pdf-parse was genuinely exercised: the fixture's literal text is present.
    const allText = parts
      .filter((p) => p.type === "text")
      .map((p) => p.text ?? "")
      .join("\n");
    expect(allText).toContain("Tendr F6 extraction");

    // The text branch must NOT smuggle a native file part.
    expect(parts.some((p) => p.type === "file")).toBe(false);
  });
});
