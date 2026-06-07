import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { aiFeatureModelMapping, aiProviderConfigs } from "@/db/schema";
import { serviceDb } from "@/db/service";
import {
  provisionTenant,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";
import {
  getModelForFeature,
  NoModelConfiguredError,
} from "@/lib/ai/get-model-for-feature";
import { encryptProviderKey } from "@/lib/crypto/envelope";

/**
 * getModelForFeature exercised against the REAL local Supabase stack and the
 * seeded ai_model_manifest. Covers SPEC R-getModelForFeature:
 *   - manual override (ai_feature_model_mapping row) WINS
 *   - no override -> falls back to the manifest default_for_features
 *     (ADR-007: gemini-3.5-flash for all four features)
 *   - neither mapping nor default -> throws the curated NoModelConfiguredError
 *
 * Tenancy is exercised via two isolated tenants; the override read carries an
 * explicit workspaceId so tenant A's mapping never leaks into tenant B.
 *
 * Requires the manifest seed to have run. DATABASE_URL must be exported.
 */
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const TEST_KEK = "ab".repeat(32);

let priorKek: string | undefined;
let tenant: Tenant;

/** Seeds a configured provider key (real envelope columns) via serviceDb. */
async function seedProviderKey(
  workspaceId: string,
  provider: "google" | "anthropic",
): Promise<void> {
  const env = encryptProviderKey("sk-test-seeded-key-0123456789abc");
  await serviceDb.insert(aiProviderConfigs).values({
    workspaceId,
    provider,
    encryptedKey: env.encryptedKey,
    keyIv: env.keyIv,
    keyTag: env.keyTag,
    encryptedDek: env.encryptedDek,
    keyValidatedAt: new Date(),
  });
}

beforeAll(async () => {
  priorKek = process.env.AI_KEY_KEK;
  process.env.AI_KEY_KEK = TEST_KEK;
  tenant = await provisionTenant("get-model-for-feature");
});

afterAll(async () => {
  await teardownTenants(tenant);
  if (priorKek === undefined) {
    delete process.env.AI_KEY_KEK;
  } else {
    process.env.AI_KEY_KEK = priorKek;
  }
});

afterEach(async () => {
  await serviceDb
    .delete(aiFeatureModelMapping)
    .where(eq(aiFeatureModelMapping.workspaceId, tenant.workspaceId));
  await serviceDb
    .delete(aiProviderConfigs)
    .where(eq(aiProviderConfigs.workspaceId, tenant.workspaceId));
});

describe("getModelForFeature", () => {
  it("manual override wins over the manifest default", async () => {
    await seedProviderKey(tenant.workspaceId, "anthropic");
    await db.insert(aiFeatureModelMapping).values({
      workspaceId: tenant.workspaceId,
      feature: "adapt_template",
      provider: "anthropic",
      modelId: "claude-opus-4-8",
    });

    const result = await getModelForFeature(
      db,
      tenant.workspaceId,
      "adapt_template",
    );

    expect(result).toEqual({
      provider: "anthropic",
      modelId: "claude-opus-4-8",
    });
  });

  it("falls back to the manifest default (gemini-3.5-flash) when no override", async () => {
    const result = await getModelForFeature(
      db,
      tenant.workspaceId,
      "summarize",
    );

    expect(result).toEqual({
      provider: "google",
      modelId: "gemini-3.5-flash",
    });
  });

  it("returns the default for every F7 feature (ADR-007: all four)", async () => {
    const features = [
      "adapt_template",
      "summarize",
      "suggest",
      "extract_document",
    ] as const;

    for (const feature of features) {
      const result = await getModelForFeature(db, tenant.workspaceId, feature);
      expect(result).toEqual({
        provider: "google",
        modelId: "gemini-3.5-flash",
      });
    }
  });

  it("override is workspace-scoped (no cross-tenant leak)", async () => {
    const other = await provisionTenant("get-model-other");
    try {
      // Tenant A overrides suggest; tenant B must still get the default.
      await seedProviderKey(tenant.workspaceId, "anthropic");
      await db.insert(aiFeatureModelMapping).values({
        workspaceId: tenant.workspaceId,
        feature: "suggest",
        provider: "anthropic",
        modelId: "claude-haiku-4-5",
      });

      const a = await getModelForFeature(db, tenant.workspaceId, "suggest");
      const b = await getModelForFeature(db, other.workspaceId, "suggest");

      expect(a.modelId).toBe("claude-haiku-4-5");
      expect(b.modelId).toBe("gemini-3.5-flash");
    } finally {
      await serviceDb
        .delete(aiFeatureModelMapping)
        .where(eq(aiFeatureModelMapping.workspaceId, other.workspaceId));
      await teardownTenants(other);
    }
  });
});

describe("getModelForFeature — no default configured", () => {
  /**
   * Verifies the throw path: a feature with no mapping AND no manifest default
   * must throw NoModelConfiguredError. All four real features now ship a seeded
   * default (gemini-3.5-flash), so we temporarily clear the 'suggest' default
   * via serviceDb, assert the throw, then RESTORE it in `finally` so the global
   * manifest state is preserved (tests run serially — fileParallelism: false).
   */
  it("throws NoModelConfiguredError when neither mapping nor default exists", async () => {
    const fresh = await provisionTenant("get-model-nodefault");
    const { aiModelManifest } = await import("@/db/schema");
    const { sql } = await import("drizzle-orm");

    // Snapshot the rows that currently default 'suggest'.
    const defaulted = await serviceDb
      .select({
        provider: aiModelManifest.provider,
        modelId: aiModelManifest.modelId,
        defaultForFeatures: aiModelManifest.defaultForFeatures,
      })
      .from(aiModelManifest)
      .where(sql`'suggest' = any(${aiModelManifest.defaultForFeatures})`);

    try {
      // Strip 'suggest' from every default row so the fallback finds nothing.
      for (const row of defaulted) {
        await serviceDb
          .update(aiModelManifest)
          .set({
            defaultForFeatures: row.defaultForFeatures.filter(
              (f) => f !== "suggest",
            ),
          })
          .where(
            and(
              eq(aiModelManifest.provider, row.provider),
              eq(aiModelManifest.modelId, row.modelId),
            ),
          );
      }

      await expect(
        getModelForFeature(db, fresh.workspaceId, "suggest"),
      ).rejects.toBeInstanceOf(NoModelConfiguredError);

      await expect(
        getModelForFeature(db, fresh.workspaceId, "suggest"),
      ).rejects.toThrow("No hay modelo configurado para la feature suggest");
    } finally {
      // Restore the original default_for_features arrays.
      for (const row of defaulted) {
        await serviceDb
          .update(aiModelManifest)
          .set({ defaultForFeatures: row.defaultForFeatures })
          .where(
            and(
              eq(aiModelManifest.provider, row.provider),
              eq(aiModelManifest.modelId, row.modelId),
            ),
          );
      }
      await teardownTenants(fresh);
    }
  });
});
