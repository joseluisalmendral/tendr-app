import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";

import type * as schema from "@/db/schema";
import { aiModelManifest } from "@/db/schema";

/**
 * Reads the per-1k-token USD costs for a manifest model (F7 features).
 *
 * The manifest stores `cost_per_1k_input` / `cost_per_1k_output` as numeric
 * (returned by Drizzle as strings); this helper parses them to numbers so the
 * features can feed `computeCostCents` after a model call. Returns null when the
 * model is not in the manifest (the caller then bills 0 cents — a missing cost
 * row should never crash a completed AI call).
 *
 * The manifest is public-read (shared, not tenant data), so this query carries
 * no workspace predicate.
 */
export interface ManifestCost {
  costPer1kInput: number;
  costPer1kOutput: number;
}

export async function manifestCostFor(
  db: PostgresJsDatabase<typeof schema>,
  provider: string,
  modelId: string,
): Promise<ManifestCost | null> {
  const [row] = await db
    .select({
      costPer1kInput: aiModelManifest.costPer1kInput,
      costPer1kOutput: aiModelManifest.costPer1kOutput,
    })
    .from(aiModelManifest)
    .where(
      and(
        eq(aiModelManifest.provider, provider as never),
        eq(aiModelManifest.modelId, modelId),
      ),
    )
    .limit(1);

  if (!row) return null;
  return {
    costPer1kInput: Number(row.costPer1kInput),
    costPer1kOutput: Number(row.costPer1kOutput),
  };
}
