/**
 * Schema barrel — re-exports every table, enum and inferred type.
 *
 * The schema is purely STRUCTURAL: tables, enums, indexes, FKs. All RLS
 * policies, column REVOKEs and the Realtime publication live in the
 * hand-authored 0001 migration, not here.
 *
 * `auth.ts` is intentionally NOT re-exported: it is a reference-only stub for
 * Supabase's managed auth.users table and must never be emitted as DDL.
 */
export * from "./enums";
export * from "./workspaces";
export * from "./crm";
export * from "./documents";
export * from "./templates";
export * from "./jobs";
export * from "./billing";
export * from "./audit";
export * from "./ai";
