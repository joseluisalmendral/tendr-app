import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * Service-role Drizzle client — BYPASSES RLS BY DESIGN (0001 invariant e).
 *
 * This is the privileged write path for the F6 Inngest extractor and its
 * onFailure handler: advancing `jobs.status`/`result`, persisting
 * `documents.extracted_metadata` and `ai_usage_ledger`. The user-session
 * `db` (db/index.ts) is RLS-bound and CANNOT advance jobs (jobs RLS is
 * SELECT+INSERT only), so a separate privileged connection is required.
 *
 * `import "server-only"` makes any client-bundle import throw at build time,
 * so this connection (and the service_role credentials it carries) can never
 * reach the browser. Plaintext provider API keys NEVER pass through here.
 *
 * Connection string: locally this is the privileged DATABASE_URL (the same
 * admin string db/migrate.ts and the seeds use). For production a distinct
 * service_role Postgres connection string is expected; see Open Question in
 * the F6 design — confirm the prod env var name before deploy.
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// `prepare: false` keeps the client compatible with transaction-pooled
// deployments; a single shared connection is reused across the module.
const client = postgres(connectionString, { prepare: false });

export const serviceDb = drizzle(client, { schema });

export { schema };
