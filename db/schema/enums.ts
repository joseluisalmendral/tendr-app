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
  // F7c PR-F7C-4a: 5th feature — generate an email-client-safe HTML email from a
  // stored adaptation. The value is added to the live enum by a STANDALONE
  // migration (0006) so Postgres can commit `ALTER TYPE ... ADD VALUE` outside
  // the transaction that first uses it (plan-beautify #778).
  "beautify_email",
]);

export const manifestStatus = pgEnum("manifest_status", [
  "pending",
  "active",
  "deprecated",
]);
