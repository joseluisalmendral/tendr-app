import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  provisionTenant,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";

/**
 * clearFeatureModelWith (the "Default" feature-model seam) exercised against the
 * REAL local Supabase stack: user-session db mapping DELETE + serviceDb audit
 * insert, then a real getModelForFeature read to prove the fallback to the
 * manifest default. No provider network.
 *
 * Covers F7c PR-F7C-2 design 4a:
 *   - existing override -> mapping row removed + audit (old=previous, new=null)
 *     + getModelForFeature then returns the manifest DEFAULT (gemini-3.5-flash)
 *   - no override -> no-op { ok: true }, NO audit row
 *   - cross-workspace -> another workspace's override is NOT cleared
 *
 * DATABASE_URL must be exported in the shell (vitest has no env loader).
 */
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const TEST_KEK = "ab".repeat(32);
// The seeded manifest default for all four features (db/seeds/ai_model_manifest).
const DEFAULT_MODEL = "gemini-3.5-flash";
const OVERRIDE_MODEL = "gemini-3.1-pro-preview";

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

describe("clearFeatureModelWith", () => {
  let tenant: Tenant;
  let otherTenant: Tenant;
  let db: typeof import("@/db")["db"];
  let serviceDb: typeof import("@/db/service")["serviceDb"];
  let clear: typeof import("../clear-feature-model")["clearFeatureModelWith"];
  let getModelForFeature: typeof import("@/lib/ai/get-model-for-feature")["getModelForFeature"];
  let aiFeatureModelMapping: typeof import("@/db/schema")["aiFeatureModelMapping"];
  let auditLog: typeof import("@/db/schema")["auditLog"];
  let eq: typeof import("drizzle-orm")["eq"];
  let and: typeof import("drizzle-orm")["and"];

  /** Seeds an explicit feature-model override row for a workspace. */
  async function seedOverride(
    workspaceId: string,
    feature: "adapt_template",
  ): Promise<void> {
    await serviceDb.insert(aiFeatureModelMapping).values({
      workspaceId,
      feature,
      provider: "google",
      modelId: OVERRIDE_MODEL,
    });
  }

  beforeAll(async () => {
    ({ db } = await import("@/db"));
    ({ serviceDb } = await import("@/db/service"));
    ({ clearFeatureModelWith: clear } = await import("../clear-feature-model"));
    ({ getModelForFeature } = await import("@/lib/ai/get-model-for-feature"));
    ({ aiFeatureModelMapping, auditLog } = await import("@/db/schema"));
    ({ eq, and } = await import("drizzle-orm"));

    tenant = await provisionTenant("clear-feature");
    otherTenant = await provisionTenant("clear-feature-other");
  });

  afterAll(async () => {
    await teardownTenants(tenant, otherTenant);
  });

  afterEach(async () => {
    for (const ws of [tenant.workspaceId, otherTenant.workspaceId]) {
      await serviceDb
        .delete(aiFeatureModelMapping)
        .where(eq(aiFeatureModelMapping.workspaceId, ws));
      await serviceDb.delete(auditLog).where(eq(auditLog.workspaceId, ws));
    }
  });

  it("existing override: removes mapping + audit(new=null) + falls back to default", async () => {
    await seedOverride(tenant.workspaceId, "adapt_template");

    const result = await clear(
      { db, serviceDb },
      tenant.workspaceId,
      { feature: "adapt_template" },
      tenant.userId,
    );
    expect(result).toEqual({ ok: true });

    // Mapping row gone.
    const mappings = await db
      .select({ id: aiFeatureModelMapping.id })
      .from(aiFeatureModelMapping)
      .where(
        and(
          eq(aiFeatureModelMapping.workspaceId, tenant.workspaceId),
          eq(aiFeatureModelMapping.feature, "adapt_template"),
        ),
      );
    expect(mappings.length).toBe(0);

    // Audit records old=previous override, new=null.
    const [audit] = await serviceDb
      .select({ action: auditLog.action, metadata: auditLog.metadata })
      .from(auditLog)
      .where(eq(auditLog.workspaceId, tenant.workspaceId));
    expect(audit.action).toBe("change_feature_model");
    expect(audit.metadata).toEqual({
      feature: "adapt_template",
      old: { provider: "google", model_id: OVERRIDE_MODEL },
      new: null,
    });

    // getModelForFeature now resolves the manifest DEFAULT.
    const resolved = await getModelForFeature(
      db,
      tenant.workspaceId,
      "adapt_template",
    );
    expect(resolved).toEqual({ provider: "google", modelId: DEFAULT_MODEL });
  });

  it("no override: no-op {ok:true}, NO audit row", async () => {
    const result = await clear(
      { db, serviceDb },
      tenant.workspaceId,
      { feature: "summarize" },
      tenant.userId,
    );
    expect(result).toEqual({ ok: true });

    const audits = await serviceDb
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(eq(auditLog.workspaceId, tenant.workspaceId));
    expect(audits.length).toBe(0);
  });

  it("cross-workspace: another workspace's override is NOT cleared", async () => {
    await seedOverride(otherTenant.workspaceId, "adapt_template");

    // tenant clears its own (nonexistent) override; otherTenant's stays intact.
    await clear(
      { db, serviceDb },
      tenant.workspaceId,
      { feature: "adapt_template" },
      tenant.userId,
    );

    const otherMappings = await db
      .select({ modelId: aiFeatureModelMapping.modelId })
      .from(aiFeatureModelMapping)
      .where(
        and(
          eq(aiFeatureModelMapping.workspaceId, otherTenant.workspaceId),
          eq(aiFeatureModelMapping.feature, "adapt_template"),
        ),
      );
    expect(otherMappings.length).toBe(1);
    expect(otherMappings[0].modelId).toBe(OVERRIDE_MODEL);
  });
});
