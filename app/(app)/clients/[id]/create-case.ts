import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * Pure, import-testable case-creation logic for the `createCase` Server Action,
 * isolated from cookie/`next/headers` plumbing (same seam pattern as
 * `createClientInWorkspace`). It takes an injected Supabase client so tests can
 * exercise it with a real user-session client against the local stack, while
 * production injects the cookie-bound server client.
 *
 * Tenancy is enforced by the `cases_insert_own_workspace` RLS policy under the
 * caller's JWT — NOT by service_role. The explicit `workspace_id` on the insert
 * is resolved from the caller's session; the WITH CHECK predicate rejects any
 * attempt to write into a foreign workspace.
 */

// The 5-value case status enum, mirrored from db/schema/enums.ts (case_status).
export const CASE_STATUS_VALUES = [
  "prospect",
  "proposal",
  "active",
  "closed_won",
  "closed_lost",
] as const;

export type CaseStatus = (typeof CASE_STATUS_VALUES)[number];

// Created case row, narrowed to the columns the cases tab actually displays.
export type CreatedCase = {
  id: string;
  title: string;
  status: CaseStatus;
  valueCents: number | null;
};

/**
 * Discriminated-union result consumed by `useActionState` (mirrors
 * `CreateClientState`). `fieldErrors` carries per-field Zod messages so the
 * dialog can render inline errors.
 */
export type CreateCaseState =
  | { status: "idle" }
  | { status: "success"; case: CreatedCase }
  | {
      status: "error";
      message: string;
      fieldErrors?: Partial<Record<"title" | "status" | "valueCents", string>>;
    };

/**
 * Validation schema. Title is required; status must be one of the 5 enum
 * values; value_cents is optional but, when present, must be a non-negative
 * integer. An empty-string value_cents from the form is normalized to undefined
 * so the optional branch applies instead of failing the number coercion.
 */
const createCaseSchema = z.object({
  title: z.string().trim().min(1, "El título es obligatorio."),
  status: z.enum(CASE_STATUS_VALUES, {
    message: "Elige un estado válido.",
  }),
  valueCents: z
    .union([
      z.literal(""),
      z.coerce
        .number({ message: "Introduce un monto válido." })
        .int("El monto debe ser un número entero de centavos.")
        .min(0, "El monto no puede ser negativo."),
    ])
    .optional()
    .transform((value) => (value === "" || value === undefined ? undefined : value)),
});

export type CreateCaseInput = {
  clientId: string;
  title: FormDataEntryValue | null;
  status: FormDataEntryValue | null;
  valueCents: FormDataEntryValue | null;
};

const GENERIC_ERROR =
  "No pudimos crear el caso. Intentá de nuevo en un momento.";

/**
 * Validates the raw form input with Zod BEFORE any DB call, then inserts the
 * case through the injected (user-JWT) Supabase client so RLS applies. On
 * invalid input it returns an error state WITHOUT touching the database.
 *
 * @param supabase user-session client (RLS-enforcing)
 * @param workspaceId the caller's resolved workspace id
 * @param input raw form values (clientId is already resolved server-side)
 */
export async function createCaseInWorkspace(
  supabase: SupabaseClient,
  workspaceId: string,
  input: CreateCaseInput,
): Promise<CreateCaseState> {
  // FormData yields `null` for absent fields and "" for empty inputs. Normalize
  // both to "" so the optional/enum branches apply consistently.
  const toText = (value: FormDataEntryValue | null): string =>
    typeof value === "string" ? value : "";

  const parsed = createCaseSchema.safeParse({
    title: toText(input.title),
    status: toText(input.status),
    valueCents: toText(input.valueCents),
  });

  // Invalid input is rejected BEFORE any Supabase call (no DB row created).
  if (!parsed.success) {
    const fieldErrors: NonNullable<
      Extract<CreateCaseState, { status: "error" }>["fieldErrors"]
    > = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === "title" || field === "status" || field === "valueCents") {
        fieldErrors[field] ??= issue.message;
      }
    }
    return {
      status: "error",
      message: "Revisa los campos marcados.",
      fieldErrors,
    };
  }

  const { title, status, valueCents } = parsed.data;

  const { data, error } = await supabase
    .from("cases")
    .insert({
      workspace_id: workspaceId,
      client_id: input.clientId,
      title,
      status,
      value_cents: valueCents ?? null,
    })
    .select("id, title, status, value_cents")
    .single();

  if (error || !data) {
    return { status: "error", message: GENERIC_ERROR };
  }

  return {
    status: "success",
    case: {
      id: data.id as string,
      title: data.title as string,
      status: (data.status as CaseStatus) ?? "prospect",
      valueCents: (data.value_cents as number | null) ?? null,
    },
  };
}
