import { execSync } from "node:child_process";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { aiModelManifest } from "@/db/schema";

/**
 * Seed idempotency (SPEC R-Model-manifest-seed): running the seed twice MUST
 * update rows in place with NO duplicates and a stable active-model count.
 *
 * Exercised against the REAL local Supabase stack by invoking the actual seed
 * CLI (`pnpm db:seed`) — the same entry point operators run — so the test
 * covers the onConflictDoUpdate + stale-row deprecation path end to end.
 *
 * DATABASE_URL must be exported in the shell (vitest has no env loader).
 */
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const EXPECTED_ACTIVE = 10;

function runSeed(): void {
  execSync("pnpm db:seed", {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: "ignore",
  });
}

async function activeCount(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(aiModelManifest)
    .where(
      sql`${aiModelManifest.status} = 'active' and ${aiModelManifest.deprecatedAt} is null`,
    );
  return Number(row?.n ?? 0);
}

describe("ai_model_manifest seed", () => {
  it("is idempotent: two runs yield the same active rows with no duplicates", async () => {
    runSeed();
    const first = await activeCount();
    expect(first).toBe(EXPECTED_ACTIVE);

    runSeed();
    const second = await activeCount();
    expect(second).toBe(EXPECTED_ACTIVE);

    // No duplicate (provider, model_id) among active rows.
    const dupes = await db
      .select({
        provider: aiModelManifest.provider,
        modelId: aiModelManifest.modelId,
        n: sql<number>`count(*)::int`,
      })
      .from(aiModelManifest)
      .where(
        sql`${aiModelManifest.status} = 'active' and ${aiModelManifest.deprecatedAt} is null`,
      )
      .groupBy(aiModelManifest.provider, aiModelManifest.modelId)
      .having(sql`count(*) > 1`);
    expect(dupes).toEqual([]);
  });

  it("seeds gemini-3.5-flash as the default for all four features", async () => {
    runSeed();
    const [flash] = await db
      .select({ defaults: aiModelManifest.defaultForFeatures })
      .from(aiModelManifest)
      .where(
        sql`${aiModelManifest.provider} = 'google' and ${aiModelManifest.modelId} = 'gemini-3.5-flash'`,
      );

    expect(flash?.defaults?.sort()).toEqual(
      ["adapt_template", "extract_document", "suggest", "summarize"].sort(),
    );
  });

  it("seeds the verified per-1K costs for every active model (budget gate + ledger depend on these)", async () => {
    runSeed();
    const rows = await db
      .select({
        modelId: aiModelManifest.modelId,
        input: aiModelManifest.costPer1kInput,
        output: aiModelManifest.costPer1kOutput,
      })
      .from(aiModelManifest)
      .where(
        sql`${aiModelManifest.status} = 'active' and ${aiModelManifest.deprecatedAt} is null`,
      );

    const costs = Object.fromEntries(
      rows.map((r) => [r.modelId, [r.input, r.output]]),
    );

    // Verified 2026-06-07 against official provider pricing (engram:
    // sdd/tendr-f7-ai-platform/manifest-research). Any drift here corrupts
    // assertWithinBudget and ai_usage_ledger cost computation.
    expect(costs).toEqual({
      "gpt-5.5": ["0.005000", "0.030000"],
      "gpt-5.4-mini": ["0.000750", "0.004500"],
      "claude-opus-4-8": ["0.005000", "0.025000"],
      "claude-sonnet-4-6": ["0.003000", "0.015000"],
      "claude-haiku-4-5": ["0.001000", "0.005000"],
      "gemini-3.1-pro-preview": ["0.002000", "0.012000"],
      "gemini-3.5-flash": ["0.001500", "0.009000"],
      "deepseek-v4-pro": ["0.000435", "0.000870"],
      "deepseek-v4-flash": ["0.000140", "0.000280"],
      "kimi-k2.6": ["0.000950", "0.004000"],
    });
  });
});
