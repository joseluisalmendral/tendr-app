import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type * as schema from "@/db/schema";
import { auditLog } from "@/db/schema";

/**
 * Append-only audit_log insert helper (F7).
 *
 * audit_log has NO user INSERT policy — rows are written exclusively via the
 * service_role connection (matches the F6 extractor precedent). The caller
 * passes a service-role Drizzle client so this helper stays import-testable and
 * the tenancy/actor are explicit (never inferred from ambient state here).
 *
 * SECRETS HARD-STOP: `metadata` MUST carry only non-secret identifiers. Callers
 * NEVER place a plaintext/encrypted provider key, DEK, or any PII in metadata —
 * for key saves the metadata is `{ provider }` only.
 */

export interface InsertAuditLogDeps {
  /** Service-role Drizzle client (audit_log has no user INSERT policy). */
  serviceDb: PostgresJsDatabase<typeof schema>;
}

export interface AuditLogEntry {
  workspaceId: string;
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  /** Non-secret identifiers only. Never keys, DEKs, or PII. */
  metadata?: Record<string, unknown> | null;
}

export async function insertAuditLog(
  deps: InsertAuditLogDeps,
  entry: AuditLogEntry,
): Promise<void> {
  await deps.serviceDb.insert(auditLog).values({
    workspaceId: entry.workspaceId,
    actorId: entry.actorId ?? null,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId ?? null,
    metadata: entry.metadata ?? null,
  });
}
