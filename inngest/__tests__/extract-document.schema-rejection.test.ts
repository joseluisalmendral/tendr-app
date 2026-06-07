import { MockLanguageModelV3 } from "ai/test";
import { NonRetriableError } from "inngest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { serviceDb } from "@/db/service";
import { jobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  provisionTenant,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";
import {
  runExtractAttempt,
  type ExtractionResult,
} from "@/inngest/extract-document";
import type { ExtractionModelRoute } from "@/lib/ai/route-extraction-model";

/**
 * Verify gate (b): structured-output rejection is FAIL-FAST.
 *
 * A `MockLanguageModelV3` returns content that violates `extractionSchema`, so
 * `generateObject` raises `NoObjectGeneratedError`. The worker MUST:
 *   1. map it to `NonRetriableError` (no Inngest retry burn),
 *   2. end the real job row `failed` with `result.error_code='validation_error'`,
 *   3. call the model EXACTLY ONCE (no retries inside the attempt).
 *
 * Runs against the LOCAL Supabase stack: the job row is created with the
 * service_role connection and the terminal state is read back at the DB level.
 */

const PDF_CAPABLE_ROUTE: ExtractionModelRoute = {
  provider: "google",
  modelId: "gemini-3.5-flash",
  supportsPdf: true,
  costPer1kInput: 0.000075,
  costPer1kOutput: 0.0003,
};

/** A mock that returns malformed (schema-violating) content and counts calls. */
function malformedModel(): { model: MockLanguageModelV3; calls: () => number } {
  let count = 0;
  const model = new MockLanguageModelV3({
    provider: "mock",
    modelId: "mock-malformed",
    doGenerate: async () => {
      count += 1;
      return {
        // Not a valid JSON object for the schema -> generateObject throws.
        content: [{ type: "text" as const, text: "not a json object at all" }],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage: {
          // Provider-level (V3) usage shape: granular token sub-objects.
          inputTokens: {
            total: 10,
            noCache: 10,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: { total: 5, text: 5, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
  return { model, calls: () => count };
}

describe("extract attempt — schema rejection (gate b)", () => {
  let tenant: Tenant;
  let jobId: string;

  beforeAll(async () => {
    tenant = await provisionTenant("extract-reject");

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

  it("fails fast: NonRetriableError, job failed with validation_error, model called once", async () => {
    const { model, calls } = malformedModel();
    const pdfBytes = new TextEncoder().encode("%PDF-1.4\n%mock\n");

    await expect(
      runExtractAttempt({
        jobId,
        documentId: "00000000-0000-0000-0000-0000000000d0",
        workspaceId: tenant.workspaceId,
        route: PDF_CAPABLE_ROUTE,
        pdfBytes,
        model,
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);

    // No retry burn: the model was invoked exactly once.
    expect(calls()).toBe(1);

    // The job row reached a terminal failed state with the structured code.
    const [row] = await serviceDb
      .select({ status: jobs.status, result: jobs.result })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    expect(row.status).toBe("failed");
    expect(
      (row.result as { error_code?: string } | null)?.error_code,
    ).toBe("validation_error");
  });
});

// Type-only assertion so the schema result type stays exported for consumers.
export type _AssertExtractionResultExported = ExtractionResult;
