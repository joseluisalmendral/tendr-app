import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type * as schema from "@/db/schema";
import { aiProviderConfigs } from "@/db/schema";
import { aiProvider } from "@/db/schema/enums";
import {
  insertAuditLog,
  type InsertAuditLogDeps,
} from "@/lib/audit/insert-audit-log";

/**
 * Pure, import-testable seam for the `deleteProviderKey` Server Action — the
 * revocation counterpart of `saveProviderKeyWith`. The UI copy on /settings/ai
 * already promises "Puedes revocarla cuando quieras"; this is the action behind
 * that promise (F7c decision #775 finding 5).
 *
 * SECRETS HARD-STOP (binding):
 *   - NO secret crosses this boundary — the action takes only the `provider`
 *     argument + the session-resolved workspaceId. The encrypted envelope row
 *     is DELETEd in place; no key bytes are read, returned, logged, or audited.
 *   - The audit_log metadata carries `{ provider }` ONLY (same shape as save).
 *
 * Tenancy: the DELETE runs via the service-role connection (the encrypted_*
 * columns are REVOKEd from user roles and the write path stays symmetric with
 * the save/decrypt path) and carries an EXPLICIT
 * `eq(workspaceId) AND eq(provider)` predicate as the authoritative tenancy
 * gate — a cross-workspace provider can never be revoked.
 *
 * TAXONOMY NOTE (design 5): after a key is revoked, any
 * `ai_feature_model_mapping` row still pointing at that provider will fail with
 * `NO_KEY_CONFIGURED` at use time, BY DESIGN. The mapping rows are intentionally
 * left untouched here (revoke is about the key, not the feature wiring); the
 * `setFeatureModel` precondition + the extractor's `resolveModelForExtract`
 * both surface the missing key as the curated terminal error.
 */

/** Input schema: provider enum only. NO key, ever. */
export const deleteProviderKeySchema = z.object({
  provider: z.enum(aiProvider.enumValues),
});

export type DeleteProviderKeyInput = z.input<typeof deleteProviderKeySchema>;

export type DeleteProviderKeyResult =
  | { ok: true }
  | { ok: false; error: string };

export interface DeleteProviderKeyDeps extends InsertAuditLogDeps {
  /** Service-role Drizzle client for the envelope-row DELETE. */
  serviceDb: PostgresJsDatabase<typeof schema>;
}

/** Neutral message when the provider has no configured key to revoke. */
const NOT_CONFIGURED_ERROR = "No hay key configurada para ese provider.";

export async function deleteProviderKeyWith(
  deps: DeleteProviderKeyDeps,
  workspaceId: string,
  rawInput: DeleteProviderKeyInput,
  actorId?: string | null,
): Promise<DeleteProviderKeyResult> {
  // 1. Validate the shape BEFORE any side effect.
  const parsed = deleteProviderKeySchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: NOT_CONFIGURED_ERROR };
  }
  const { provider } = parsed.data;

  // 2. Resolve the row id (explicit workspaceId + provider tenancy gate) so the
  //    audit row records WHICH config was revoked and we can refuse a no-op.
  const [row] = await deps.serviceDb
    .select({ id: aiProviderConfigs.id })
    .from(aiProviderConfigs)
    .where(
      and(
        eq(aiProviderConfigs.workspaceId, workspaceId),
        eq(aiProviderConfigs.provider, provider),
      ),
    )
    .limit(1);

  if (!row) {
    // No key for this (workspace, provider): nothing to revoke. Idempotent —
    // a double-click after a successful revoke lands here harmlessly.
    return { ok: false, error: NOT_CONFIGURED_ERROR };
  }

  // 3. DELETE the envelope row by the explicit (workspace_id, provider) gate.
  await deps.serviceDb
    .delete(aiProviderConfigs)
    .where(
      and(
        eq(aiProviderConfigs.workspaceId, workspaceId),
        eq(aiProviderConfigs.provider, provider),
      ),
    );

  // 4. Append the audit row — metadata carries { provider } ONLY (no key).
  await insertAuditLog(deps, {
    workspaceId,
    actorId,
    action: "delete_provider_key",
    resourceType: "ai_provider_config",
    resourceId: row.id,
    metadata: { provider },
  });

  return { ok: true };
}
