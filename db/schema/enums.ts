import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Closed-set enumerations (M5).
 *
 * Every column that represents a finite set of states references one of these
 * pgEnums so Postgres rejects out-of-set values at write time instead of
 * relying on application-layer validation or CHECK constraints.
 */

export const clientStatus = pgEnum("client_status", ["active", "archived"]);

export const caseStatus = pgEnum("case_status", [
  "prospect",
  "proposal",
  "active",
  "closed_won",
  "closed_lost",
]);

export const jobStatus = pgEnum("job_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const plan = pgEnum("plan", ["free", "pro", "team"]);

export const aiProvider = pgEnum("ai_provider", [
  "openai",
  "anthropic",
  "google",
  "deepseek",
  "moonshot",
]);

export const aiFeature = pgEnum("ai_feature", [
  "adapt_template",
  "summarize",
  "suggest",
  "extract_document",
]);

export const manifestStatus = pgEnum("manifest_status", [
  "pending",
  "active",
  "deprecated",
]);
