import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * User-session Drizzle client.
 *
 * Connects over the Postgres session port (5432, NOT the transaction pooler)
 * via DATABASE_URL. IMPORTANT: the connection role is whatever DATABASE_URL
 * authenticates as (today the `postgres` owner/superuser), and this client does
 * NOT inject a per-request JWT or `SET ROLE`. An owner/superuser BYPASSES RLS
 * unless the table uses FORCE ROW LEVEL SECURITY (ours do not) — so this path
 * does NOT enforce RLS at the SQL layer. Tenant isolation on THIS path is
 * carried by explicit `eq(workspace_id)` filters + a server-resolved
 * workspaceId in every query, NOT by RLS. RLS policies (and the F3 isolation
 * suite) guard only the supabase-js / PostgREST path (JWT -> authenticated
 * role). Privileged write paths (Inngest, Stripe webhooks, the F6 extractor,
 * manifest curation) use the separate service_role connection in db/service.ts.
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
