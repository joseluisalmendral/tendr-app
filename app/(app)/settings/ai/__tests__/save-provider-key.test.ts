import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  provisionTenant,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";

/**
 * saveProviderKeyWith (the pure key-save seam) exercised against the REAL local
 * Supabase stack: serviceDb UPSERT of ai_provider_configs + audit_log insert.
 * The ONLY faked effect is the outbound provider validation (`validateProviderKey`)
 * so CI performs no network — its true/false return mirrors a real 200/401.
 *
 * The real `encryptProviderKey` runs with an injected, obviously-fake test KEK
 * (NOT a real secret) so the envelope columns are genuine ciphertext.
 *
 * Covers SPEC R-saveProviderKey:
 *   - valid key  -> config row (non-empty encrypted_key) + audit row
 *   - invalid key -> NO config row, NO audit row
 *   - duplicate provider -> UPSERT (encrypted_key replaced, row not duplicated)
 *   - plaintext key appears in NO captured log (HARD-STOP) and is NOT returned
 *
 * DATABASE_URL must be exported in the shell (vitest has no env loader).
 */
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Obviously-fake, deterministic 64-hex test KEK (32 bytes). NOT a real secret.
const TEST_KEK = "ab".repeat(32);

// A plaintext "key" that satisfies the 20-200 length bound; obviously fake.
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

describe("saveProviderKeyWith", () => {
  let tenant: Tenant;
  let serviceDb: typeof import("@/db/service")["serviceDb"];
  let save: typeof import("../save-provider-key")["saveProviderKeyWith"];
  let encryptProviderKey: typeof import("@/lib/crypto/envelope")["encryptProviderKey"];
  let aiProviderConfigs: typeof import("@/db/schema")["aiProviderConfigs"];
  let auditLog: typeof import("@/db/schema")["auditLog"];
  let eq: typeof import("drizzle-orm")["eq"];
  let and: typeof import("drizzle-orm")["and"];

  beforeAll(async () => {
    ({ serviceDb } = await import("@/db/service"));
    ({ saveProviderKeyWith: save } = await import("../save-provider-key"));
    ({ encryptProviderKey } = await import("@/lib/crypto/envelope"));
    ({ aiProviderConfigs, auditLog } = await import("@/db/schema"));
    ({ eq, and } = await import("drizzle-orm"));

    tenant = await provisionTenant("save-key");
  });

  afterAll(async () => {
    await teardownTenants(tenant);
  });

  afterEach(async () => {
    // Reset state between cases (FK cascade removes mappings; clear configs+audit).
    await serviceDb
      .delete(aiProviderConfigs)
      .where(eq(aiProviderConfigs.workspaceId, tenant.workspaceId));
    await serviceDb
      .delete(auditLog)
      .where(eq(auditLog.workspaceId, tenant.workspaceId));
  });

  it("valid key: persists config row + audit row, returns {ok:true} (no key)", async () => {
    const validate = vi.fn().mockResolvedValue(true);

    const result = await save(
      { serviceDb, validateProviderKey: validate, encryptProviderKey },
      tenant.workspaceId,
      { provider: "openai", key: PLAINTEXT_KEY },
      tenant.userId,
    );

    expect(result).toEqual({ ok: true });
    expect(validate).toHaveBeenCalledWith("openai", PLAINTEXT_KEY);
    // The result NEVER carries the key (plaintext or encrypted).
    expect(JSON.stringify(result)).not.toContain(PLAINTEXT_KEY);

    const configs = await serviceDb
      .select({
        encryptedKey: aiProviderConfigs.encryptedKey,
        keyValidatedAt: aiProviderConfigs.keyValidatedAt,
      })
      .from(aiProviderConfigs)
      .where(
        and(
          eq(aiProviderConfigs.workspaceId, tenant.workspaceId),
          eq(aiProviderConfigs.provider, "openai"),
        ),
      );
    expect(configs.length).toBe(1);
    expect(configs[0].encryptedKey.length).toBeGreaterThan(0);
    // The stored ciphertext is NOT the plaintext.
    expect(configs[0].encryptedKey).not.toContain(PLAINTEXT_KEY);
    expect(configs[0].keyValidatedAt).not.toBeNull();

    const audits = await serviceDb
      .select({ action: auditLog.action, metadata: auditLog.metadata })
      .from(auditLog)
      .where(eq(auditLog.workspaceId, tenant.workspaceId));
    const saveAudit = audits.find((a) => a.action === "save_provider_key");
    expect(saveAudit).toBeDefined();
    expect(saveAudit?.metadata).toEqual({ provider: "openai" });
    // Audit metadata carries NO key bytes.
    expect(JSON.stringify(saveAudit?.metadata)).not.toContain(PLAINTEXT_KEY);
  });

  it("invalid key: writes NO config row and NO audit row", async () => {
    const validate = vi.fn().mockResolvedValue(false);

    const result = await save(
      { serviceDb, validateProviderKey: validate, encryptProviderKey },
      tenant.workspaceId,
      { provider: "anthropic", key: PLAINTEXT_KEY },
      tenant.userId,
    );

    expect(result).toEqual({ ok: false, error: "Key inválida" });

    const configs = await serviceDb
      .select({ id: aiProviderConfigs.id })
      .from(aiProviderConfigs)
      .where(eq(aiProviderConfigs.workspaceId, tenant.workspaceId));
    expect(configs.length).toBe(0);

    const audits = await serviceDb
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(eq(auditLog.workspaceId, tenant.workspaceId));
    expect(audits.length).toBe(0);
  });

  it("duplicate provider: UPSERT replaces encrypted_key, does not duplicate", async () => {
    const validate = vi.fn().mockResolvedValue(true);
    const deps = {
      serviceDb,
      validateProviderKey: validate,
      encryptProviderKey,
    };

    await save(
      deps,
      tenant.workspaceId,
      { provider: "google", key: PLAINTEXT_KEY },
      tenant.userId,
    );

    const [first] = await serviceDb
      .select({ encryptedKey: aiProviderConfigs.encryptedKey })
      .from(aiProviderConfigs)
      .where(
        and(
          eq(aiProviderConfigs.workspaceId, tenant.workspaceId),
          eq(aiProviderConfigs.provider, "google"),
        ),
      );

    // Save again for the SAME (workspace, provider) with a different key.
    const SECOND_KEY = "sk-test-SECOND-KEY-9876543210-abcdef";
    await save(
      deps,
      tenant.workspaceId,
      { provider: "google", key: SECOND_KEY },
      tenant.userId,
    );

    const rows = await serviceDb
      .select({ encryptedKey: aiProviderConfigs.encryptedKey })
      .from(aiProviderConfigs)
      .where(
        and(
          eq(aiProviderConfigs.workspaceId, tenant.workspaceId),
          eq(aiProviderConfigs.provider, "google"),
        ),
      );

    expect(rows.length).toBe(1); // not duplicated
    // Ciphertext replaced (AES-GCM with a fresh DEK/IV yields different bytes).
    expect(rows[0].encryptedKey).not.toBe(first.encryptedKey);
  });

  it("plaintext key appears in NO captured log (HARD-STOP)", async () => {
    const captured: string[] = [];
    const methods = ["log", "info", "warn", "error", "debug"] as const;
    const spies = methods.map((m) =>
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        captured.push(args.map((a) => String(a)).join(" "));
      }),
    );

    try {
      await save(
        {
          serviceDb,
          validateProviderKey: vi.fn().mockResolvedValue(true),
          encryptProviderKey,
        },
        tenant.workspaceId,
        { provider: "deepseek", key: PLAINTEXT_KEY },
        tenant.userId,
      );
    } finally {
      spies.forEach((s) => s.mockRestore());
    }

    expect(captured.join("\n")).not.toContain(PLAINTEXT_KEY);
  });
});
