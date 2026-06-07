import { argv } from "node:process";
import { fileURLToPath } from "node:url";

import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { aiFeatureModelMapping, workspaces } from "../schema";

/**
 * Seeds the per-workspace `extract_document` feature mapping for F6.
 *
 * The extractor routes through ai_feature_model_mapping -> ai_model_manifest
 * (composite (provider, model_id) FK). F6 ships document extraction on Google
 * Gemini 3.5 Flash, which the manifest marks supports_pdf=true (db/seeds/
 * ai_model_manifest.ts), so the native-PDF path is exercised end to end.
 *
 * The (provider, model_id) pair MUST match a manifest row exactly or the
 * composite FK (ai_feature_model_mapping_manifest_fk) rejects the insert. The
 * unique (workspace_id, feature) constraint makes this idempotent per
 * workspace via onConflictDoUpdate.
 *
 * Runs with a PRIVILEGED connection (DATABASE_URL): seeding bypasses RLS.
 * Exposed as a reusable function so tests and a new-workspace bootstrap can
 * seed a single tenant without the full-table runner below.
 */
export const EXTRACT_DOCUMENT_PROVIDER = "google" as const;
export const EXTRACT_DOCUMENT_MODEL_ID = "gemini-3.5-flash" as const;

/**
 * Upserts the `extract_document` mapping for one workspace. Idempotent on the
 * (workspace_id, feature) unique constraint.
 */
export async function seedExtractDocumentMapping(
  db: PostgresJsDatabase<Record<string, unknown>>,
  workspaceId: string,
): Promise<void> {
  await db
    .insert(aiFeatureModelMapping)
    .values({
      workspaceId,
      feature: "extract_document",
      provider: EXTRACT_DOCUMENT_PROVIDER,
      modelId: EXTRACT_DOCUMENT_MODEL_ID,
    })
    .onConflictDoUpdate({
      target: [
        aiFeatureModelMapping.workspaceId,
        aiFeatureModelMapping.feature,
      ],
      set: {
        provider: sql`excluded.provider`,
        modelId: sql`excluded.model_id`,
        updatedAt: sql`now()`,
      },
    });
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema: { workspaces, aiFeatureModelMapping } });

  // Seed the extract_document mapping for every existing workspace.
  const rows = await db.select({ id: workspaces.id }).from(workspaces);
  for (const row of rows) {
    await seedExtractDocumentMapping(db, row.id);
  }

  await client.end();
  return rows.length;
}

// Only run the full-table seed when executed directly (`tsx db/seeds/...`),
// NOT when the file is imported for its `seedExtractDocumentMapping` helper.
const isDirectRun = argv[1] === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main()
    .then((count) => {
      console.log(`Seeded extract_document mapping for ${count} workspace(s).`);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Feature mapping seed failed:", error);
      process.exit(1);
    });
}
