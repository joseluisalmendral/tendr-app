import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  provisionTenant,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";

/**
 * deleteProviderKeyWith (the pure key-revoke seam) exercised against the REAL
 * local Supabase stack: serviceDb DELETE of ai_provider_configs + audit_log
 * insert. NO secret crosses the boundary (provider id only), so there is no
 * faked outbound effect at all.
 *
 * The real `encryptProviderKey` seeds genuine envelope ciphertext so the DELETE
 * removes a real row (not a synthetic one).
 *
 * Covers F7c PR-F7C-2 design 5:
 *   - configured key  -> row removed + audit row { provider } only, no key bytes
 *   - no key for provider -> clear error, NO audit row (idempotent no-op)
 *   - cross-workspace provider -> NOT revoked (explicit tenancy gate)
 *
 * DATABASE_URL must be exported in the shell (vitest has no env loader).
 */
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Obviously-fake, deterministic 64-hex test KEK (32 bytes). NOT a real secret.
const TEST_KEK = "ab".repeat(32);
const PLAINTEXT_KEY = "sk-test-PLAINTEXT-do-not-log-0123456789";

let priorKek: string | undefined;

beforeAll(() => {
  priorKek = process.env.AI_KEY_KEK;
  process.env.AI_KEY_KEK = TEST_KEK;
});

afterAll(() => {
  if (priorKek === undefined) {
    delete process.env.AI_KEY_KEK;
  } else {
    process.env.AI_KEY_KEK = priorKek;
  }
});

describe("deleteProviderKeyWith", () => {
  let tenant: Tenant;
  let otherTenant: Tenant;
  let serviceDb: typeof import("@/db/service")["serviceDb"];
  let del: typeof import("../delete-provider-key")["deleteProviderKeyWith"];
  let encryptProviderKey: typeof import("@/lib/crypto/envelope")["encryptProviderKey"];
  let aiProviderConfigs: typeof import("@/db/schema")["aiProviderConfigs"];
  let auditLog: typeof import("@/db/schema")["auditLog"];
  let eq: typeof import("drizzle-orm")["eq"];
  let and: typeof import("drizzle-orm")["and"];

  /** Seeds a configured provider key for a workspace (real envelope columns). */
  async function seedKey(
    workspaceId: string,
    provider: "google" | "openai",
  ): Promise<void> {
    const envelope = encryptProviderKey(PLAINTEXT_KEY);
    await serviceDb.insert(aiProviderConfigs).values({
      workspaceId,
      provider,
      encryptedKey: envelope.encryptedKey,
      keyIv: envelope.keyIv,
      keyTag: envelope.keyTag,
      encryptedDek: envelope.encryptedDek,
      keyValidatedAt: new Date(),
    });
  }

  beforeAll(async () => {
    ({ serviceDb } = await import("@/db/service"));
    ({ deleteProviderKeyWith: del } = await import("../delete-provider-key"));
    ({ encryptProviderKey } = await import("@/lib/crypto/envelope"));
    ({ aiProviderConfigs, auditLog } = await import("@/db/schema"));
    ({ eq, and } = await import("drizzle-orm"));

    tenant = await provisionTenant("delete-key");
    otherTenant = await provisionTenant("delete-key-other");
  });

  afterAll(async () => {
    await teardownTenants(tenant, otherTenant);
  });

  afterEach(async () => {
    for (const ws of [tenant.workspaceId, otherTenant.workspaceId]) {
      await serviceDb
        .delete(aiProviderConfigs)
        .where(eq(aiProviderConfigs.workspaceId, ws));
      await serviceDb.delete(auditLog).where(eq(auditLog.workspaceId, ws));
    }
  });

  it("configured key: removes the row + writes audit { provider } only (no key bytes)", async () => {
    await seedKey(tenant.workspaceId, "google");

    const result = await del(
      { serviceDb },
      tenant.workspaceId,
      { provider: "google" },
      tenant.userId,
    );

    expect(result).toEqual({ ok: true });
    // The result NEVER carries the key.
    expect(JSON.stringify(result)).not.toContain(PLAINTEXT_KEY);

    const configs = await serviceDb
      .select({ id: aiProviderConfigs.id })
      .from(aiProviderConfigs)
      .where(
        and(
          eq(aiProviderConfigs.workspaceId, tenant.workspaceId),
          eq(aiProviderConfigs.provider, "google"),
        ),
      );
    expect(configs.length).toBe(0);

    const audits = await serviceDb
      .select({ action: auditLog.action, metadata: auditLog.metadata })
      .from(auditLog)
      .where(eq(auditLog.workspaceId, tenant.workspaceId));
    const delAudit = audits.find((a) => a.action === "delete_provider_key");
    expect(delAudit).toBeDefined();
    expect(delAudit?.metadata).toEqual({ provider: "google" });
    // Audit metadata carries NO key bytes.
    expect(JSON.stringify(delAudit?.metadata)).not.toContain(PLAINTEXT_KEY);
  });

  it("no key for provider: clear error, NO audit row (idempotent no-op)", async () => {
    // Nothing seeded for the tenant.
    const result = await del(
      { serviceDb },
      tenant.workspaceId,
      { provider: "openai" },
      tenant.userId,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("No hay key configurada");

    const audits = await serviceDb
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(eq(auditLog.workspaceId, tenant.workspaceId));
    expect(audits.length).toBe(0);
  });

  it("cross-workspace: another workspace's key is NOT revoked (tenancy gate)", async () => {
    await seedKey(otherTenant.workspaceId, "google");

    // tenant tries to revoke google — but tenant has no google key; the explicit
    // (workspace, provider) gate means otherTenant's row is untouched.
    const result = await del(
      { serviceDb },
      tenant.workspaceId,
      { provider: "google" },
      tenant.userId,
    );

    expect(result.ok).toBe(false);

    const otherConfigs = await serviceDb
      .select({ id: aiProviderConfigs.id })
      .from(aiProviderConfigs)
      .where(
        and(
          eq(aiProviderConfigs.workspaceId, otherTenant.workspaceId),
          eq(aiProviderConfigs.provider, "google"),
        ),
      );
    expect(otherConfigs.length).toBe(1);
  });
});
