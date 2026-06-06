import "server-only";

import { cache } from "react";

import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export type CurrentWorkspace = {
  user: User;
  /**
   * Null when the user has no workspace yet. The caller is responsible for
   * creating one via the `ensureAnonymousWorkspace` Server Action — this
   * helper is read-only and never writes during render.
   */
  workspaceId: string | null;
  /**
   * From Supabase's `is_anonymous` flag. Never inferred from the absence of
   * an email: a user can have a linked email and still be anonymous until
   * the magic link is verified.
   */
  isAnonymous: boolean;
};

/**
 * Single entry point for "who am I and which workspace am I in".
 *
 * Wrapped in React.cache() so multiple Server Components calling it within
 * the same render pass share one auth check and one workspace lookup.
 *
 * Returns null when there is no session — protected routes should never
 * reach that state because the proxy creates an anonymous session first.
 */
export const getCurrentWorkspace = cache(
  async (): Promise<CurrentWorkspace | null> => {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // MVP model: workspace ownership is 1:1 (owner_id is UNIQUE), and the
    // workspaces_select_own RLS policy scopes this query to the caller.
    const { data: workspace, error } = await supabase
      .from("workspaces")
      .select("id")
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
      isAnonymous: user.is_anonymous ?? false,
    };
  },
);
