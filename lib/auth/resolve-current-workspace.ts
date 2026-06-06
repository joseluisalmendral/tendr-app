import type { SupabaseClient, User } from "@supabase/supabase-js";

export type CurrentWorkspace = {
  user: User;
  /**
   * Null when the user has no workspace yet. The caller is responsible for
   * creating one via the `ensureAnonymousWorkspace` Server Action — this
   * helper is read-only and never writes during render.
   */
  workspaceId: string | null;
  /**
   * Display name of the current workspace. Null when the user has no
   * workspace yet (same condition as workspaceId === null).
   */
  workspaceName: string | null;
  /**
   * From Supabase's `is_anonymous` flag. Never inferred from the absence of
   * an email: a user can have a linked email and still be anonymous until
   * the magic link is verified.
   */
  isAnonymous: boolean;
};

/**
 * Pure decision logic for "who am I and which workspace am I in", isolated
 * from cookie/`next/headers` plumbing so it is import-testable in a node
 * environment against the real local Supabase stack.
 *
 * Given any Supabase client (cookie-bound server client in production, a
 * signed-in or anonymous session client in tests), resolves the
 * `CurrentWorkspace`, or null when there is no authenticated user.
 */
export async function resolveCurrentWorkspace(
  supabase: SupabaseClient,
): Promise<CurrentWorkspace | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // MVP model: workspace ownership is 1:1 (owner_id is UNIQUE), and the
  // workspaces_select_own RLS policy scopes this query to the caller.
  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select("id, name")
    .eq("owner_id", user.id)
    .maybeSingle();

  // A query failure is not the same as "no workspace yet": surfacing it
  // prevents callers from spuriously triggering workspace creation.
  if (error) {
    throw new Error("Failed to resolve current workspace", { cause: error });
  }

  return {
    user,
    workspaceId: workspace?.id ?? null,
    workspaceName: workspace?.name ?? null,
    isAnonymous: user.is_anonymous ?? false,
  };
}
