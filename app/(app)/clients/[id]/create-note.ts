import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * Pure, import-testable note-creation logic for the `createNote` Server Action,
 * isolated from cookie/`next/headers` plumbing (same seam pattern as
 * `createClientInWorkspace`). It takes an injected Supabase client so tests can
 * exercise it with a real user-session client against the local stack, while
 * production injects the cookie-bound server client.
 *
 * Tenancy is enforced by the `notes_insert_own_workspace` RLS policy under the
 * caller's JWT — NOT by service_role. The note is attached to a client_id so it
 * also satisfies the `notes_client_or_case_check` constraint (a note must
 * reference at least a client or a case).
 */

// Max body length (chars). Bodies longer than this are rejected by Zod BEFORE
// any DB call, so no oversized row is ever inserted.
export const NOTE_BODY_MAX_LENGTH = 10000;

// Created note row, narrowed to the columns the notes tab actually displays.
export type CreatedNote = {
  id: string;
  body: string;
  createdAt: string;
};

/**
 * Discriminated-union result consumed by `useActionState` (mirrors
 * `CreateClientState`). `fieldErrors` carries the per-field Zod message so the
 * textarea can render an inline error.
 */
export type CreateNoteState =
  | { status: "idle" }
  | { status: "success"; note: CreatedNote }
  | {
      status: "error";
      message: string;
      fieldErrors?: Partial<Record<"body", string>>;
    };

/**
 * Validation schema. Body is required (non-empty after trim) and capped at
 * NOTE_BODY_MAX_LENGTH characters. The max check runs on the raw input before
 * trimming so a 10001-char body is rejected as too long, not silently trimmed.
 */
const createNoteSchema = z.object({
  body: z
    .string()
    .max(
      NOTE_BODY_MAX_LENGTH,
      `La nota no puede superar los ${NOTE_BODY_MAX_LENGTH} caracteres.`,
    )
    .refine((value) => value.trim().length > 0, "La nota no puede estar vacía."),
});

export type CreateNoteInput = {
  clientId: string;
  body: FormDataEntryValue | null;
};

const GENERIC_ERROR =
  "No pudimos guardar la nota. Intentá de nuevo en un momento.";

/**
 * Validates the raw form input with Zod BEFORE any DB call, then inserts the
 * note through the injected (user-JWT) Supabase client so RLS applies. On
 * invalid input (empty or over the length cap) it returns an error state
 * WITHOUT touching the database.
 *
 * @param supabase user-session client (RLS-enforcing)
 * @param workspaceId the caller's resolved workspace id
 * @param input raw form values (clientId is already resolved server-side)
 */
export async function createNoteInWorkspace(
  supabase: SupabaseClient,
  workspaceId: string,
  input: CreateNoteInput,
): Promise<CreateNoteState> {
  const body = typeof input.body === "string" ? input.body : "";

  const parsed = createNoteSchema.safeParse({ body });

  // Invalid input is rejected BEFORE any Supabase call (no DB row created).
  if (!parsed.success) {
    const fieldErrors: NonNullable<
      Extract<CreateNoteState, { status: "error" }>["fieldErrors"]
    > = {};
    for (const issue of parsed.error.issues) {
      if (issue.path[0] === "body") {
        fieldErrors.body ??= issue.message;
      }
    }
    return {
      status: "error",
      message: "Revisá la nota.",
      fieldErrors,
    };
  }

  const { data, error } = await supabase
    .from("notes")
    .insert({
      workspace_id: workspaceId,
      client_id: input.clientId,
      body: parsed.data.body,
    })
    .select("id, body, created_at")
    .single();

  if (error || !data) {
    return { status: "error", message: GENERIC_ERROR };
  }

  return {
    status: "success",
    note: {
      id: data.id as string,
      body: data.body as string,
      createdAt: data.created_at as string,
    },
  };
}
