import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type * as schema from "@/db/schema";
import { aiProviderConfigs } from "@/db/schema";
import { aiProvider } from "@/db/schema/enums";
import {
  insertAuditLog,
  type InsertAuditLogDeps,
} from "@/lib/audit/insert-audit-log";
import type { EncryptedEnvelope } from "@/lib/crypto/envelope";

/**
 * Pure, import-testable seam for the `saveProviderKey` Server Action (same
 * pattern as `deleteDocumentWith`/`uploadDocumentWith`). Every external effect —
 * the cheap provider validation call, the envelope encryption, the serviceDb
 * UPSERT, and the audit_log insert — is injected via `deps`, so tests drive it
 * against the REAL local Supabase stack and fake ONLY the outbound provider
 * fetch (no network in CI).
 *
 * SECRETS HARD-STOP (binding):
 *   - The plaintext key is validated, then immediately envelope-encrypted, then
 *     DISCARDED. It is NEVER returned, logged, traced, or written to audit
 *     metadata.
 *   - The audit_log metadata carries `{ provider }` ONLY.
 *   - The result is `{ ok: true }` — the action never returns the key, not even
 *     encrypted.
 *
 * Tenancy: the UPSERT and the audit insert both run via the service-role
 * connection (the encrypted_* columns are REVOKEd from user roles for SELECT,
 * and we keep the write path symmetric with the decrypt path) and carry an
 * explicit `workspaceId` as the authoritative tenancy gate.
 */

/** Input schema: provider enum + key length bounds (no upper-secret leakage). */
export const saveProviderKeySchema = z.object({
  provider: z.enum(aiProvider.enumValues),
  key: z.string().min(20).max(200),
});

export type SaveProviderKeyInput = z.input<typeof saveProviderKeySchema>;

export type SaveProviderKeyResult =
  | { ok: true }
  | { ok: false; error: string };

export interface SaveProviderKeyDeps extends InsertAuditLogDeps {
  /** Service-role Drizzle client for the envelope UPSERT. */
  serviceDb: PostgresJsDatabase<typeof schema>;
  /**
   * Cheap per-provider authenticated check. Returns true when the key is
   * accepted by the provider. Injected so tests fake it (no network).
   */
  validateProviderKey: (
    provider: (typeof aiProvider.enumValues)[number],
    plaintextKey: string,
  ) => Promise<boolean>;
  /** Envelope encryption (AES-256-GCM). Injected so tests use a test KEK. */
  encryptProviderKey: (plaintext: string) => EncryptedEnvelope;
}

/** Generic, detail-free message for a rejected key (no provider body leaked). */
const INVALID_KEY_ERROR = "Key inválida";

export async function saveProviderKeyWith(
  deps: SaveProviderKeyDeps,
  workspaceId: string,
  rawInput: SaveProviderKeyInput,
  actorId?: string | null,
): Promise<SaveProviderKeyResult> {
  // 1. Validate the shape BEFORE any side effect.
  const parsed = saveProviderKeySchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: INVALID_KEY_ERROR };
  }
  const { provider, key } = parsed.data;

  // 2. Verify the key with a cheap provider call. On rejection (or a transient
  //    network failure) WRITE NOTHING and return the detail-free message.
  let valid = false;
  try {
    valid = await deps.validateProviderKey(provider, key);
  } catch {
    valid = false;
  }
  if (!valid) {
    return { ok: false, error: INVALID_KEY_ERROR };
  }

  // 3. Envelope-encrypt the plaintext, then let it go out of scope (GC). The
  //    plaintext is never retained, logged, or returned.
  const envelope = deps.encryptProviderKey(key);

  // 4. UPSERT ai_provider_configs by (workspace_id, provider) — explicit
  //    workspaceId tenancy gate. key_validated_at stamps the successful check.
  await deps.serviceDb
    .insert(aiProviderConfigs)
    .values({
      workspaceId,
      provider,
      encryptedKey: envelope.encryptedKey,
      keyIv: envelope.keyIv,
      keyTag: envelope.keyTag,
      encryptedDek: envelope.encryptedDek,
      keyValidatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [aiProviderConfigs.workspaceId, aiProviderConfigs.provider],
      set: {
        encryptedKey: sql`excluded.encrypted_key`,
        keyIv: sql`excluded.key_iv`,
        keyTag: sql`excluded.key_tag`,
        encryptedDek: sql`excluded.encrypted_dek`,
        keyValidatedAt: sql`excluded.key_validated_at`,
      },
    });

  // Resolve the row id for the audit resource_id (explicit tenancy gate).
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

  // 5. Append the audit row — metadata carries { provider } ONLY (no key).
  await insertAuditLog(deps, {
    workspaceId,
    actorId,
    action: "save_provider_key",
    resourceType: "ai_provider_config",
    resourceId: row?.id ?? null,
    metadata: { provider },
  });

  return { ok: true };
}
