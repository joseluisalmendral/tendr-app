import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  makeAnonClient,
  makeServiceClient,
  provisionTenant,
  teardownTenants,
  type Tenant,
} from "./setup";

/**
 * Anonymous parity + public manifest read.
 *
 * An anonymous session carries the `authenticated` Postgres role and a valid
 * auth.uid(), so the same workspace predicate isolates it. It can create a
 * workspace + children and read them back. Any session can read the public
 * ai_model_manifest (using true).
 */

let authedTenant: Tenant;

beforeAll(async () => {
  authedTenant = await provisionTenant("manifest-reader");

  // Ensure at least one manifest row exists for the public-read assertion.
  const service = makeServiceClient();
  await service
    .from("ai_model_manifest")
    .upsert(
      {
        provider: "openai",
        model_id: "gpt-4o-mini",
        display_name: "GPT-4o mini",
        status: "active",
        max_input_tokens: 128000,
        cost_per_1k_input: "0.000150",
        cost_per_1k_output: "0.000600",
      },
      { onConflict: "provider,model_id" },
    );
});

afterAll(async () => {
  await teardownTenants(authedTenant);
});

describe("anonymous session parity", () => {
  it("anon can sign in, create a workspace + child, and read them back", async () => {
    const anon = makeAnonClient();
    const { data: signIn, error: signInErr } =
      await anon.auth.signInAnonymously();
    expect(signInErr).toBeNull();
    const anonUserId = signIn.user!.id;

    const { data: ws, error: wsErr } = await anon
      .from("workspaces")
      .insert({ owner_id: anonUserId, name: "anon-ws" })
      .select("id")
      .single();
    expect(wsErr).toBeNull();
    const wsId = ws!.id as string;

    const { error: clientErr } = await anon
      .from("clients")
      .insert({ workspace_id: wsId, name: "anon-client" });
    expect(clientErr).toBeNull();

    const { data: readBack } = await anon
      .from("clients")
      .select("workspace_id")
      .eq("workspace_id", wsId);
    expect(readBack ?? []).toHaveLength(1);
  });
});

describe("ai_model_manifest public read", () => {
  it("an authenticated session can read manifest rows (using true)", async () => {
    const { data, error } = await authedTenant.client
      .from("ai_model_manifest")
      .select("provider, model_id");
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("an anonymous session can read manifest rows", async () => {
    const anon = makeAnonClient();
    await anon.auth.signInAnonymously();
    const { data, error } = await anon
      .from("ai_model_manifest")
      .select("provider, model_id");
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});
