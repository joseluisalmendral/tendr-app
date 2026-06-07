/**
 * Shared job-status vocabulary, kept in a directive-free module on purpose.
 *
 * Server modules (delete-document.ts) and client modules (use-job.ts,
 * documents-tab.tsx) both need `isTerminalStatus`. A value exported from a
 * `"use client"` module becomes a client REFERENCE when imported by server
 * code — calling it there throws at runtime ("Attempted to call
 * isTerminalStatus() from the server"), even though the build stays green.
 * Pure shared logic therefore lives here, importable from both sides.
 */

export type JobStatus = "pending" | "running" | "completed" | "failed";

const TERMINAL: ReadonlySet<JobStatus> = new Set(["completed", "failed"]);

/** True once the job reached a terminal state (completed or failed). */
export function isTerminalStatus(status: JobStatus): boolean {
  return TERMINAL.has(status);
}
