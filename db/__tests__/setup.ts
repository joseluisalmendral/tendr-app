import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * RLS test harness.
 *
 * Provisions two ISOLATED tenants (User A / WS-A, User B / WS-B) against the
 * LOCAL Supabase stack and exposes:
 *   - one authenticated user-session client per tenant (RLS APPLIES),
 *   - one service_role client (RLS BYPASSED) for setup/inspection.
 *
 * Local credentials are read at RUNTIME from `supabase status -o env`; they are
 * the well-known local dev keys and are never persisted to committed files.
 */

export interface LocalCredentials {
  apiUrl: string;
  publishableKey: string;
  secretKey: string;
}

let cached: LocalCredentials | null = null;

/** Reads local Supabase credentials from the CLI at runtime. */
export function getLocalCredentials(): LocalCredentials {
  if (cached) return cached;

  const raw = execSync("supabase status -o env", {
    encoding: "utf8",
  });

  const env = new Map<string, string>();
  for (const line of raw.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
    if (match) env.set(match[1], match[2]);
  }

  const apiUrl = env.get("API_URL");
  // New Supabase key system; fall back to legacy anon/service if absent.
  const publishableKey =
    env.get("PUBLISHABLE_KEY") ?? env.get("ANON_KEY") ?? "";
  const secretKey = env.get("SECRET_KEY") ?? env.get("SERVICE_ROLE_KEY") ?? "";

  if (!apiUrl || !publishableKey || !secretKey) {
    throw new Error(
      "Could not resolve local Supabase credentials from `supabase status -o env`. Is the local stack running?",
    );
  }

  cached = { apiUrl, publishableKey, secretKey };
  return cached;
}

/** A service_role client — bypasses RLS. Used only for setup and inspection. */
export function makeServiceClient(): SupabaseClient {
  const { apiUrl, secretKey } = getLocalCredentials();
  return createClient(apiUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A fresh anonymous (unauthenticated) user-session client — RLS applies. */
export function makeAnonClient(): SupabaseClient {
  const { apiUrl, publishableKey } = getLocalCredentials();
  return createClient(apiUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface Tenant {
  /** Authenticated user-session client (RLS applies). */
  client: SupabaseClient;
  userId: string;
  email: string;
  password: string;
  workspaceId: string;
}

/**
 * Creates a confirmed auth user (via service_role admin), signs in as that user
 * to obtain an authenticated session client, and creates that user's
 * workspace. Returns the tenant handle.
 */
export async function provisionTenant(label: string): Promise<Tenant> {
  const service = makeServiceClient();
  const { apiUrl, publishableKey } = getLocalCredentials();

  const email = `rls-${label}-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;

  const { data: created, error: createErr } =
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (createErr || !created.user) {
    throw new Error(`createUser failed: ${createErr?.message}`);
  }
  const userId = created.user.id;

  // Sign in on a dedicated client so it carries this user's JWT.
  const client = createClient(apiUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr) {
    throw new Error(`signIn failed: ${signInErr.message}`);
  }

  // Create the workspace under the user session (exercises INSERT policy).
  const { data: ws, error: wsErr } = await client
    .from("workspaces")
    .insert({ owner_id: userId, name: `WS-${label}` })
    .select("id")
    .single();
  if (wsErr || !ws) {
    throw new Error(`workspace insert failed: ${wsErr?.message}`);
  }

  return { client, userId, email, password, workspaceId: ws.id as string };
}

/** Provisions a client row in a tenant's workspace via its user session. */
export async function seedClientRow(
  tenant: Tenant,
  name = "Acme",
): Promise<string> {
  const { data, error } = await tenant.client
    .from("clients")
    .insert({ workspace_id: tenant.workspaceId, name })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`seed client failed: ${error?.message}`);
  }
  return data.id as string;
}

/** Best-effort teardown: deletes the auth users (cascades to their data). */
export async function teardownTenants(...tenants: Tenant[]): Promise<void> {
  const service = makeServiceClient();
  for (const t of tenants) {
    await service.auth.admin.deleteUser(t.userId).catch(() => undefined);
  }
}
