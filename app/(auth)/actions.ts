"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

const DEFAULT_WORKSPACE_NAME = "Mi workspace";

/**
 * Idempotently creates the caller's workspace (1:1 via UNIQUE owner_id).
 *
 * Safe under concurrent calls: the upsert relies on the owner_id unique
 * constraint with ON CONFLICT DO NOTHING, so parallel invocations converge
 * on the same row instead of racing a check-then-insert. RLS
 * (workspaces_insert_own / workspaces_select_own) scopes everything to the
 * caller, anonymous sessions included.
 */
export async function ensureAnonymousWorkspace(): Promise<{
  workspaceId: string;
  workspaceName: string;
}> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("No session: ensureAnonymousWorkspace requires a user");
  }

  const { error: upsertError } = await supabase.from("workspaces").upsert(
    { owner_id: user.id, name: DEFAULT_WORKSPACE_NAME },
    { onConflict: "owner_id", ignoreDuplicates: true },
  );
  if (upsertError) {
    throw new Error("Failed to create workspace", { cause: upsertError });
  }

  const { data: workspace, error: selectError } = await supabase
    .from("workspaces")
    .select("id, name")
    .eq("owner_id", user.id)
    .single();
  if (selectError) {
    throw new Error("Failed to resolve workspace after creation", {
      cause: selectError,
    });
  }

  return { workspaceId: workspace.id, workspaceName: workspace.name };
}

/**
 * Logs the current user out of ALL sessions and returns them to the landing
 * page.
 *
 * `scope: "global"` revokes every refresh token for the user, not just the
 * current device. On the next request the proxy mints a fresh anonymous
 * session, so a logged-out visitor keeps browsing without a forced /login.
 */
export async function logout(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/");
}
