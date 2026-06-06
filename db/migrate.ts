import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Applies all migrations under `db/migrations` in journal order.
 *
 * Migrations create tables, enable RLS and create policies, so they must run
 * with a privileged (RLS-bypassing) connection. DATABASE_URL for migration
 * runs is expected to be the local/admin connection string; never commit it.
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  // `max: 1` ensures statements run sequentially on a single connection.
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  await migrate(db, { migrationsFolder: "./db/migrations" });
  await client.end();
}

main()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log("Migrations applied.");
    process.exit(0);
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Migration failed:", error);
    process.exit(1);
  });
