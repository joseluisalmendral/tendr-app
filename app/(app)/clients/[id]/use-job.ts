"use client";

import { useCallback, useState } from "react";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import { useWorkspaceRealtime } from "@/lib/realtime/use-workspace-realtime";

/**
 * Realtime job hook (design §Data Flow, spec slice C).
 *
 * Wraps the reusable `useWorkspaceRealtime` (which already sets the realtime
 * auth BEFORE subscribing and applies the MANDATORY workspace_id filter) on the
 * `jobs` table and exposes the live `{ status, progress, result, error }` for a
 * single job.
 *
 * GATE (c) GUARANTEE — a terminal state can NEVER be missed: the worker may
 * finish (and the row may already be `failed`/`completed`) BEFORE the browser
 * subscription lands. The Realtime UPDATE for that transition would then never
 * be delivered. To close the race, `onSubscribed` runs a catch-up READ of the
 * job row, exactly like the kanban board resyncs on (re)connect. The reconcile
 * step is idempotent (same monotonic-status compare pattern as
 * kanban-board.tsx) so the catch-up read and a live UPDATE never fight: a
 * failed job ALWAYS reaches a terminal view, never an indefinite spinner.
 */

export type JobStatus = "pending" | "running" | "completed" | "failed";

/** One per-step progress entry the worker appends to `jobs.progress`. */
export type JobProgressEntry = { step: string; at: string };

/** Structured failure payload the worker writes to `jobs.result` on failure. */
export type JobErrorResult = { error_code?: string; message?: string };

/** The realtime row shape we read off `jobs` (snake_case columns). */
export type JobRealtimeRow = {
  id: string;
  workspace_id: string;
  status: JobStatus;
  progress: JobProgressEntry[] | null;
  result: unknown;
  error: string | null;
};

export type JobState = {
  status: JobStatus;
  progress: JobProgressEntry[];
  /** The completed extraction payload (only meaningful when status==='completed'). */
  result: unknown;
  /** The structured error (only meaningful when status==='failed'). */
  error: JobErrorResult | null;
};

const TERMINAL: ReadonlySet<JobStatus> = new Set(["completed", "failed"]);

/** True once the job reached a terminal state (completed or failed). */
export function isTerminalStatus(status: JobStatus): boolean {
  return TERMINAL.has(status);
}

/** Status ordering so a stale event can never roll a terminal state back. */
const STATUS_RANK: Record<JobStatus, number> = {
  pending: 0,
  running: 1,
  completed: 2,
  failed: 2,
};

/**
 * Normalizes a raw `jobs` row (from the catch-up read or a realtime payload)
 * into the client `JobState`. Pure so it is unit-testable without a socket.
 */
export function toJobState(row: JobRealtimeRow): JobState {
  const status = row.status;
  return {
    status,
    progress: Array.isArray(row.progress) ? row.progress : [],
    result: status === "completed" ? row.result : null,
    error:
      status === "failed"
        ? ((row.result as JobErrorResult | null) ??
          (row.error ? { message: row.error } : { error_code: "provider_error" }))
        : null,
  };
}

/**
 * Idempotent reconcile (kanban-board.tsx:195 pattern): accept the incoming
 * state only when it advances the job (or refreshes a same-rank terminal). A
 * stale/echoed event for an already-terminal job is dropped, so the catch-up
 * read and a late live UPDATE converge instead of flapping.
 */
export function reconcileJobState(
  prev: JobState | null,
  next: JobState,
): JobState {
  if (!prev) return next;
  // Never regress past a terminal state.
  if (isTerminalStatus(prev.status) && !isTerminalStatus(next.status)) {
    return prev;
  }
  // Advance on a higher rank, or refresh progress within the same rank.
  if (STATUS_RANK[next.status] >= STATUS_RANK[prev.status]) {
    return next;
  }
  return prev;
}

export function useJob(
  jobId: string | null,
  workspaceId: string,
): JobState | null {
  const [state, setState] = useState<JobState | null>(null);

  // Reset to a clean slate when the tracked job changes — React's recommended
  // "adjusting state during render" pattern: the previous jobId lives in STATE
  // and is compared during render, so a new upload never inherits the prior
  // job's state and we avoid a cascading setState-in-effect. setState during
  // render re-renders this component immediately (cheap, before children).
  const [trackedJobId, setTrackedJobId] = useState<string | null>(jobId);
  if (trackedJobId !== jobId) {
    setTrackedJobId(jobId);
    setState(null);
  }

  const applyRow = useCallback((row: JobRealtimeRow) => {
    setState((prev) => reconcileJobState(prev, toJobState(row)));
  }, []);

  const onChange = useCallback(
    (payload: RealtimePostgresChangesPayload<JobRealtimeRow>) => {
      if (!jobId) return;
      // INSERT and UPDATE carry the new row; ignore DELETE.
      const row =
        "new" in payload && payload.new && "id" in payload.new
          ? (payload.new as JobRealtimeRow)
          : null;
      if (!row || row.id !== jobId) return;
      applyRow(row);
    },
    [jobId, applyRow],
  );

  // Catch-up read on (re)connect — closes the worker-finishes-before-subscribe
  // race so a terminal state is never missed.
  const onSubscribed = useCallback(() => {
    if (!jobId) return;
    const supabase = createClient();
    void supabase
      .from("jobs")
      .select("id, workspace_id, status, progress, result, error")
      .eq("id", jobId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) applyRow(data as JobRealtimeRow);
      });
  }, [jobId, applyRow]);

  useWorkspaceRealtime<JobRealtimeRow>({
    workspaceId,
    table: "jobs",
    events: ["INSERT", "UPDATE"],
    onChange,
    onSubscribed,
  });

  return jobId ? state : null;
}
