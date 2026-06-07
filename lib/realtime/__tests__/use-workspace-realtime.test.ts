import { describe, expect, it } from "vitest";

import {
  workspaceRealtimeChannelName,
  workspaceRealtimeFilter,
} from "../use-workspace-realtime";

/**
 * Regression for the F6 channel-name collision crash:
 * "cannot add `postgres_changes` callbacks for realtime:workspace:{id} after
 * `subscribe()`".
 *
 * Root cause: supabase-js caches ONE RealtimeChannel object per topic string.
 * The old hook named its channel with a FIXED `workspace:${workspaceId}`, so
 * when DocumentsTab mounted N `useJob` instances at once, instance #2 received
 * the SAME channel object instance #1 had already `subscribe()`d, then called
 * `.on('postgres_changes', …)` on it → throw. The fix makes the channel name
 * unique per hook instance (a `useId()` value appended via
 * `workspaceRealtimeChannelName`).
 *
 * The hook's React/socket wiring is thin; the collision is fully determined by
 * the channel-naming logic, so we test it at the pure-logic level — same
 * convention as the rest of the suite (no DOM, no live socket). We also model a
 * fake supabase client whose `.channel()` caches by topic (exactly like
 * supabase-js) and a channel that throws if `.on()` is called after
 * `.subscribe()`, then prove two concurrent instances never trip it.
 */

describe("workspaceRealtimeChannelName — per-instance uniqueness", () => {
  it("includes the workspace and table so the name is meaningful", () => {
    expect(workspaceRealtimeChannelName("ws-1", "jobs", "r0")).toBe(
      "workspace:ws-1:jobs:r0",
    );
  });

  it("produces DISTINCT names for two instances on the same workspace+table", () => {
    // Two concurrently-mounted useJob cards in DocumentsTab → two useId() values.
    const a = workspaceRealtimeChannelName("ws-1", "jobs", "«r0»");
    const b = workspaceRealtimeChannelName("ws-1", "jobs", "«r1»");
    expect(a).not.toBe(b);
  });

  it("produces the SAME name across re-renders of one instance (stable useId)", () => {
    // A single instance keeps its useId() across renders → channel is reused,
    // not duplicated, so unmount cleanup removes exactly the right channel.
    const first = workspaceRealtimeChannelName("ws-1", "jobs", "«r5»");
    const second = workspaceRealtimeChannelName("ws-1", "jobs", "«r5»");
    expect(first).toBe(second);
  });
});

/**
 * Minimal fake of the parts of supabase-js the hook touches, reproducing the
 * exact failure mode: one channel object per topic, and `.on()` after
 * `.subscribe()` throws.
 */
type FakeChannel = {
  topic: string;
  subscribed: boolean;
  onCalls: number;
  on: () => FakeChannel;
  subscribe: (cb?: (status: string) => void) => FakeChannel;
};

function makeFakeSupabase() {
  const channelsByTopic = new Map<string, FakeChannel>();
  const removed: string[] = [];

  function channel(topic: string): FakeChannel {
    const existing = channelsByTopic.get(topic);
    if (existing) return existing; // supabase-js returns the cached object
    const ch: FakeChannel = {
      topic,
      subscribed: false,
      onCalls: 0,
      on() {
        if (ch.subscribed) {
          throw new Error(
            `cannot add \`postgres_changes\` callbacks for realtime:${topic} after \`subscribe()\``,
          );
        }
        ch.onCalls += 1;
        return ch;
      },
      subscribe(cb) {
        ch.subscribed = true;
        cb?.("SUBSCRIBED");
        return ch;
      },
    };
    channelsByTopic.set(topic, ch);
    return ch;
  }

  function removeChannel(ch: FakeChannel) {
    removed.push(ch.topic);
    channelsByTopic.delete(ch.topic);
  }

  return { channel, removeChannel, channelsByTopic, removed };
}

/**
 * Reproduces the hook's effect body (the relevant part) for a single instance:
 * resolve the name, get the channel, bind `.on()`, then `.subscribe()`. Returns
 * a cleanup that removes ONLY this instance's channel.
 */
function setupInstance(
  supabase: ReturnType<typeof makeFakeSupabase>,
  workspaceId: string,
  table: string,
  instanceId: string,
): () => void {
  const ch = supabase.channel(
    workspaceRealtimeChannelName(workspaceId, table, instanceId),
  );
  // Mirror the real call: the hook binds with the MANDATORY tenant filter. The
  // fake only cares THAT `.on()` is invoked (and that it throws post-subscribe),
  // so we assert the filter is the required string and then bind with no args.
  const filter = workspaceRealtimeFilter(workspaceId);
  if (filter !== `workspace_id=eq.${workspaceId}`) {
    throw new Error("tenant filter regressed");
  }
  ch.on();
  ch.subscribe(() => {});
  return () => supabase.removeChannel(ch);
}

describe("concurrent subscriptions never crash on the shared-channel topic", () => {
  it("two instances on the same workspace+table bind on DISTINCT channels", () => {
    const supabase = makeFakeSupabase();

    // The exact F6 scenario: two document cards mount at once.
    const cleanupA = setupInstance(supabase, "ws-1", "jobs", "«r0»");
    // Before the fix this second setup threw the collision error.
    const cleanupB = () =>
      setupInstance(supabase, "ws-1", "jobs", "«r1»");
    expect(cleanupB).not.toThrow();

    expect(supabase.channelsByTopic.size).toBe(2);
    for (const ch of supabase.channelsByTopic.values()) {
      expect(ch.onCalls).toBe(1); // .on() ran exactly once per channel
      expect(ch.subscribed).toBe(true);
    }

    cleanupA();
  });

  it("cleanup removes ONLY this instance's channel, leaving siblings intact", () => {
    const supabase = makeFakeSupabase();
    const cleanupA = setupInstance(supabase, "ws-1", "jobs", "«r0»");
    setupInstance(supabase, "ws-1", "jobs", "«r1»");

    cleanupA();

    expect(supabase.removed).toEqual(["workspace:ws-1:jobs:«r0»"]);
    expect(supabase.channelsByTopic.has("workspace:ws-1:jobs:«r1»")).toBe(true);
    expect(supabase.channelsByTopic.has("workspace:ws-1:jobs:«r0»")).toBe(false);
  });

  it("REGRESSION: a fixed channel name (old behavior) would crash on the 2nd .on()", () => {
    // Documents why the fix is necessary: reuse the SAME topic for both
    // instances (the pre-fix bug) and the fake reproduces the production throw.
    const supabase = makeFakeSupabase();
    const fixedName = "workspace:ws-1"; // the old, colliding name

    const ch1 = supabase.channel(fixedName);
    ch1.on();
    ch1.subscribe(() => {});

    const ch2 = supabase.channel(fixedName); // same cached object
    expect(ch2).toBe(ch1);
    expect(() => ch2.on()).toThrowError(/after `subscribe\(\)`/);
  });
});
