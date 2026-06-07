import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

/**
 * Applies db/policies/storage.sql to the target database.
 *
 * Storage RLS (the private `documents` bucket + the four workspace-scoped
 * `storage.objects` policies) lives outside the Drizzle migration journal, so
 * it is applied with this dedicated runner instead of db/migrate.ts. Mirrors
 * the migrate.ts pattern: a privileged (RLS-bypassing) connection read from
 * DATABASE_URL, `max: 1` for sequential execution, never commit the URL.
 *
 * The SQL file is idempotent (bucket upsert + drop-if-exists/create policies),
 * so `pnpm db:storage` can be re-run safely.
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const sqlPath = fileURLToPath(new URL("./storage.sql", import.meta.url));
  const ddl = await readFile(sqlPath, "utf8");

  // `max: 1` runs statements sequentially on a single connection. The simple
  // protocol lets the whole multi-statement file run in one round-trip.
  const client = postgres(connectionString, { max: 1 });
  try {
    await client.unsafe(ddl);
  } finally {
    await client.end();
  }
}

main()
  .then(() => {
    console.log("Storage bucket + policies applied.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Storage policy apply failed:", error);
    process.exit(1);
  });
