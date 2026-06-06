"use client";

import { useEffect, useRef } from "react";

import type {
  RealtimePostgresChangesPayload,
  RealtimeChannel,
} from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

/**
 * Reusable workspace-scoped Realtime subscription hook (design §6).
 *
 * Subscribes the browser Supabase client (which carries the user session
 * cookie via @supabase/ssr, so postgres_changes are RLS-authorized) to a single
 * channel `workspace:${workspaceId}` and forwards `postgres_changes` events on
 * one table to `onChange`.
 *
 * MANDATORY tenant filter: the binding ALWAYS sets
 * `filter: workspace_id=eq.${workspaceId}`. Omitting it would deliver other
 * tenants' row changes to this client (cross-tenant leak) — a hard stop. The
 * filter is belt-and-suspenders alongside Realtime RLS authorization.
 *
 * Lifecycle: subscribes on mount (and re-subscribes if workspaceId changes),
 * removes the channel on unmount. supabase-js handles socket reconnect
 * automatically; on (re)`SUBSCRIBED` we fire `onSubscribed` once so the caller
 * can run a catch-up resync (e.g. `router.refresh()`) for any events missed
 * while disconnected.
 *
 * Designed reusable: any future surface (e.g. a clients board) can subscribe to
 * its own table by passing a different `table`/`events`.
 */

export type WorkspaceRealtimeEvent = "INSERT" | "UPDATE" | "DELETE";

export type UseWorkspaceRealtimeOptions<Row extends Record<string, unknown>> = {
  /** The caller's workspace id; the channel and the row filter are keyed to it. */
  workspaceId: string;
  /** Table to watch in the `public` schema (e.g. "cases"). */
  table: string;
  /** Postgres change events to receive. Omit for all three. */
  events?: WorkspaceRealtimeEvent[];
  /** Invoked for each delivered change with the raw postgres_changes payload. */
  onChange: (payload: RealtimePostgresChangesPayload<Row>) => void;
  /** Optional: fired once each time the channel reaches SUBSCRIBED (catch-up). */
  onSubscribed?: () => void;
};

/**
 * The exact filter string the binding uses. Exported so tests can assert the
 * MANDATORY tenant filter is wired correctly without reaching into the channel.
 */
export function workspaceRealtimeFilter(workspaceId: string): string {
  return `workspace_id=eq.${workspaceId}`;
}

export function useWorkspaceRealtime<Row extends Record<string, unknown>>({
  workspaceId,
  table,
  events,
  onChange,
  onSubscribed,
}: UseWorkspaceRealtimeOptions<Row>): void {
  // Keep callbacks in refs so changing handler identities does NOT tear down
  // and rebuild the subscription (which would drop events / thrash the socket).
  // Refs are synced in an effect (not during render) so the latest handler is
  // always called without making the subscription effect depend on identity.
  const onChangeRef = useRef(onChange);
  const onSubscribedRef = useRef(onSubscribed);
  useEffect(() => {
    onChangeRef.current = onChange;
    onSubscribedRef.current = onSubscribed;
  });

  // Serialize events so the effect dep is a primitive (stable across renders).
  const eventsKey = events ? [...events].sort().join(",") : "*";

  useEffect(() => {
    if (!workspaceId) return;

    const supabase = createClient();
    const channel: RealtimeChannel = supabase.channel(
      `workspace:${workspaceId}`,
    );

    const filter = workspaceRealtimeFilter(workspaceId);
    const eventList: (WorkspaceRealtimeEvent | "*")[] =
      eventsKey === "*"
        ? ["*"]
        : (eventsKey.split(",") as WorkspaceRealtimeEvent[]);

    for (const event of eventList) {
      channel.on(
        // @supabase/realtime-js types `postgres_changes` via overloads that the
        // generic string `event` widens past; the binding shape is correct.
        "postgres_changes" as never,
        { event, schema: "public", table, filter } as never,
        (payload: RealtimePostgresChangesPayload<Row>) => {
          onChangeRef.current(payload);
        },
      );
    }

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        onSubscribedRef.current?.();
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, table, eventsKey]);
}
