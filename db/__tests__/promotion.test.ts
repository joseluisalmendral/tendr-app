import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import {
  getLocalCredentials,
  makeAnonClient,
  makeServiceClient,
  provisionTenant,
  teardownTenants,
  type Tenant,
} from "./setup";

/**
 * F4 — Anonymous → Authenticated promotion flow (REQ-7).
 *
 * Real local stack only. The contract under test is uid-preservation: an
 * anonymous user attaches an email via `updateUser({ email })`, confirms it via
 * `verifyOtp({ type: 'email_change', token_hash })`, and ends up as the SAME
 * `auth.users` row (`auth.uid()` unchanged, `is_anonymous` flipped false) with
 * ALL pre-promotion data still visible under RLS and zero data migration.
 *
 * Credential discipline (F3 real-contracts policy):
 *   - Every ASSERTION travels with the USER's real JWT through real PostgREST.
 *   - The admin/service client is used ONLY for fixtures, teardown, and the one
 *     browserless step that has no user-facing API: reading the
 *     `auth.users.email_change_token_new` produced by `updateUser`. There is no
 *     browser to click the confirmation link, so we extract the token GoTrue
 *     minted and feed it to `verifyOtp` on the USER client — exactly what the
 *     real callback route does with the link's `token_hash`.
 *
 * Tokens are never printed. Anonymous sign-ins are rate-limited (30/h locally),
 * so this suite keeps them to the minimum the scenarios require.
 */

/** Holds an anonymous user's data so promotion can be asserted against it. */
interface AnonFixture {
  client: SupabaseClient;
  userId: string;
  workspaceId: string;
  clientId: string;
}

/**
 * Signs in anonymously and creates a workspace + client row through RLS (no
 * admin bypass), mirroring the same upsert contract `ensureAnonymousWorkspace`
 * uses. Returns the live user-session client and the ids it created.
 */
async function provisionAnonWithData(name: string): Promise<AnonFixture> {
  const anon = makeAnonClient();
  const { data: signIn, error: signInErr } =
    await anon.auth.signInAnonymously();
  expect(signInErr).toBeNull();
  const userId = signIn.user!.id;
  expect(signIn.user!.is_anonymous).toBe(true);

  const { data: ws, error: wsErr } = await anon
    .from("workspaces")
    .insert({ owner_id: userId, name })
    .select("id")
    .single();
  expect(wsErr).toBeNull();
  const workspaceId = ws!.id as string;

  const { data: client, error: clientErr } = await anon
    .from("clients")
    .insert({ workspace_id: workspaceId, name: `client-${name}` })
    .select("id")
    .single();
  expect(clientErr).toBeNull();
  const clientId = client!.id as string;

  return { client: anon, userId, workspaceId, clientId };
}

/**
 * Reads the email-change token GoTrue minted for a pending anonymous→email
 * confirmation. This is the one browserless step with no user-facing API: the
 * real flow delivers this token in the confirmation link's `token_hash`. Uses
 * a direct DB read (admin-equivalent, fixtures-only) — the value is then fed to
 * `verifyOtp` on the USER client, so the actual promotion assertion still
 * travels with the user's real credentials. The token is never logged.
 */
function readEmailChangeToken(userId: string): string {
  const conn = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const out = execFileSync(
    "psql",
    [
      conn,
      "-tAc",
      `select email_change_token_new from auth.users where id = '${userId}';`,
    ],
    { encoding: "utf8" },
  );
  return out.trim();
}

const adminUserIds: string[] = [];
const provisionedTenants: Tenant[] = [];

afterAll(async () => {
  const service = makeServiceClient();
  for (const id of adminUserIds) {
    // audit_log.actor_id → auth.users is ON DELETE NO ACTION (append-only by
    // design), so a promote_user trace blocks the user delete. Remove the test
    // actor's traces first (fixtures-only DB cleanup, not an app code path).
    try {
      execFileSync(
        "psql",
        [
          "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
          "-tAc",
          `delete from public.audit_log where actor_id = '${id}';`,
        ],
        { encoding: "utf8" },
      );
    } catch {
      // best-effort
    }
    await service.auth.admin.deleteUser(id).catch(() => undefined);
  }
  if (provisionedTenants.length > 0) {
    await teardownTenants(...provisionedTenants);
  }
});

describe("F4 promotion: anonymous → authenticated", () => {
  it("Test 1 — an anonymous user creates workspace + client data under RLS", async () => {
    const fx = await provisionAnonWithData(`t1-${randomUUID().slice(0, 8)}`);
    adminUserIds.push(fx.userId);

    // The anon user can read back exactly the rows it created (RLS resolves the
    // workspace predicate against its real auth.uid()).
    const { data: clients, error } = await fx.client
      .from("clients")
      .select("id, workspace_id")
      .eq("workspace_id", fx.workspaceId);
    expect(error).toBeNull();
    expect(clients ?? []).toHaveLength(1);
    expect(clients![0].id).toBe(fx.clientId);
  });

  it("Test 2 — promotion via updateUser+verifyOtp preserves uid, data, and writes one audit row", async () => {
    const fx = await provisionAnonWithData(`t2-${randomUUID().slice(0, 8)}`);
    adminUserIds.push(fx.userId);
    const uidBefore = fx.userId;

    const email = `promote-${randomUUID()}@example.test`;

    // Anonymous user attaches an email. Under enable_confirmations=true this
    // does NOT change auth.uid() and leaves is_anonymous=true until confirmed;
    // GoTrue mints a token in auth.users.email_change_token_new.
    const { error: updErr } = await fx.client.auth.updateUser({ email });
    expect(updErr).toBeNull();

    // Browserless confirmation: read the token GoTrue minted (admin/DB only —
    // there is no user-facing API for this and no browser to click the link).
    const tokenHash = readEmailChangeToken(uidBefore);
    expect(tokenHash.length).toBeGreaterThan(0);

    // Confirm on the USER client — this is the verifyOtp the callback runs.
    const { data: verified, error: verifyErr } =
      await fx.client.auth.verifyOtp({
        type: "email_change",
        token_hash: tokenHash,
      });
    expect(verifyErr).toBeNull();

    // Contract 1: same uid, now non-anonymous — proven by the verifyOtp session,
    // not a stale claim.
    expect(verified.user!.id).toBe(uidBefore);
    expect(verified.user!.is_anonymous).toBe(false);

    // Contract 2: refreshed session truth (getUser hits the auth server).
    const { data: who, error: whoErr } = await fx.client.auth.getUser();
    expect(whoErr).toBeNull();
    expect(who.user!.id).toBe(uidBefore);
    expect(who.user!.is_anonymous).toBe(false);

    // Contract 3: pre-promotion data still visible under the post-promotion JWT
    // with ZERO migration (same workspace, same client row).
    const { data: clients, error: readErr } = await fx.client
      .from("clients")
      .select("id, workspace_id")
      .eq("workspace_id", fx.workspaceId);
    expect(readErr).toBeNull();
    expect(clients ?? []).toHaveLength(1);
    expect(clients![0].id).toBe(fx.clientId);

    // Contract 4: the audit trace is written via the RPC and visible per RLS.
    const { error: rpcErr } = await fx.client.rpc("log_promotion");
    expect(rpcErr).toBeNull();

    const { data: audit, error: auditErr } = await fx.client
      .from("audit_log")
      .select("action, actor_id, resource_type, resource_id, workspace_id")
      .eq("actor_id", uidBefore)
      .eq("action", "promote_user");
    expect(auditErr).toBeNull();
    expect(audit ?? []).toHaveLength(1);
    expect(audit![0].resource_type).toBe("user");
    expect(audit![0].resource_id).toBe(uidBefore);
    expect(audit![0].workspace_id).toBe(fx.workspaceId);
  });

  it("Test 3 — a separate user sees ZERO rows of the promoted user's data", async () => {
    const fx = await provisionAnonWithData(`t3-${randomUUID().slice(0, 8)}`);
    adminUserIds.push(fx.userId);

    // Independent password tenant (its own uid + JWT).
    const other = await provisionTenant("promo-isolation");
    provisionedTenants.push(other);

    const { data: rows, error } = await other.client
      .from("clients")
      .select("id")
      .eq("workspace_id", fx.workspaceId);
    // RLS denies cross-tenant SELECT: a successful query returning 0 rows is the
    // contract (PostgREST does not error on a filtered-out workspace).
    expect(error).toBeNull();
    expect(rows ?? []).toHaveLength(0);

    // And the other user cannot see the first user's clients at all, even
    // unfiltered (its own workspace has none of fx's rows).
    const { data: all } = await other.client
      .from("clients")
      .select("id, workspace_id");
    const leaked = (all ?? []).filter(
      (r) => r.workspace_id === fx.workspaceId,
    );
    expect(leaked).toHaveLength(0);
  });

  it("Test 4 — global signOut invalidates the session and rejects refresh", async () => {
    const fx = await provisionAnonWithData(`t4-${randomUUID().slice(0, 8)}`);
    adminUserIds.push(fx.userId);

    // Capture the refresh token before logout to prove it is rejected after.
    const { data: pre } = await fx.client.auth.getSession();
    const refreshToken = pre.session!.refresh_token;
    expect(refreshToken.length).toBeGreaterThan(0);

    const { error: outErr } = await fx.client.auth.signOut({
      scope: "global",
    });
    expect(outErr).toBeNull();

    // The supabase-js client clears its in-memory session on signOut; a fresh
    // client carrying the OLD refresh token must be rejected by the auth server.
    const { apiUrl, publishableKey } = getLocalCredentials();
    const probe = createClient(apiUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: refreshed, error: refreshErr } =
      await probe.auth.refreshSession({ refresh_token: refreshToken });
    expect(refreshErr).not.toBeNull();
    expect(refreshed.session).toBeNull();

    // And the signed-out client has no usable session.
    const { data: post } = await fx.client.auth.getSession();
    expect(post.session).toBeNull();
  });
});
