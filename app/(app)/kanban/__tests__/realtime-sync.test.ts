import { execFileSync } from "node:child_process";

import {
  createClient,
  type RealtimeChannel,
  type RealtimePostgresChangesPayload,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  getLocalCredentials,
  provisionTenant,
  seedClientRow,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";

import { moveCaseStatus } from "../move-case";
import { workspaceRealtimeFilter } from "@/lib/realtime/use-workspace-realtime";

/**
 * Realtime sync test (design §8) against the REAL local Supabase stack.
 *
 * We model the ONLY multi-session scenario Tendr has — the SAME user in a second
 * tab (workspaces are 1:1 owner→workspace; there are no multi-user workspaces,
 * see design §1). One A-session opens the workspace channel exactly as the
 * browser board does (channel `workspace:${ws}`, postgres_changes on `cases`,
 * MANDATORY filter `workspace_id=eq.${ws}`); a SECOND independent A-session then
 * runs the real `move_case` RPC. We assert the subscriber's callback fires with
 * the new status. ZERO service_role in the asserted Realtime path — both clients
 * carry user A's JWT (the harness service client is used ONLY for provisioning /
 * teardown, disclosed). We also assert the tenant filter is exactly the required
 * string and that a DIFFERENT tenant's change never reaches A's channel.
 */

const LOCAL_DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SUBSCRIBE_TIMEOUT_MS = 10_000;

/** Seeds a case row in a tenant's workspace via its user session (RLS applies). */
async function seedCaseRow(
  tenant: Tenant,
  clientId: string,
  title = "Caso realtime",
): Promise<string> {
  const { data, error } = await tenant.client
    .from("cases")
    .insert({
      workspace_id: tenant.workspaceId,
      client_id: clientId,
      title,
      status: "prospect",
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`seed case failed: ${error?.message}`);
  }
  return data.id as string;
}

/**
 * Signs in an independent session for an existing tenant (models a "second tab"
 * of the SAME user). When `forRealtime` is set, the session JWT is pushed onto
 * the realtime socket via `setAuth` — REQUIRED for `postgres_changes` to pass
 * the `cases` SELECT RLS check on this stack (the browser client does the
 * equivalent automatically via the @supabase/ssr session cookie).
 */
async function makeSecondSession(
  tenant: Tenant,
  forRealtime = false,
): Promise<SupabaseClient> {
  const { apiUrl, publishableKey } = getLocalCredentials();
  const client = createClient(apiUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: tenant.email,
    password: tenant.password,
  });
  if (error) throw new Error(`second session sign-in failed: ${error.message}`);

  if (forRealtime) {
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (token) client.realtime.setAuth(token);
  }

  return client;
}

/**
 * Subscribes to the workspace `cases` channel exactly as the board's shared hook
 * does and resolves with the first UPDATE payload (or rejects on timeout).
 */
function waitForFirstUpdate(
  client: SupabaseClient,
  workspaceId: string,
): {
  channel: RealtimeChannel;
  filter: string;
  ready: Promise<void>;
  next: Promise<RealtimePostgresChangesPayload<{ [k: string]: unknown }>>;
} {
  const filter = workspaceRealtimeFilter(workspaceId);

  let resolveReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  let resolveNext!: (
    p: RealtimePostgresChangesPayload<{ [k: string]: unknown }>,
  ) => void;
  const next = new Promise<
    RealtimePostgresChangesPayload<{ [k: string]: unknown }>
  >((resolve) => {
    resolveNext = resolve;
  });

  const channel = client
    .channel(`workspace:${workspaceId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "cases", filter },
      (payload) => resolveNext(payload),
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") resolveReady();
    });

  return { channel, filter, ready, next };
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout: ${label}`)), ms),
    ),
  ]);
}

describe("workspace Realtime sync on cases", () => {
  let a: Tenant;
  let b: Tenant;
  let clientA: string;
  let clientB: string;

  beforeAll(async () => {
    a = await provisionTenant("rt-a");
    b = await provisionTenant("rt-b");
    clientA = await seedClientRow(a, "Cliente RT A");
    clientB = await seedClientRow(b, "Cliente RT B");
  });

  afterAll(async () => {
    // move_case writes audit rows keyed to the actor; actor_id → auth.users is
    // ON DELETE NO ACTION, so clear them by actor_id BEFORE teardown deletes
    // the users (design §8 gotcha).
    for (const t of [a, b]) {
      try {
        execFileSync(
          "psql",
          [
            LOCAL_DB,
            "-tAc",
            `delete from public.audit_log where actor_id = '${t.userId}';`,
          ],
          { encoding: "utf8" },
        );
      } catch {
        // best-effort
      }
    }
    await teardownTenants(a, b);
  });

  it("delivers a same-user second-session move_case as an UPDATE with the new status, on the exact tenant filter", async () => {
    const caseId = await seedCaseRow(a, clientA, "Caso a sincronizar");

    // Tab 1: a dedicated A subscriber session (realtime-authed) opens the
    // channel exactly as the board hook does.
    const subscriber = await makeSecondSession(a, true);
    const sub = waitForFirstUpdate(subscriber, a.workspaceId);
    await withTimeout(sub.ready, SUBSCRIBE_TIMEOUT_MS, "channel SUBSCRIBED");

    // The MANDATORY tenant filter is exactly the required string.
    expect(sub.filter).toBe(`workspace_id=eq.${a.workspaceId}`);

    // Tab 2 (a different same-user session): run the real move_case RPC.
    const mutator = await makeSecondSession(a);
    const result = await moveCaseStatus(mutator, {
      caseId,
      newStatus: "active",
    });
    expect(result.status).toBe("success");

    // Tab 1's callback fires with the new status (the board's idempotent compare
    // would APPLY this because active !== the displayed prospect).
    const payload = await withTimeout(
      sub.next,
      SUBSCRIBE_TIMEOUT_MS,
      "UPDATE callback",
    );
    expect(payload.eventType).toBe("UPDATE");
    expect((payload.new as { id?: string }).id).toBe(caseId);
    expect((payload.new as { status?: string }).status).toBe("active");

    await subscriber.removeChannel(sub.channel);
  });

  it("does NOT deliver another tenant's change to a workspace-filtered channel", async () => {
    const foreignCase = await seedCaseRow(b, clientB, "Caso de B");

    // A dedicated A subscriber session filtered to A's workspace.
    const subscriber = await makeSecondSession(a, true);
    const sub = waitForFirstUpdate(subscriber, a.workspaceId);
    await withTimeout(sub.ready, SUBSCRIBE_TIMEOUT_MS, "channel SUBSCRIBED");
    expect(sub.filter).toBe(`workspace_id=eq.${a.workspaceId}`);

    // B moves B's own case in a B session.
    const mutatorB = await makeSecondSession(b);
    const result = await moveCaseStatus(mutatorB, {
      caseId: foreignCase,
      newStatus: "active",
    });
    expect(result.status).toBe("success");

    // A's callback must NOT fire for B's change → the wait times out.
    await expect(
      withTimeout(sub.next, 4_000, "unexpected cross-tenant delivery"),
    ).rejects.toThrow(/timeout/);

    await subscriber.removeChannel(sub.channel);
  });
});
