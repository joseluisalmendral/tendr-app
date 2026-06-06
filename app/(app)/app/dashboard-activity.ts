import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { cases } from "@/db/schema/crm";
import { createClient } from "@/lib/supabase/server";

export type ActivityItem = {
  id: string;
  /** Human-readable label already localized for display. */
  label: string;
  at: string;
};

export type RecentActivity = {
  items: ActivityItem[];
  /**
   * "audit" when sourced from audit_log via the user-JWT SELECT policy;
   * "cases" when we fell back to latest cases (audit SELECT returned nothing
   * usable). Surfaced so the UI can be honest about the source.
   */
  source: "audit" | "cases";
};

const ACTION_LABELS: Record<string, string> = {
  move_case: "Movió un caso",
  promote_user: "Vinculó su cuenta",
  promotion: "Vinculó su cuenta",
};

/**
 * Recent activity for the dashboard.
 *
 * Primary source: audit_log read through the Supabase SERVER client (user
 * JWT), so the audit_log_select_own_workspace RLS policy scopes rows to the
 * caller. Falls back to the latest cases (by updated_at) via a Drizzle
 * explicit-workspace read when audit returns no rows or errors — the UI shows
 * which source was used.
 */
export async function getRecentActivity(
  workspaceId: string,
  limit = 5,
): Promise<RecentActivity> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, action, resource_type, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!error && data && data.length > 0) {
    return {
      source: "audit",
      items: data.map((row) => ({
        id: String(row.id),
        label:
          ACTION_LABELS[row.action] ?? `${row.action} (${row.resource_type})`,
        at: row.created_at,
      })),
    };
  }

  const recentCases = await db
    .select({
      id: cases.id,
      title: cases.title,
      updatedAt: cases.updatedAt,
    })
    .from(cases)
    .where(eq(cases.workspaceId, workspaceId))
    .orderBy(desc(cases.updatedAt))
    .limit(limit);

  return {
    source: "cases",
    items: recentCases.map((c) => ({
      id: c.id,
      label: `Caso actualizado: ${c.title}`,
      at: c.updatedAt.toISOString(),
    })),
  };
}
