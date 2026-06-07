import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  provisionTenant,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";

/**
 * setFeatureModelWith (the pure feature-model seam) exercised against the REAL
 * local Supabase stack: user-session db mapping UPSERT + serviceDb audit insert,
 * validated against the real seeded ai_model_manifest. No provider network.
 *
 * Covers SPEC R-setFeatureModel:
 *   - valid change -> mapping row upserted + audit row with old AND new values
 *   - changing again -> upsert (single row) + audit old=previous, new=current
 *   - provider not configured -> clear error, NO mapping row, NO audit row
 *   - model not in manifest -> clear error, NO mapping row, NO audit row
 *
 * CAPABILITY NOTE (design §8 + decision #757): extract_document accepts a
 * non-PDF model because the F6 pdf-parse fallback is active, so there is no hard
 * write-time capability reject among F7's four features. The "no DB change on a
 * precondition failure" guarantee is therefore asserted via the realizable
 * rejects (unconfigured provider, unknown model).
 *
 * DATABASE_URL must be exported in the shell (vitest has no env loader).
 */
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const TEST_KEK = "ab".repeat(32);

// A real, seeded Google model (free-tier default per decision #757).
const GOOGLE_MODEL = "gemini-3.5-flash";
// A second active Google model for the "change again" assertion (PR2 trimmed the
// manifest to the 10 verified models; gemini-3.1-flash-lite is now deprecated).
const GOOGLE_MODEL_ALT = "gemini-3.1-pro-preview";

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

describe("setFeatureModelWith", () => {
  let tenant: Tenant;
  let db: typeof import("@/db")["db"];
  let serviceDb: typeof import("@/db/service")["serviceDb"];
  let setFeatureModel: typeof import("../set-feature-model")["setFeatureModelWith"];
  let encryptProviderKey: typeof import("@/lib/crypto/envelope")["encryptProviderKey"];
  let aiProviderConfigs: typeof import("@/db/schema")["aiProviderConfigs"];
  let aiFeatureModelMapping: typeof import("@/db/schema")["aiFeatureModelMapping"];
  let auditLog: typeof import("@/db/schema")["auditLog"];
  let eq: typeof import("drizzle-orm")["eq"];
  let and: typeof import("drizzle-orm")["and"];

  /** Seeds a configured provider key for the tenant (real envelope columns). */
  async function seedProviderKey(provider: "google"): Promise<void> {
    const envelope = encryptProviderKey("sk-test-seeded-key-0123456789abc");
    await serviceDb.insert(aiProviderConfigs).values({
      workspaceId: tenant.workspaceId,
      provider,
      encryptedKey: envelope.encryptedKey,
      keyIv: envelope.keyIv,
      keyTag: envelope.keyTag,
      encryptedDek: envelope.encryptedDek,
      keyValidatedAt: new Date(),
    });
  }

  beforeAll(async () => {
    ({ db } = await import("@/db"));
    ({ serviceDb } = await import("@/db/service"));
    ({ setFeatureModelWith: setFeatureModel } = await import(
      "../set-feature-model"
    ));
    ({ encryptProviderKey } = await import("@/lib/crypto/envelope"));
    ({ aiProviderConfigs, aiFeatureModelMapping, auditLog } = await import(
      "@/db/schema"
    ));
    ({ eq, and } = await import("drizzle-orm"));

    tenant = await provisionTenant("set-feature");
  });

  afterAll(async () => {
    await teardownTenants(tenant);
  });

  afterEach(async () => {
    await serviceDb
      .delete(aiFeatureModelMapping)
      .where(eq(aiFeatureModelMapping.workspaceId, tenant.workspaceId));
    await serviceDb
      .delete(aiProviderConfigs)
      .where(eq(aiProviderConfigs.workspaceId, tenant.workspaceId));
    await serviceDb
      .delete(auditLog)
      .where(eq(auditLog.workspaceId, tenant.workspaceId));
  });

  it("valid change: upserts mapping + audit row records old (null) AND new", async () => {
    await seedProviderKey("google");

    const result = await setFeatureModel(
      { db, serviceDb },
      tenant.workspaceId,
      { feature: "adapt_template", provider: "google", modelId: GOOGLE_MODEL },
      tenant.userId,
    );

    expect(result).toEqual({ ok: true });

    const mappings = await db
      .select({
        provider: aiFeatureModelMapping.provider,
        modelId: aiFeatureModelMapping.modelId,
      })
      .from(aiFeatureModelMapping)
      .where(
        and(
          eq(aiFeatureModelMapping.workspaceId, tenant.workspaceId),
          eq(aiFeatureModelMapping.feature, "adapt_template"),
        ),
      );
    expect(mappings.length).toBe(1);
    expect(mappings[0]).toEqual({ provider: "google", modelId: GOOGLE_MODEL });

    const [audit] = await serviceDb
      .select({ action: auditLog.action, metadata: auditLog.metadata })
      .from(auditLog)
      .where(eq(auditLog.workspaceId, tenant.workspaceId));
    expect(audit.action).toBe("change_feature_model");
    expect(audit.metadata).toEqual({
      feature: "adapt_template",
      old: null,
      new: { provider: "google", model_id: GOOGLE_MODEL },
    });
  });

  it("second change: single mapping row, audit records old=previous new=current", async () => {
    await seedProviderKey("google");
    const deps = { db, serviceDb };

    await setFeatureModel(
      deps,
      tenant.workspaceId,
      { feature: "summarize", provider: "google", modelId: GOOGLE_MODEL },
      tenant.userId,
    );
    await setFeatureModel(
      deps,
      tenant.workspaceId,
      { feature: "summarize", provider: "google", modelId: GOOGLE_MODEL_ALT },
      tenant.userId,
    );

    const mappings = await db
      .select({ modelId: aiFeatureModelMapping.modelId })
      .from(aiFeatureModelMapping)
      .where(
        and(
          eq(aiFeatureModelMapping.workspaceId, tenant.workspaceId),
          eq(aiFeatureModelMapping.feature, "summarize"),
        ),
      );
    expect(mappings.length).toBe(1);
    expect(mappings[0].modelId).toBe(GOOGLE_MODEL_ALT);

    const audits = await serviceDb
      .select({ metadata: auditLog.metadata })
      .from(auditLog)
      .where(eq(auditLog.workspaceId, tenant.workspaceId))
      .orderBy(auditLog.id);
    expect(audits.length).toBe(2);
    expect(audits[1].metadata).toEqual({
      feature: "summarize",
      old: { provider: "google", model_id: GOOGLE_MODEL },
      new: { provider: "google", model_id: GOOGLE_MODEL_ALT },
    });
  });

  it("provider not configured: clear error, NO mapping, NO audit", async () => {
    // No provider key seeded for the tenant.
    const result = await setFeatureModel(
      { db, serviceDb },
      tenant.workspaceId,
      { feature: "suggest", provider: "google", modelId: GOOGLE_MODEL },
      tenant.userId,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("No hay key de google");

    const mappings = await db
      .select({ id: aiFeatureModelMapping.id })
      .from(aiFeatureModelMapping)
      .where(eq(aiFeatureModelMapping.workspaceId, tenant.workspaceId));
    expect(mappings.length).toBe(0);

    const audits = await serviceDb
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(eq(auditLog.workspaceId, tenant.workspaceId));
    expect(audits.length).toBe(0);
  });

  it("model not in manifest: clear error, NO mapping, NO audit (no DB change)", async () => {
    await seedProviderKey("google");

    const result = await setFeatureModel(
      { db, serviceDb },
      tenant.workspaceId,
      {
        feature: "extract_document",
        provider: "google",
        modelId: "gemini-does-not-exist",
      },
      tenant.userId,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("no está disponible");

    const mappings = await db
      .select({ id: aiFeatureModelMapping.id })
      .from(aiFeatureModelMapping)
      .where(eq(aiFeatureModelMapping.workspaceId, tenant.workspaceId));
    expect(mappings.length).toBe(0);

    const audits = await serviceDb
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(eq(auditLog.workspaceId, tenant.workspaceId));
    expect(audits.length).toBe(0);
  });
});
