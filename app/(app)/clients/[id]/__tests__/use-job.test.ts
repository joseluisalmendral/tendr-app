import { describe, expect, it } from "vitest";

import {
  isTerminalStatus,
  reconcileJobState,
  toJobState,
  type JobRealtimeRow,
  type JobState,
} from "../use-job";

/**
 * Pure reconcile/normalize logic of `useJob` (the React/socket wiring is thin).
 * Tested at the logic level — same convention as the rest of the suite.
 *
 * The reconcile is the gate (c) safety net: the worker may finish BEFORE the
 * subscription lands, so a catch-up read and a late live UPDATE can arrive in
 * either order. Reconcile MUST be idempotent and MUST never regress a terminal
 * state back to a running one — otherwise a failed job could flap to a spinner.
 */

function row(overrides: Partial<JobRealtimeRow>): JobRealtimeRow {
  return {
    id: "job-1",
    workspace_id: "ws-1",
    status: "pending",
    progress: [],
    result: null,
    error: null,
    ...overrides,
  };
}

describe("toJobState — normalize a raw jobs row", () => {
  it("exposes the structured error only on a failed row", () => {
    const state = toJobState(
      row({ status: "failed", result: { error_code: "document_error", message: "boom" } }),
    );
    expect(state.status).toBe("failed");
    expect(state.error?.error_code).toBe("document_error");
    expect(state.result).toBeNull();
  });

  it("falls back to a default error_code when a failed row has no structured result", () => {
    const state = toJobState(row({ status: "failed", result: null, error: null }));
    // A failed job must ALWAYS surface an error object (never null) so the UI
    // can render a terminal view instead of waiting.
    expect(state.error).not.toBeNull();
  });

  it("exposes result only on a completed row", () => {
    const payload = { resumen: "ok" };
    const state = toJobState(row({ status: "completed", result: payload }));
    expect(state.result).toEqual(payload);
    expect(state.error).toBeNull();
  });

  it("coerces a null progress to an empty array", () => {
    expect(toJobState(row({ progress: null })).progress).toEqual([]);
  });
});

describe("reconcileJobState — idempotent, monotonic", () => {
  const running: JobState = {
    status: "running",
    progress: [{ step: "mark-running", at: "t" }],
    result: null,
    error: null,
  };
  const failed: JobState = {
    status: "failed",
    progress: running.progress,
    result: null,
    error: { error_code: "provider_error" },
  };

  it("advances pending -> running -> failed", () => {
    expect(reconcileJobState(null, running)).toBe(running);
    expect(reconcileJobState(running, failed)).toBe(failed);
  });

  it("never regresses a terminal state back to running (catch-up vs late echo)", () => {
    // Already failed; a stale 'running' UPDATE must be ignored.
    const result = reconcileJobState(failed, running);
    expect(result.status).toBe("failed");
  });

  it("is idempotent: applying the same terminal state twice is stable", () => {
    const once = reconcileJobState(failed, failed);
    const twice = reconcileJobState(once, failed);
    expect(twice.status).toBe("failed");
    expect(twice.error?.error_code).toBe("provider_error");
  });
});

describe("isTerminalStatus", () => {
  it("treats completed and failed as terminal", () => {
    expect(isTerminalStatus("completed")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
    expect(isTerminalStatus("pending")).toBe(false);
    expect(isTerminalStatus("running")).toBe(false);
  });
});
