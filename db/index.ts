import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * User-session Drizzle client.
 *
 * Connects over the Postgres session port (5432, NOT the transaction pooler)
 * via DATABASE_URL. This client carries the user/anon role and is therefore
 * SUBJECT TO RLS — it is the path whose tenant isolation the F3 test suite
 * exercises. Privileged write paths (Inngest, Stripe webhooks, the F6
 * extractor, manifest curation) use a separate service_role connection that
 * bypasses RLS and is introduced in their owning phases.
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// `prepare: false` keeps the client compatible with transaction-pooled
// deployments; a single shared connection is reused across the module.
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });

export { schema };
