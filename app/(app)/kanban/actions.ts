"use server";

import { revalidatePath } from "next/cache";

import { ensureAnonymousWorkspace } from "@/app/(auth)/actions";
import { getCurrentWorkspace } from "@/lib/auth/get-current-workspace";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

import { moveCaseStatus, type MoveCaseState } from "./move-case";

export type { MoveCaseState } from "./move-case";

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
 * Server Action for a kanban drag move. Unlike the dialog forms (which use
 * `useActionState`), this is gesture-driven: the board dispatches it inside
 * `startTransition` with `useOptimistic` (design §1), so the signature takes
 * `caseId` + `newStatus` directly rather than `(prevState, formData)`.
 *
 * It resolves the caller's workspace only to confirm a session exists; the
 * actual ownership/atomicity enforcement lives in the `move_case` SECURITY
 * DEFINER RPC, invoked through the user-JWT Supabase server client by the pure
 * `moveCaseStatus` seam. ZERO service_role anywhere in this path. On success it
 * revalidates `/kanban` so the RSC re-pulls authoritative grouped rows.
 */
export async function moveCase(
  caseId: string,
  newStatus: string,
): Promise<MoveCaseState> {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) {
    return {
      status: "error",
      message: "Tu sesión expiró. Volvé a iniciar sesión.",
    };
  }

  const supabase = await createSupabaseServerClient();

  const result = await moveCaseStatus(supabase, { caseId, newStatus });

  if (result.status === "success") {
    revalidatePath("/kanban");
  }

  return result;
}
