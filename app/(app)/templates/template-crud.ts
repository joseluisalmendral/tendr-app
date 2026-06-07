import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import type * as schema from "@/db/schema";
import { templates } from "@/db/schema";

/**
 * Pure, import-testable seams for the /templates CRUD Server Actions (F7 Block C
 * / PR4b). Same seam-plus-thin-wrapper convention as the F7 ai-settings actions:
 * the logic lives here against an injected Drizzle handle, the `"use server"`
 * wrapper (templates/actions.ts) resolves the session workspace and injects the
 * real `db`.
 *
 * Tenancy: templates carries full RLS (SELECT/INSERT/UPDATE/DELETE policies on
 * `workspace_id`), and the user-session `db` handle is RLS-bound. Per the F7
 * design boundary rule we ALSO carry an explicit `eq(templates.workspaceId, …)`
 * predicate on every read/write as the authoritative tenancy gate (the pooler
 * can bypass RLS), and the INSERT always stamps `workspace_id` from the resolved
 * session — never from client input. Cross-workspace ids resolve to zero rows.
 *
 * No audit_log row is written for template CRUD (spec scopes audit to the
 * provider-key / feature-model actions only).
 */

/**
 * Bounds live in template-limits.ts (client-safe, dependency-free) so the
 * form dialog can import them without bundling this server seam. Re-exported
 * here for server-side consumers and existing imports.
 */
export {
  TEMPLATE_NAME_MAX_LENGTH,
  TEMPLATE_BODY_MAX_LENGTH,
  TEMPLATE_VARIABLE_MAX_LENGTH,
  TEMPLATE_MAX_VARIABLES,
} from "./template-limits";
import {
  TEMPLATE_NAME_MAX_LENGTH,
  TEMPLATE_BODY_MAX_LENGTH,
  TEMPLATE_VARIABLE_MAX_LENGTH,
  TEMPLATE_MAX_VARIABLES,
} from "./template-limits";

const variableSchema = z
  .string()
  .trim()
  .min(1)
  .max(TEMPLATE_VARIABLE_MAX_LENGTH);

const baseFields = {
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(
    TEMPLATE_NAME_MAX_LENGTH,
    `El nombre no puede superar ${TEMPLATE_NAME_MAX_LENGTH} caracteres.`,
  ),
  bodyMarkdown: z
    .string()
    .min(1, "El cuerpo de la plantilla es obligatorio.")
    .max(
      TEMPLATE_BODY_MAX_LENGTH,
      `El cuerpo no puede superar ${TEMPLATE_BODY_MAX_LENGTH} caracteres.`,
    ),
  variables: z.array(variableSchema).max(TEMPLATE_MAX_VARIABLES).optional(),
};

export const createTemplateSchema = z.object(baseFields);
export const updateTemplateSchema = z.object({
  id: z.string().uuid(),
  ...baseFields,
});
export const deleteTemplateSchema = z.object({ id: z.string().uuid() });

export type CreateTemplateInput = z.input<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.input<typeof updateTemplateSchema>;
export type DeleteTemplateInput = z.input<typeof deleteTemplateSchema>;

/** Row shape the /templates table renders (no over-fetch). */
export type TemplateRow = {
  id: string;
  name: string;
  bodyMarkdown: string;
  variables: string[];
  updatedAt: string;
};

export type TemplateMutationResult =
  | { ok: true; template: TemplateRow }
  | { ok: false; error: string; fieldErrors?: Partial<Record<"name" | "bodyMarkdown", string>> };

export type TemplateDeleteResult =
  | { ok: true }
  | { ok: false; error: string };

export interface TemplateCrudDeps {
  /** User-session Drizzle client (RLS applies). */
  db: PostgresJsDatabase<typeof schema>;
}

const GENERIC_ERROR =
  "No pudimos guardar la plantilla. Inténtalo de nuevo en un momento.";
const NOT_FOUND_ERROR = "No se encontró la plantilla.";

function toRow(row: {
  id: string;
  name: string;
  bodyMarkdown: string;
  variables: string[] | null;
  updatedAt: Date;
}): TemplateRow {
  return {
    id: row.id,
    name: row.name,
    bodyMarkdown: row.bodyMarkdown,
    variables: row.variables ?? [],
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Maps Zod issues to the inline field errors the dialog renders. */
function fieldErrorsFrom(
  error: z.ZodError,
): Partial<Record<"name" | "bodyMarkdown", string>> {
  const out: Partial<Record<"name" | "bodyMarkdown", string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (field === "name" || field === "bodyMarkdown") {
      out[field] ??= issue.message;
    }
  }
  return out;
}

const SELECT_COLUMNS = {
  id: templates.id,
  name: templates.name,
  bodyMarkdown: templates.bodyMarkdown,
  variables: templates.variables,
  updatedAt: templates.updatedAt,
} as const;

/**
 * Lists the workspace templates ordered by most-recently updated. Explicit
 * workspaceId gate; returns only the columns the table needs.
 */
export async function listTemplates(
  deps: TemplateCrudDeps,
  workspaceId: string,
): Promise<TemplateRow[]> {
  const rows = await deps.db
    .select(SELECT_COLUMNS)
    .from(templates)
    .where(eq(templates.workspaceId, workspaceId))
    .orderBy(desc(templates.updatedAt));
  return rows.map(toRow);
}

export async function createTemplateWith(
  deps: TemplateCrudDeps,
  workspaceId: string,
  rawInput: CreateTemplateInput,
): Promise<TemplateMutationResult> {
  const parsed = createTemplateSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Revisa los campos marcados.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }
  const { name, bodyMarkdown, variables } = parsed.data;

  try {
    const [row] = await deps.db
      .insert(templates)
      .values({ workspaceId, name, bodyMarkdown, variables: variables ?? [] })
      .returning(SELECT_COLUMNS);
    if (!row) return { ok: false, error: GENERIC_ERROR };
    return { ok: true, template: toRow(row) };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function updateTemplateWith(
  deps: TemplateCrudDeps,
  workspaceId: string,
  rawInput: UpdateTemplateInput,
): Promise<TemplateMutationResult> {
  const parsed = updateTemplateSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Revisa los campos marcados.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }
  const { id, name, bodyMarkdown, variables } = parsed.data;

  try {
    // Explicit workspaceId gate: a cross-workspace id matches zero rows and
    // returns nothing (the RLS UPDATE policy WITH CHECK rejects it too).
    const [row] = await deps.db
      .update(templates)
      .set({ name, bodyMarkdown, variables: variables ?? [] })
      .where(and(eq(templates.id, id), eq(templates.workspaceId, workspaceId)))
      .returning(SELECT_COLUMNS);
    if (!row) return { ok: false, error: NOT_FOUND_ERROR };
    return { ok: true, template: toRow(row) };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function deleteTemplateWith(
  deps: TemplateCrudDeps,
  workspaceId: string,
  rawInput: DeleteTemplateInput,
): Promise<TemplateDeleteResult> {
  const parsed = deleteTemplateSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: NOT_FOUND_ERROR };
  }
  const { id } = parsed.data;

  try {
    const deleted = await deps.db
      .delete(templates)
      .where(and(eq(templates.id, id), eq(templates.workspaceId, workspaceId)))
      .returning({ id: templates.id });
    if (deleted.length === 0) return { ok: false, error: NOT_FOUND_ERROR };
    return { ok: true };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}
