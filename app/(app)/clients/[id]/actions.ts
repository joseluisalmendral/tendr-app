"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ensureAnonymousWorkspace } from "@/app/(auth)/actions";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { serviceDb } from "@/db/service";
import { inngest } from "@/inngest/client";
import { getCurrentWorkspace } from "@/lib/auth/get-current-workspace";
import { PlanGateError, requirePlan } from "@/lib/auth/require-plan";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

import { createCaseInWorkspace, type CreateCaseState } from "./create-case";
import { createNoteInWorkspace, type CreateNoteState } from "./create-note";
import {
  deleteDocumentWith,
  type DeleteDocumentResult,
} from "./delete-document";
import {
  retryExtractionWith,
  type RetryExtractionResult,
} from "./retry-extraction";
import {
  getDocumentSignedUrlWith,
  uploadDocumentWith,
  type UploadDocumentResult,
} from "./upload-document";

export type { CreateCaseState } from "./create-case";
export type { CreateNoteState } from "./create-note";
export type { DeleteDocumentResult } from "./delete-document";
export type { RetryExtractionResult } from "./retry-extraction";
export type { UploadDocumentResult } from "./upload-document";

/**
 * Resolves the caller's workspace from the session, provisioning an anonymous
 * one if a fresh visitor has none yet. Returns null when there is no usable
 * session (the (app) layout guard makes that unreachable in practice).
 */
async function resolveWorkspaceId(): Promise<string | null> {
  let current = await getCurrentWorkspace();

  if (current && current.workspaceId === null) {
    await ensureAnonymousWorkspace();
    current = await getCurrentWorkspace();
  }

  return current?.workspaceId ?? null;
}

/**
 * Server Action consumed by the new-case dialog's `useActionState`.
 *
 * Resolves the caller's workspace, then delegates to the pure
 * `createCaseInWorkspace` (Zod validation BEFORE DB; INSERT via the user-JWT
 * Supabase server client so the `cases_insert_own_workspace` RLS policy
 * enforces tenancy). ZERO service_role anywhere in this path.
 */
export async function createCase(
  _prevState: CreateCaseState,
  formData: FormData,
): Promise<CreateCaseState> {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) {
    return {
      status: "error",
      message: "Tu sesión expiró. Volvé a iniciar sesión.",
    };
  }

  const clientId = formData.get("clientId");
  if (typeof clientId !== "string" || clientId.length === 0) {
    return { status: "error", message: "Falta el cliente del caso." };
  }

  const supabase = await createSupabaseServerClient();

  const result = await createCaseInWorkspace(supabase, workspaceId, {
    clientId,
    title: formData.get("title"),
    status: formData.get("status"),
    valueCents: formData.get("valueCents"),
  });

  if (result.status === "success") {
    revalidatePath(`/clients/${clientId}`);
  }

  return result;
}

/**
 * Marks a job `failed` from the privileged service_role connection (jobs UPDATE
 * is service_role-only per the F3 RLS deviation). Injected into the upload seam
 * so a post-commit Inngest send failure leaves a terminal job, not a zombie.
 */
async function markJobFailed(
  jobId: string,
  errorCode: string,
  message: string,
): Promise<void> {
  await serviceDb
    .update(jobs)
    .set({
      status: "failed",
      error: message,
      result: { error_code: errorCode, message },
      completedAt: new Date(),
    })
    .where(eq(jobs.id, jobId));
}

/**
 * Server Action: uploads a PDF for a client, persists documents + a pending
 * extraction job, and enqueues the Inngest worker.
 *
 * Thin cookie wrapper around the pure `uploadDocumentWith`: it resolves the
 * caller's workspace and the cookie-bound Supabase client, then injects every
 * effect (Storage via the user-session client, the Drizzle tx, the Inngest
 * send, and the serviceDb-backed `markJobFailed` recovery). Returns `{ ok }`.
 */
export async function uploadDocument(
  formData: FormData,
): Promise<UploadDocumentResult> {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) {
    return {
      ok: false,
      errorCode: "validation_error",
      error: "Your session expired. Please sign in again.",
    };
  }

  // F8 plan gate (PAID feature) — enqueue-time, defense-in-depth: a Free user is
  // redirected to /upgrade BEFORE the document is uploaded or the job enqueued.
  // The in-job gate (extract-document `plan-gate` step) is the backstop for a
  // post-enqueue downgrade. `redirect()` throws NEXT_REDIRECT, which propagates
  // out of the action; any non-PlanGateError (DB/infra) rethrows unchanged.
  try {
    await requirePlan(workspaceId, "pro");
  } catch (e) {
    if (e instanceof PlanGateError) redirect("/upgrade");
    throw e;
  }

  const file = formData.get("file");
  const clientId = formData.get("clientId");

  if (!(file instanceof File)) {
    return {
      ok: false,
      errorCode: "validation_error",
      error: "No file uploaded.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const body = await file.arrayBuffer();

  const result = await uploadDocumentWith(
    { supabase, db, inngest, markJobFailed },
    {
      workspaceId,
      clientId,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      body,
    },
  );

  if (result.ok && typeof clientId === "string") {
    revalidatePath(`/clients/${clientId}`);
  }

  return result;
}

/**
 * Server Action: returns a 1h signed download URL for a document the caller
 * owns (RLS blocks cross-tenant lookups via the user-session client).
 */
export async function getDocumentSignedUrl(documentId: string) {
  const supabase = await createSupabaseServerClient();
  return getDocumentSignedUrlWith({ supabase, db }, documentId);
}

/**
 * Server Action: deletes a document the caller owns — the Storage object plus
 * the `documents` row. `jobs`/`ai_usage_ledger` history is KEPT (ADR-1).
 *
 * Thin cookie wrapper around the pure `deleteDocumentWith`: resolves the
 * caller's workspace and the cookie-bound Supabase client, then injects the
 * Storage + Drizzle effects. The terminal-state guard runs server-side inside
 * the seam, so a stale UI cannot force-delete a running job. `clientId` is used
 * only to revalidate the view — tenancy is owned by the workspace scope + RLS,
 * never by the client-passed id. Returns `{ ok }`.
 */
export async function deleteDocument(input: {
  documentId: string;
  clientId: string;
}): Promise<DeleteDocumentResult> {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) {
    return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  const supabase = await createSupabaseServerClient();

  const result = await deleteDocumentWith(
    { supabase, db },
    { workspaceId, documentId: input.documentId },
  );

  if (result.ok) {
    revalidatePath(`/clients/${input.clientId}`);
  }

  return result;
}

/**
 * Server Action: retries a FAILED document extraction. Resets the job to
 * `pending` (via the privileged service_role connection — jobs UPDATE is
 * service_role-only) and re-enqueues the Inngest worker, which re-runs its gates
 * from the top. Terminal causes (no_key_configured/budget_exceeded) re-fail
 * cleanly with the curated message (no infinite burn). Tenancy is owned by the
 * resolved workspace scope inside the seam; `clientId` only drives revalidation.
 */
export async function retryExtraction(input: {
  jobId: string;
  clientId: string;
}): Promise<RetryExtractionResult> {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) {
    return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  // F8 plan gate (PAID feature) — enqueue-time, defense-in-depth. A Free user is
  // redirected to /upgrade before the extraction is re-enqueued. See
  // `uploadDocument` for the NEXT_REDIRECT / infra-error rationale.
  try {
    await requirePlan(workspaceId, "pro");
  } catch (e) {
    if (e instanceof PlanGateError) redirect("/upgrade");
    throw e;
  }

  const result = await retryExtractionWith(
    { db: serviceDb, inngest },
    { workspaceId, jobId: input.jobId },
  );

  if (result.ok) {
    revalidatePath(`/clients/${input.clientId}`);
  }

  return result;
}

/**
 * Server Action consumed by the notes tab's `useActionState`.
 *
 * Resolves the caller's workspace, then delegates to the pure
 * `createNoteInWorkspace` (Zod validation BEFORE DB — body required, max 10000
 * chars; INSERT via the user-JWT Supabase server client so the
 * `notes_insert_own_workspace` RLS policy enforces tenancy). ZERO service_role.
 */
export async function createNote(
  _prevState: CreateNoteState,
  formData: FormData,
): Promise<CreateNoteState> {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) {
    return {
      status: "error",
      message: "Tu sesión expiró. Volvé a iniciar sesión.",
    };
  }

  const clientId = formData.get("clientId");
  if (typeof clientId !== "string" || clientId.length === 0) {
    return { status: "error", message: "Falta el cliente de la nota." };
  }

  const supabase = await createSupabaseServerClient();

  const result = await createNoteInWorkspace(supabase, workspaceId, {
    clientId,
    body: formData.get("body"),
  });

  if (result.status === "success") {
    revalidatePath(`/clients/${clientId}`);
  }

  return result;
}
