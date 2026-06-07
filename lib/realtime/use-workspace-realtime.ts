"use client";

import { useEffect, useId, useRef } from "react";

import type {
  RealtimePostgresChangesPayload,
  RealtimeChannel,
} from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

/**
 * Reusable workspace-scoped Realtime subscription hook (design §6).
 *
 * Subscribes the browser Supabase client (which carries the user session
 * cookie via @supabase/ssr, so postgres_changes are RLS-authorized) to a
 * channel unique to THIS hook instance and forwards `postgres_changes` events
 * on one table to `onChange`.
 *
 * INSTANCE-UNIQUE CHANNEL NAME: supabase-js caches one `RealtimeChannel` object
 * per topic string, returning the SAME object for the same name. If two hook
 * instances mounted concurrently shared a name (e.g. a fixed
 * `workspace:${workspaceId}`), the second instance would call `.on()` on the
 * channel the first already `subscribe()`d, which throws "cannot add
 * postgres_changes callbacks ... after subscribe()". F6's DocumentsTab mounts N
 * `useJob` instances at once (one per document card), so the name MUST be unique
 * per instance. We append a stable `useId()` value (see
 * `workspaceRealtimeChannelName`). Channel names are purely client-side
 * identifiers — N channels for the same workspace is fine; each still carries
 * the MANDATORY `workspace_id` filter and RLS authorization.
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

/**
 * Builds the per-hook-instance channel name. Pure so tests can assert that two
 * concurrent instances NEVER collide on the same name (which would make the
 * second instance call `.on()` on an already-subscribed channel and crash).
 *
 * `instanceId` is the caller's `useId()` value: stable across that instance's
 * renders, unique across instances. We still scope the name by workspace and
 * table so it reads meaningfully in logs / the Realtime inspector.
 */
export function workspaceRealtimeChannelName(
  workspaceId: string,
  table: string,
  instanceId: string,
): string {
  return `workspace:${workspaceId}:${table}:${instanceId}`;
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

  // Stable per-instance id → unique channel name (see
  // `workspaceRealtimeChannelName`). Prevents the supabase-js shared-channel
  // crash when multiple instances mount for the same workspace/table.
  const instanceId = useId();

  // Serialize events so the effect dep is a primitive (stable across renders).
  const eventsKey = events ? [...events].sort().join(",") : "*";

  useEffect(() => {
    if (!workspaceId) return;

    const supabase = createClient();
    const channel: RealtimeChannel = supabase.channel(
      workspaceRealtimeChannelName(workspaceId, table, instanceId),
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

    // CRITICAL: authenticate the realtime socket with the user's JWT BEFORE
    // subscribing. supabase-js only auto-calls realtime.setAuth() on
    // SIGNED_IN / TOKEN_REFRESHED — NOT on INITIAL_SESSION (session restored
    // from cookies on page load, i.e. every already-logged-in visit). Without
    // it the WAL-RLS worker evaluates the subscriber as `anon`, whose RLS
    // grants see zero rows, so the channel joins fine but NO postgres_changes
    // events are ever delivered. setAuth() with no args pulls the current
    // session token. Verified empirically in the browser (events only arrive
    // with this call) and in the integration test (same finding, bug #694).
    let cancelled = false;
    void supabase.realtime.setAuth().then(() => {
      if (cancelled) return;
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          onSubscribedRef.current?.();
        }
      });
    });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
    // instanceId is stable for the component's lifetime; listed for exhaustive
    // deps correctness — it never actually changes between renders.
  }, [workspaceId, table, eventsKey, instanceId]);
}
