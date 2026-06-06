import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit configuration for the Tendr schema.
 *
 * The TypeScript schema under `db/schema` is purely structural (tables, enums,
 * indexes, FKs). All RLS policies, column-level REVOKEs and the Realtime
 * publication live in a hand-authored migration (`0001_rls_policies.sql`) that
 * is scaffolded with `drizzle-kit generate --custom` and registered in the
 * journal — Drizzle 0.31 cannot faithfully model that security surface in TS.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema",
  out: "./db/migrations",
  dbCredentials: {
    // DATABASE_URL points at the Postgres session port (5432). Never commit the
    // value; it is read from the environment at generate/migrate time only.
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
