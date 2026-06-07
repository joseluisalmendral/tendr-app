"use server";

import { revalidatePath } from "next/cache";

import { ensureAnonymousWorkspace } from "@/app/(auth)/actions";
import { db } from "@/db";
import { getBudgetStatus } from "@/lib/ai/cost-budget";
import { getCurrentWorkspace } from "@/lib/auth/get-current-workspace";

import {
  createTemplateWith,
  deleteTemplateWith,
  updateTemplateWith,
  type CreateTemplateInput,
  type DeleteTemplateInput,
  type TemplateDeleteResult,
  type TemplateMutationResult,
  type UpdateTemplateInput,
} from "./template-crud";

export type {
  TemplateMutationResult,
  TemplateDeleteResult,
  TemplateRow,
} from "./template-crud";

/**
 * Thin `"use server"` wrappers for the /templates CRUD actions plus a small
 * budget-status read used by the adapt dialog to decide whether to toast the
 * 80% warning after a successful stream (design §7 — the stream itself cannot
 * easily push a flag, so the dialog re-reads the budget once the stream ends).
 *
 * Each CRUD wrapper resolves the caller's workspace (provisioning an anonymous
 * one for a fresh visitor) and injects the real user-session `db` into the pure
 * seam. On success it revalidates /templates so the RSC table reflects the row.
 */

async function resolveWorkspaceId(): Promise<string | null> {
  let current = await getCurrentWorkspace();
  if (current && current.workspaceId === null) {
    await ensureAnonymousWorkspace();
    current = await getCurrentWorkspace();
  }
  return current?.workspaceId ?? null;
}

const SESSION_ERROR = "Tu sesión expiró. Vuelve a iniciar sesión.";

export async function createTemplate(
  input: CreateTemplateInput,
): Promise<TemplateMutationResult> {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) return { ok: false, error: SESSION_ERROR };

  const result = await createTemplateWith({ db }, workspaceId, input);
  if (result.ok) revalidatePath("/templates");
  return result;
}

export async function updateTemplate(
  input: UpdateTemplateInput,
): Promise<TemplateMutationResult> {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) return { ok: false, error: SESSION_ERROR };

  const result = await updateTemplateWith({ db }, workspaceId, input);
  if (result.ok) revalidatePath("/templates");
  return result;
}

export async function deleteTemplate(
  input: DeleteTemplateInput,
): Promise<TemplateDeleteResult> {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) return { ok: false, error: SESSION_ERROR };

  const result = await deleteTemplateWith({ db }, workspaceId, input);
  if (result.ok) revalidatePath("/templates");
  return result;
}

/**
 * Reads the current month's budget warning flag for the resolved workspace.
 * Used by the adapt dialog to surface the 80% sonner toast once a stream ends
 * (the streaming Route Handler cannot push the flag through the byte stream).
 * Returns `false` defensively when there is no session.
 */
export async function getBudgetWarningAction(): Promise<boolean> {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) return false;
  const status = await getBudgetStatus(db, workspaceId);
  return status.warningThreshold;
}
