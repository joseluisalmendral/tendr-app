import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type * as schema from "@/db/schema";
import { jobs } from "@/db/schema";

import type { InngestSender } from "./upload-document";

/**
 * Pure, import-testable retry logic for a FAILED document-extraction job (F7c
 * decision #775 finding 4b). Same seam pattern as `uploadDocumentWith` /
 * `deleteDocumentWith`: every external effect (the privileged jobs reset + the
 * Inngest re-send) is injected via `deps`, so tests drive it against the real
 * local stack with a fake Inngest recorder.
 *
 * Behavior (design 4b):
 *   - The latest job for the document is reset from `failed` -> `pending`
 *     (error/result/completed_at cleared) and the `documents/extract` event is
 *     re-sent, re-running the worker's gates from the top.
 *   - Terminal CAUSES (no_key_configured / budget_exceeded) are NOT special-cased
 *     here: the retry re-runs and the worker's own gates re-fail the job cleanly
 *     with the curated, actionable message. There is no infinite burn because a
 *     NonRetriableError is raised inside the worker, not a retry loop.
 *
 * Tenancy: the reset is gated by an EXPLICIT `eq(jobId) AND eq(workspaceId)`
 * predicate — the authoritative tenancy gate under the privileged pooler
 * connection (`serviceDb` in production, since jobs UPDATE is service_role-only).
 * A cross-workspace jobId resolves to no row and is refused before any re-send.
 *
 * Guard: only a `failed` job can be retried. A pending/running job (already in
 * flight) or a completed job (nothing to retry) is refused with a neutral
 * message, so a stale UI cannot double-enqueue or re-run a finished extraction.
 */

export interface RetryExtractionDeps {
  /**
   * Privileged Drizzle client for the jobs read + reset (jobs UPDATE is
   * service_role-only per the F3 RLS deviation, so production injects serviceDb).
   */
  db: PostgresJsDatabase<typeof schema>;
  /** Inngest client used to re-enqueue the extraction. */
  inngest: InngestSender;
}

export type RetryExtractionInput = {
  workspaceId: string;
  jobId: string;
};

export type RetryExtractionResult =
  | { ok: true }
  | { ok: false; error: string };

const NOT_FOUND_ERROR = "No se encontró el trabajo de extracción.";
const NOT_FAILED_ERROR =
  "Solo se puede reintentar una extracción que ha fallado.";
const MISSING_PAYLOAD_ERROR = "No se pudo reintentar la extracción.";

type JobPayload = { documentId?: string; workspaceId?: string } | null;

export async function retryExtractionWith(
  deps: RetryExtractionDeps,
  input: RetryExtractionInput,
): Promise<RetryExtractionResult> {
  const { workspaceId, jobId } = input;

  // 1. Resolve the job, scoped to the caller's workspace (explicit tenancy gate).
  //    A cross-workspace (or gone) jobId yields no row -> refuse.
  const [job] = await deps.db
    .select({
      status: jobs.status,
      type: jobs.type,
      payload: jobs.payload,
    })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.workspaceId, workspaceId)))
    .limit(1);

  if (!job) {
    return { ok: false, error: NOT_FOUND_ERROR };
  }

  // 2. Only a FAILED extraction job can be retried (server-authoritative guard).
  if (job.status !== "failed" || job.type !== "extract_document") {
    return { ok: false, error: NOT_FAILED_ERROR };
  }

  const payload = job.payload as JobPayload;
  const documentId = payload?.documentId;
  if (!documentId) {
    return { ok: false, error: MISSING_PAYLOAD_ERROR };
  }

  // 3. Reset the job to pending, clearing the prior terminal state so the UI
  //    re-enters the live-progress view (explicit (jobId, workspaceId) gate).
  await deps.db
    .update(jobs)
    .set({
      status: "pending",
      error: null,
      result: null,
      startedAt: null,
      completedAt: null,
      progress: [],
    })
    .where(and(eq(jobs.id, jobId), eq(jobs.workspaceId, workspaceId)));

  // 4. Re-enqueue. NO idempotency `id` here: the original send used `id: jobId`,
  //    so reusing it would let Inngest dedupe the retry and silently no-op. A
  //    retry is a deliberate NEW run of the same job, so we omit `id` and let
  //    Inngest schedule a fresh execution.
  try {
    await deps.inngest.send({
      name: "documents/extract",
      data: { jobId, documentId, workspaceId },
    });
  } catch {
    // The reset already committed. Leave the job pending=false by marking it
    // failed again so the UI reaches a terminal state instead of hanging.
    await deps.db
      .update(jobs)
      .set({
        status: "failed",
        error: "Could not enqueue extraction.",
        result: {
          error_code: "provider_error",
          message: "Could not enqueue extraction.",
        },
        completedAt: new Date(),
      })
      .where(and(eq(jobs.id, jobId), eq(jobs.workspaceId, workspaceId)));
    return { ok: false, error: "No se pudo reintentar la extracción." };
  }

  return { ok: true };
}
