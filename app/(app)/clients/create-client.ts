import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * Pure, import-testable client-creation logic for the `createClient` Server
 * Action, isolated from cookie/`next/headers` plumbing (same seam pattern as
 * `resolveCurrentWorkspace`). It takes an injected Supabase client so tests can
 * exercise it with a real user-session client against the local stack, while
 * production injects the cookie-bound server client.
 *
 * Tenancy is enforced by the `clients_insert_own_workspace` RLS policy under
 * the caller's JWT — NOT by service_role. The explicit `workspace_id` on the
 * insert is resolved from the caller's session, and the WITH CHECK predicate
 * rejects any attempt to write into a foreign workspace.
 */

// Created client row, narrowed to the columns the table actually displays.
export type CreatedClient = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  tags: string[];
  status: "active" | "archived";
};

/**
 * Discriminated-union result consumed by `useActionState` (mirrors
 * `SendMagicLinkState` in app/login/actions.ts). `fieldErrors` carries
 * per-field Zod messages so the dialog can render inline errors.
 */
export type CreateClientState =
  | { status: "idle" }
  | { status: "success"; client: CreatedClient }
  | {
      status: "error";
      message: string;
      fieldErrors?: Partial<Record<"name" | "email" | "company" | "tags", string>>;
    };

/**
 * Validation schema. Name is required; email is optional but must be a valid
 * address when present; company and tags are optional. An empty-string email
 * coming from the form is normalized to `undefined` so the optional branch
 * applies instead of failing the `.email()` check.
 */
const createClientSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio."),
  email: z
    .union([z.literal(""), z.string().trim().email("Ingresá un email válido.")])
    .optional()
    .transform((value) => (value ? value : undefined)),
  company: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
  tags: z.array(z.string().trim().min(1)).optional(),
});

export type CreateClientInput = {
  name: FormDataEntryValue | null;
  email: FormDataEntryValue | null;
  company: FormDataEntryValue | null;
  /** Comma-separated tags as typed in a single input. */
  tags: FormDataEntryValue | null;
};

const GENERIC_ERROR =
  "No pudimos crear el cliente. Intentá de nuevo en un momento.";

/**
 * Validates the raw form input with Zod BEFORE any DB call, then inserts the
 * client through the injected (user-JWT) Supabase client so RLS applies. On
 * invalid input it returns an error state WITHOUT touching the database.
 *
 * @param supabase user-session client (RLS-enforcing)
 * @param workspaceId the caller's resolved workspace id
 * @param input raw form values
 */
export async function createClientInWorkspace(
  supabase: SupabaseClient,
  workspaceId: string,
  input: CreateClientInput,
): Promise<CreateClientState> {
  const rawTags =
    typeof input.tags === "string"
      ? input.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
      : undefined;

  // FormData yields `null` for absent fields and "" for empty inputs. Normalize
  // both to "" so the optional/email union branches apply consistently.
  const toText = (value: FormDataEntryValue | null): string =>
    typeof value === "string" ? value : "";

  const parsed = createClientSchema.safeParse({
    name: toText(input.name),
    email: toText(input.email),
    company: toText(input.company),
    tags: rawTags,
  });

  // Invalid input is rejected BEFORE any Supabase call (no DB row created).
  if (!parsed.success) {
    const fieldErrors: NonNullable<
      Extract<CreateClientState, { status: "error" }>["fieldErrors"]
    > = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (
        field === "name" ||
        field === "email" ||
        field === "company" ||
        field === "tags"
      ) {
        fieldErrors[field] ??= issue.message;
      }
    }
    return {
      status: "error",
      message: "Revisá los campos marcados.",
      fieldErrors,
    };
  }

  const { name, email, company, tags } = parsed.data;

  const { data, error } = await supabase
    .from("clients")
    .insert({
      workspace_id: workspaceId,
      name,
      email: email ?? null,
      company: company ?? null,
      tags: tags ?? [],
    })
    .select("id, name, email, company, tags, status")
    .single();

  if (error || !data) {
    return { status: "error", message: GENERIC_ERROR };
  }

  return {
    status: "success",
    client: {
      id: data.id as string,
      name: data.name as string,
      email: (data.email as string | null) ?? null,
      company: (data.company as string | null) ?? null,
      tags: (data.tags as string[] | null) ?? [],
      status: (data.status as "active" | "archived") ?? "active",
    },
  };
}
