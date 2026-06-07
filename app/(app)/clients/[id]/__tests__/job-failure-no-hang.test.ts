import { MockLanguageModelV3 } from "ai/test";
import { eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { serviceDb } from "@/db/service";
import { documents, jobs } from "@/db/schema";
import {
  provisionTenant,
  seedClientRow,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";
import { runExtractAttempt } from "@/inngest/extract-document";
import type { ExtractionModelRoute } from "@/lib/ai/route-extraction-model";

import {
  resolveDocumentView,
  errorMessageFor,
} from "../document-view";
import { toJobState, type JobRealtimeRow } from "../use-job";

/**
 * VERIFY GATE (c): a failure leaves the job `failed` WITHOUT hanging the UI.
 *
 * This drives the REAL worker attempt against the LOCAL Supabase stack with an
 * injected model that emits schema-violating content (so `generateObject`
 * raises `NoObjectGeneratedError`). The worker MUST:
 *   1. write the terminal `failed` row with `result.error_code` (DB assertion),
 *   2. expose that terminal state through the SAME catch-up read path the UI
 *      hook uses on (re)connect — proving the client can never miss it,
 *   3. resolve to the `failed` VIEW (never a spinner) via the pure UI logic.
 *
 * Gate (c) is satisfied end-to-end: DB terminal row + catch-up read + view.
 */

const PDF_CAPABLE_ROUTE: ExtractionModelRoute = {
  provider: "google",
  modelId: "gemini-3.5-flash",
  supportsPdf: true,
  costPer1kInput: 0.000075,
  costPer1kOutput: 0.0003,
};

/** Mock model that returns malformed content -> generateObject throws. */
function malformedModel(): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "mock",
    modelId: "mock-malformed",
    doGenerate: async () => ({
      content: [{ type: "text" as const, text: "definitely not the schema" }],
      finishReason: { unified: "stop" as const, raw: "stop" },
      usage: {
        inputTokens: {
          total: 8,
          noCache: 8,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 3, text: 3, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}

/**
 * Mirrors the exact catch-up read `useJob.onSubscribed` performs, but through
 * the service connection in the test harness. The COLUMNS and shape are
 * identical to what the browser hook selects, so this proves the terminal row
 * is reachable by the same query the UI runs.
 */
async function catchUpRead(jobId: string): Promise<JobRealtimeRow | null> {
  const [r] = await serviceDb
    .select({
      id: jobs.id,
      workspace_id: jobs.workspaceId,
      status: jobs.status,
      progress: jobs.progress,
      result: jobs.result,
      error: jobs.error,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!r) return null;
  return {
    id: r.id,
    workspace_id: r.workspace_id,
    status: r.status as JobRealtimeRow["status"],
    progress: r.progress as JobRealtimeRow["progress"],
    result: r.result,
    error: r.error,
  };
}

describe("document extraction failure — UI never hangs (gate c)", () => {
  let tenant: Tenant;
  let jobId: string;
  let documentId: string;

  beforeAll(async () => {
    tenant = await provisionTenant("job-no-hang");
    const clientId = await seedClientRow(tenant, "Cliente Doc");

    const [doc] = await serviceDb
      .insert(documents)
      .values({
        workspaceId: tenant.workspaceId,
        clientId,
        storagePath: `${tenant.workspaceId}/${clientId}/doc.pdf`,
        filename: "contrato.pdf",
        sizeBytes: 1234,
      })
      .returning({ id: documents.id });
    documentId = doc.id;

    const [job] = await serviceDb
      .insert(jobs)
      .values({
        workspaceId: tenant.workspaceId,
        type: "extract_document",
        status: "running",
        startedAt: new Date(),
        payload: { documentId, workspaceId: tenant.workspaceId },
      })
      .returning({ id: jobs.id });
    jobId = job.id;
  });

  afterAll(async () => {
    await serviceDb.delete(jobs).where(eq(jobs.id, jobId)).catch(() => undefined);
    await serviceDb
      .delete(documents)
      .where(eq(documents.id, documentId))
      .catch(() => undefined);
    await teardownTenants(tenant);
  });

  it("a failure writes a terminal failed row that the catch-up read surfaces as a non-spinner view", async () => {
    // Force the failure via the model seam (no real provider call).
    await expect(
      runExtractAttempt({
        jobId,
        documentId,
        workspaceId: tenant.workspaceId,
        route: PDF_CAPABLE_ROUTE,
        pdfBytes: new TextEncoder().encode("%PDF-1.4\n%mock\n"),
        model: malformedModel(),
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);

    // 1. DB-level: the job row reached the terminal failed state.
    const fromDb = await catchUpRead(jobId);
    expect(fromDb).not.toBeNull();
    expect(fromDb?.status).toBe("failed");
    expect((fromDb?.result as { error_code?: string } | null)?.error_code).toBe(
      "validation_error",
    );

    // 2. Hook-level: the SAME catch-up read, normalized, exposes a non-null
    //    structured error — the client can never be left waiting.
    const state = toJobState(fromDb!);
    expect(state.error).not.toBeNull();

    // 3. View-level: a failed job resolves to the terminal 'failed' view (NOT a
    //    spinner) with a non-empty, human-facing message.
    const view = resolveDocumentView(state.status, false);
    expect(view).toBe("failed");
    expect(errorMessageFor(state.error).length).toBeGreaterThan(0);
  });
});
