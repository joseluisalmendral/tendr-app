"use server";

import { revalidatePath } from "next/cache";

import { ensureAnonymousWorkspace } from "@/app/(auth)/actions";
import { getCurrentWorkspace } from "@/lib/auth/get-current-workspace";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

import {
  createClientInWorkspace,
  type CreateClientState,
} from "./create-client";

export type { CreateClientState } from "./create-client";

/**
 * Server Action consumed by the new-client dialog's `useActionState`.
 *
 * Resolves the caller's workspace from the session, then delegates to the pure
 * `createClientInWorkspace` (Zod validation BEFORE DB; INSERT via the user-JWT
 * Supabase server client so the `clients_insert_own_workspace` RLS policy
 * enforces tenancy). ZERO service_role anywhere in this path.
 *
 * Named `createClient` per the Server Action contract; the Supabase factory is
 * imported aliased (`createSupabaseServerClient`) to avoid the name collision.
 */
export async function createClient(
  _prevState: CreateClientState,
  formData: FormData,
): Promise<CreateClientState> {
  let current = await getCurrentWorkspace();

  // A fresh anonymous visitor may not have a workspace yet — provision one.
  if (current && current.workspaceId === null) {
    await ensureAnonymousWorkspace();
    current = await getCurrentWorkspace();
  }

  if (!current?.workspaceId) {
    return {
      status: "error",
      message: "Tu sesión expiró. Volvé a iniciar sesión.",
    };
  }

  const supabase = await createSupabaseServerClient();

  const result = await createClientInWorkspace(supabase, current.workspaceId, {
    name: formData.get("name"),
    email: formData.get("email"),
    company: formData.get("company"),
    tags: formData.get("tags"),
  });

  // Re-pull the server-rendered list so the RSC table reflects the new row
  // once the optimistic overlay settles.
  if (result.status === "success") {
    revalidatePath("/clients");
  }

  return result;
}
