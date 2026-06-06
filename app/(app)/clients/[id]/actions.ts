"use server";

import { revalidatePath } from "next/cache";

import { ensureAnonymousWorkspace } from "@/app/(auth)/actions";
import { getCurrentWorkspace } from "@/lib/auth/get-current-workspace";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

import { createCaseInWorkspace, type CreateCaseState } from "./create-case";
import { createNoteInWorkspace, type CreateNoteState } from "./create-note";

export type { CreateCaseState } from "./create-case";
export type { CreateNoteState } from "./create-note";

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
