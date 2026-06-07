import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import type * as schema from "@/db/schema";
import { templateAdaptations } from "@/db/schema";

/**
 * Pure, import-testable seams for reading + deleting persisted template
 * adaptations (F7c finding 3, decisions #775). Same seam-plus-thin-wrapper
 * convention as template-crud.ts: logic here against an injected Drizzle handle,
 * the `"use server"` wrapper (templates/actions.ts) resolves the session
 * workspace and injects the real `db`.
 *
 * The adaptation rows themselves are WRITTEN automatically by the streaming
 * adaptTemplate seam (app/api/ai/adapt-template, onFinish) — there is no create
 * seam here. PR-F7C-3b's UI consumes `listAdaptations` for the per (template,
 * client) history + copy button and `deleteAdaptationWith` for the delete entry
 * option.
 *
 * Tenancy: template_adaptations carries full deep RLS (SELECT/INSERT/UPDATE/
 * DELETE on workspace_id, migration 0005) and the user-session `db` is RLS-bound.
 * Per the F7 boundary rule we ALSO carry an explicit
 * `eq(template_adaptations.workspaceId, …)` predicate on every read/write as the
 * authoritative tenancy gate. Cross-workspace ids resolve to zero rows.
 *
 * No audit_log row is written: adaptations are derived content, not
 * security-sensitive material like provider keys (audit is scoped to the
 * key / feature-model actions per the F7c spec). Deleting an adaptation only
 * removes the user's own derived row.
 */

export const listAdaptationsSchema = z.object({
  templateId: z.string().uuid(),
  clientId: z.string().uuid(),
});
export const deleteAdaptationSchema = z.object({ id: z.string().uuid() });

export type ListAdaptationsInput = z.input<typeof listAdaptationsSchema>;
export type DeleteAdaptationInput = z.input<typeof deleteAdaptationSchema>;

/** Row shape the adapt-dialog history renders (newest-first). */
export type AdaptationRow = {
  id: string;
  resultText: string;
  extraInstructions: string | null;
  provider: string | null;
  modelId: string | null;
  createdAt: string;
};

export type AdaptationDeleteResult =
  | { ok: true }
  | { ok: false; error: string };

export interface AdaptationsCrudDeps {
  /** User-session Drizzle client (RLS applies). */
  db: PostgresJsDatabase<typeof schema>;
}

const NOT_FOUND_ERROR = "No se encontró la adaptación.";
const GENERIC_ERROR =
  "No pudimos eliminar la adaptación. Inténtalo de nuevo en un momento.";

const SELECT_COLUMNS = {
  id: templateAdaptations.id,
  resultText: templateAdaptations.resultText,
  extraInstructions: templateAdaptations.extraInstructions,
  provider: templateAdaptations.provider,
  modelId: templateAdaptations.modelId,
  createdAt: templateAdaptations.createdAt,
} as const;

function toRow(row: {
  id: string;
  resultText: string;
  extraInstructions: string | null;
  provider: string | null;
  modelId: string | null;
  createdAt: Date;
}): AdaptationRow {
  return {
    id: row.id,
    resultText: row.resultText,
    extraInstructions: row.extraInstructions,
    provider: row.provider,
    modelId: row.modelId,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Lists a workspace's adaptations for a (template, client) pair, newest-first.
 * Explicit workspaceId gate; backed by the
 * (workspace_id, template_id) / (workspace_id, client_id) indexes. Invalid
 * input resolves to an empty list (never throws to the UI).
 */
export async function listAdaptations(
  deps: AdaptationsCrudDeps,
  workspaceId: string,
  rawInput: ListAdaptationsInput,
): Promise<AdaptationRow[]> {
  const parsed = listAdaptationsSchema.safeParse(rawInput);
  if (!parsed.success) return [];
  const { templateId, clientId } = parsed.data;

  const rows = await deps.db
    .select(SELECT_COLUMNS)
    .from(templateAdaptations)
    .where(
      and(
        eq(templateAdaptations.workspaceId, workspaceId),
        eq(templateAdaptations.templateId, templateId),
        eq(templateAdaptations.clientId, clientId),
      ),
    )
    .orderBy(desc(templateAdaptations.createdAt));
  return rows.map(toRow);
}

/**
 * Deletes a single adaptation by id, ownership-gated by workspaceId. A
 * cross-workspace id matches zero rows (and the RLS DELETE policy denies it
 * too) → NOT_FOUND, never a silent success on another tenant's row.
 */
export async function deleteAdaptationWith(
  deps: AdaptationsCrudDeps,
  workspaceId: string,
  rawInput: DeleteAdaptationInput,
): Promise<AdaptationDeleteResult> {
  const parsed = deleteAdaptationSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: NOT_FOUND_ERROR };
  }
  const { id } = parsed.data;

  try {
    const deleted = await deps.db
      .delete(templateAdaptations)
      .where(
        and(
          eq(templateAdaptations.id, id),
          eq(templateAdaptations.workspaceId, workspaceId),
        ),
      )
      .returning({ id: templateAdaptations.id });
    if (deleted.length === 0) return { ok: false, error: NOT_FOUND_ERROR };
    return { ok: true };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}
