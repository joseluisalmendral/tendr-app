import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { CASE_STATUS_VALUES, type CaseStatus } from "@/app/(app)/clients/[id]/create-case";

/**
 * Pure, import-testable case-move logic for the `moveCase` Server Action,
 * isolated from cookie/`next/headers` plumbing (same seam pattern as
 * `createCaseInWorkspace`). It takes an injected Supabase client so tests can
 * exercise it with a real user-session client against the local stack, while
 * production injects the cookie-bound server client.
 *
 * Tenancy and atomicity live in the `public.move_case` SECURITY DEFINER RPC
 * (migration 0003): under the caller's JWT it validates ownership, UPDATEs the
 * status and appends the audit_log row in ONE transaction. This seam does NO
 * direct UPDATE and NO direct audit insert — it only validates input and calls
 * the RPC. ZERO service_role anywhere in this path; a cross-workspace caseId is
 * rejected inside the RPC and surfaces here as a clean error state.
 */

// Re-export so kanban consumers can import the status values/type from the seam.
export { CASE_STATUS_VALUES, type CaseStatus };

/**
 * Discriminated-union result. `moveCase` is a drag gesture (no form), so the
 * client dispatches it inside `startTransition` with `useOptimistic`; on
 * `error` the optimistic overlay auto-reverts and a rollback toast fires
 * (design §1). `caseId`/`status` are echoed on success so the caller can
 * reconcile the moved card without re-reading.
 */
export type MoveCaseState =
  | { status: "success"; caseId: string; newStatus: CaseStatus }
  | { status: "error"; message: string };

/**
 * Validation schema. `caseId` must be a UUID; `newStatus` must be one of the 5
 * real `case_status` enum values. Validated BEFORE any RPC call so invalid
 * input never touches the database.
 */
const moveCaseSchema = z.object({
  caseId: z.string().uuid("Identificador de caso inválido."),
  newStatus: z.enum(CASE_STATUS_VALUES, {
    message: "Estado de caso inválido.",
  }),
});

export type MoveCaseInput = {
  caseId: unknown;
  newStatus: unknown;
};

const GENERIC_ERROR =
  "No pudimos mover el caso. Volvé a intentarlo en un momento.";
const FORBIDDEN_ERROR = "No podés mover un caso que no pertenece a tu espacio.";

/**
 * Validates the raw input with Zod BEFORE any DB call, then invokes the atomic
 * `move_case` RPC through the injected (user-JWT) Supabase client. On invalid
 * input it returns an error state WITHOUT touching the database. A
 * cross-workspace or non-existent caseId makes the RPC raise; that surfaces as
 * a clean error state (no leak of which path failed beyond a friendly message).
 *
 * @param supabase user-session client (carries the JWT so the RPC's auth.uid()
 *                 gate resolves to the real caller)
 * @param input raw caseId + newStatus
 */
export async function moveCaseStatus(
  supabase: SupabaseClient,
  input: MoveCaseInput,
): Promise<MoveCaseState> {
  const parsed = moveCaseSchema.safeParse(input);

  // Invalid input is rejected BEFORE any Supabase call (no RPC, no DB touch).
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Datos inválidos.";
    return { status: "error", message };
  }

  const { caseId, newStatus } = parsed.data;

  const { error } = await supabase.rpc("move_case", {
    p_case_id: caseId,
    p_to_status: newStatus,
  });

  if (error) {
    // The RPC raises 'move_case: case not in caller workspace' for foreign or
    // non-existent cases; map that to a friendly ownership error, everything
    // else to the generic failure. No status changed and no audit row exists in
    // either case (the RPC is atomic).
    const isForbidden = error.message.includes("not in caller workspace");
    return {
      status: "error",
      message: isForbidden ? FORBIDDEN_ERROR : GENERIC_ERROR,
    };
  }

  return { status: "success", caseId, newStatus };
}
