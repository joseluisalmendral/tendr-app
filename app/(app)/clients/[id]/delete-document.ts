import type { SupabaseClient } from "@supabase/supabase-js";
import { and, desc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "@/db/schema";
import { documents, jobs } from "@/db/schema";

import { isTerminalStatus, type JobStatus } from "./use-job";

/**
 * Pure, import-testable document-delete logic for the `deleteDocument` Server
 * Action, isolated from cookie/`next/headers` plumbing (same seam pattern as
 * `uploadDocumentWith`/`getDocumentSignedUrlWith`). Every external effect —
 * the Drizzle reads/delete and the user-session Storage remove — is injected
 * via `deps`, so tests drive it against the real local stack and inject fakes
 * only for the partial-failure cases.
 *
 * Result shape is `{ ok: true } | { ok: false; error }` as const (matches the
 * F6 upload convention; diverges from the F5 `{ status }` form-state — that
 * divergence is local to F6 and documented).
 *
 * DESIGN (ADR-1/2/3, FORK 1/2/3):
 *   - jobs/ai_usage_ledger rows are KEPT (immutable history; jobs has no user
 *     DELETE policy and no FK to documents). Only the Storage object + the
 *     `documents` row are removed.
 *   - STORAGE-FIRST ordering preserves upload's invariant "never an orphan
 *     object": removing the object before the row means a later DB failure can
 *     only ever leave an orphan ROW (visible, re-deletable, idempotent), never
 *     an invisible orphan object.
 *   - SERVER-AUTHORITATIVE terminal guard: the latest job is read here (not
 *     trusted from a client-passed status) so a stale UI cannot force-delete a
 *     running job.
 *
 * Tenancy: every read/delete is scoped by the explicit `workspaceId` the seam
 * was given (defense in depth alongside the `documents_delete_own_workspace` /
 * `documents_objects_delete_own_workspace` RLS policies). A cross-workspace id
 * therefore resolves to no row and is refused before any destructive call.
 */

export interface DeleteDocumentDeps {
  /** User-session Supabase client (Storage WS policies apply). */
  supabase: SupabaseClient;
  /** Drizzle client for the workspace-scoped reads + delete. */
  db: PostgresJsDatabase<typeof schema>;
}

export type DeleteDocumentInput = {
  workspaceId: string;
  documentId: string;
};

export type DeleteDocumentResult = { ok: true } | { ok: false; error: string };

const STORAGE_BUCKET = "documents";

/**
 * Pure guard: a document may be deleted only when its latest job is terminal
 * (completed/failed) or there is no job at all. `pending`/`running` block the
 * delete. Reuses the `isTerminalStatus` semantics from use-job.ts so the two
 * never drift (pending/running are the only non-terminal states).
 */
export function canDeleteDocument(latestJobStatus: JobStatus | null): boolean {
  if (latestJobStatus === null) return true;
  return isTerminalStatus(latestJobStatus);
}

/** Neutral-Spanish message shown when the guard blocks the delete. */
const NON_TERMINAL_ERROR =
  "La extracción sigue en curso. Espera a que termine.";

export async function deleteDocumentWith(
  deps: DeleteDocumentDeps,
  input: DeleteDocumentInput,
): Promise<DeleteDocumentResult> {
  const { workspaceId, documentId } = input;

  // 1. Resolve the storage_path, scoped to the caller's workspace. A
  //    cross-workspace (or already-gone) id yields no row -> refuse. RLS scopes
  //    this too in production; the explicit workspaceId filter is defense in
  //    depth and the authoritative tenancy gate under a privileged connection.
  const rows = await deps.db
    .select({ storagePath: documents.storagePath })
    .from(documents)
    .where(
      and(eq(documents.id, documentId), eq(documents.workspaceId, workspaceId)),
    )
    .limit(1);

  if (rows.length === 0) {
    return { ok: false, error: "No se encontró el documento." };
  }
  const storagePath = rows[0].storagePath;

  // 2. Server-authoritative terminal guard. Read the latest job for this
  //    document (jobs.payload.documentId is the soft link; no FK exists).
  //    ORDER BY created_at DESC, id DESC makes the "latest" deterministic even
  //    under same-millisecond ties (id is a UUID — a stable total tiebreak).
  const jobRows = await deps.db
    .select({ status: jobs.status })
    .from(jobs)
    .where(
      and(
        eq(jobs.workspaceId, workspaceId),
        sql`${jobs.payload}->>'documentId' = ${documentId}`,
      ),
    )
    .orderBy(desc(jobs.createdAt), desc(jobs.id))
    .limit(1);

  const latestStatus = (jobRows[0]?.status as JobStatus | undefined) ?? null;
  if (!canDeleteDocument(latestStatus)) {
    return { ok: false, error: NON_TERMINAL_ERROR };
  }

  // 3. Remove the Storage object FIRST (user-session client; the
  //    documents_objects_delete_own_workspace policy gates it). On error STOP:
  //    nothing destroyed yet, the row + object remain, fully recoverable and
  //    re-deletable.
  const { error: storageError } = await deps.supabase.storage
    .from(STORAGE_BUCKET)
    .remove([storagePath]);

  if (storageError) {
    return {
      ok: false,
      error: "No se pudo eliminar el documento. Vuelve a intentarlo.",
    };
  }

  // 4. Delete the `documents` row (RLS documents_delete policy + explicit
  //    workspace scope). On error AFTER a successful object remove the row
  //    survives but its object is gone — a visible, RE-DELETABLE orphan row
  //    (step 3 on a now-missing path is idempotent, not a hard failure). NO
  //    orphan object, NO silent data loss.
  try {
    await deps.db
      .delete(documents)
      .where(
        and(
          eq(documents.id, documentId),
          eq(documents.workspaceId, workspaceId),
        ),
      );
  } catch {
    return {
      ok: false,
      error: "No se pudo eliminar el documento. Vuelve a intentarlo.",
    };
  }

  return { ok: true } as const;
}
