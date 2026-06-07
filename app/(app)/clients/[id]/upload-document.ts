import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";

import * as schema from "@/db/schema";
import { documents, jobs } from "@/db/schema";

/**
 * Pure, import-testable document-upload logic for the `uploadDocument` Server
 * Action, isolated from cookie/`next/headers` plumbing (same seam pattern as
 * `moveCaseStatus`/`createNoteInWorkspace`). Every external effect — Storage,
 * the Drizzle transaction, the Inngest send, and the post-commit failure
 * recovery — is injected via `deps`, so tests drive it with a real
 * user-session Supabase client + a real Drizzle client against the local stack
 * and a fake Inngest, asserting the failure matrix without mocking modules.
 *
 * Result shape is `{ ok: true, ... } | { ok: false, error }` as const (design
 * FORK 3): these F6 actions return a jobId for the Realtime hook rather than
 * driving `useActionState`, so they intentionally diverge from the F5
 * `{ status }` form-state convention. That divergence is local to F6.
 *
 * Failure matrix (design / spec slice A):
 *   - Zod rejects (size/type)  -> validation_error, NO Storage write, no rows
 *   - Storage upload fails     -> document_error, no rows
 *   - tx INSERT fails          -> document_error + compensating Storage.remove
 *   - inngest.send fails (post-commit) -> job marked failed (provider_error)
 *
 * Tenancy: the object path is {workspace_id}/{client_id}/{document_id}.pdf and
 * the `documents`/storage.objects WS policies gate the user-session Storage
 * write. The Drizzle tx writes the explicit workspace_id it was given.
 */

// 10MB upload ceiling, enforced by Zod before any Storage call.
const MAX_BYTES = 10 * 1024 * 1024;

const uploadSchema = z.object({
  clientId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  mimeType: z.literal("application/pdf"),
  size: z.number().int().positive().max(MAX_BYTES),
});

export type UploadDocumentInput = {
  workspaceId: string;
  clientId: unknown;
  filename: unknown;
  mimeType: unknown;
  size: unknown;
  /** Raw PDF bytes to upload. */
  body: ArrayBuffer | Uint8Array;
};

/**
 * Minimal Inngest surface this action needs — a typed `send`. Kept structural
 * so the test can pass a fake recorder without constructing a real client.
 */
export interface InngestSender {
  send(event: {
    name: "documents/extract";
    id?: string;
    data: { jobId: string; documentId: string; workspaceId: string };
  }): Promise<unknown>;
}

export interface UploadDocumentDeps {
  /** User-session Supabase client (Storage WS policies apply). */
  supabase: SupabaseClient;
  /** Drizzle client for the documents+jobs transaction. */
  db: PostgresJsDatabase<typeof schema>;
  /** Inngest client used to enqueue the extraction job. */
  inngest: InngestSender;
  /**
   * Marks a job `failed` after the tx has already committed (privileged path,
   * backed by serviceDb in production since jobs UPDATE is service_role-only).
   * Injected so the pure function never imports the server-only serviceDb.
   */
  markJobFailed(jobId: string, errorCode: string, message: string): Promise<void>;
}

export type UploadDocumentResult =
  | { ok: true; jobId: string; documentId: string }
  | { ok: false; errorCode: string; error: string };

const STORAGE_BUCKET = "documents";

export async function uploadDocumentWith(
  deps: UploadDocumentDeps,
  input: UploadDocumentInput,
): Promise<UploadDocumentResult> {
  const parsed = uploadSchema.safeParse({
    clientId: input.clientId,
    filename: input.filename,
    mimeType: input.mimeType,
    size: input.size,
  });

  // Invalid input (oversized or non-PDF) is rejected BEFORE any Storage write,
  // so no object and no rows are ever created.
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid file.";
    return { ok: false, errorCode: "validation_error", error: message };
  }

  const documentId = randomUUID();
  const storagePath = `${input.workspaceId}/${parsed.data.clientId}/${documentId}.pdf`;

  // 1. Upload to Storage. upsert:false — each document_id is unique, so a
  //    collision is a real error rather than a silent overwrite.
  const { error: storageError } = await deps.supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, input.body, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (storageError) {
    return {
      ok: false,
      errorCode: "document_error",
      error: "Upload failed.",
    };
  }

  // 2. Persist documents + jobs(pending) in ONE transaction.
  let jobId: string;
  try {
    jobId = await deps.db.transaction(async (tx) => {
      await tx.insert(documents).values({
        id: documentId,
        workspaceId: input.workspaceId,
        clientId: parsed.data.clientId,
        storagePath,
        filename: parsed.data.filename,
        sizeBytes: parsed.data.size,
      });

      const [job] = await tx
        .insert(jobs)
        .values({
          workspaceId: input.workspaceId,
          type: "extract_document",
          status: "pending",
          payload: { documentId, workspaceId: input.workspaceId },
        })
        .returning({ id: jobs.id });

      return job.id;
    });
  } catch {
    // Compensating cleanup: the tx failed, so remove the already-uploaded
    // object to avoid an orphan in the bucket. No rows exist to roll back.
    await deps.supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    return {
      ok: false,
      errorCode: "document_error",
      error: "Could not save the document.",
    };
  }

  // 3. Enqueue extraction. `id: jobId` is the Inngest idempotency key so a
  //    retried send does not double-run the job.
  try {
    await deps.inngest.send({
      name: "documents/extract",
      id: jobId,
      data: { jobId, documentId, workspaceId: input.workspaceId },
    });
  } catch {
    // The tx already committed (no zombie pending job): mark the job failed so
    // the UI reaches a terminal state instead of waiting forever.
    await deps.markJobFailed(
      jobId,
      "provider_error",
      "Could not enqueue extraction.",
    );
    return {
      ok: false,
      errorCode: "provider_error",
      error: "Could not start extraction.",
    };
  }

  return { ok: true, jobId, documentId };
}

/**
 * Resolves the storage_path for a document (RLS blocks cross-tenant reads via
 * the injected user-session client) and returns a 1h signed download URL.
 */
export async function getDocumentSignedUrlWith(
  deps: Pick<UploadDocumentDeps, "supabase" | "db">,
  documentId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const rows = await deps.db
    .select({ storagePath: documents.storagePath })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (rows.length === 0) {
    return { ok: false, error: "Not found." };
  }

  const { data, error } = await deps.supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(rows[0].storagePath, 60 * 60);

  if (error || !data?.signedUrl) {
    return { ok: false, error: "Cannot sign URL." };
  }

  return { ok: true, url: data.signedUrl };
}
