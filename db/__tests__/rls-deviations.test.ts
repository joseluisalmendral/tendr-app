import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  makeServiceClient,
  provisionTenant,
  teardownTenants,
  type Tenant,
} from "./setup";

/**
 * Deviation enforcement: the user session is limited to the verbs the matrix
 * grants. Anything beyond must be denied (policy violation or 0 rows).
 */

let a: Tenant;

beforeAll(async () => {
  a = await provisionTenant("dev");
});

afterAll(async () => {
  await teardownTenants(a);
});

function expectDenied(result: { data: unknown[] | null; error: unknown }) {
  if (result.error) {
    expect(result.error).not.toBeNull();
  } else {
    expect(result.data ?? []).toHaveLength(0);
  }
}

describe("jobs: SELECT + INSERT only", () => {
  it("user can INSERT a job in its workspace", async () => {
    const { error } = await a.client
      .from("jobs")
      .insert({ workspace_id: a.workspaceId, type: "extract" });
    expect(error).toBeNull();
  });

  it("user cannot UPDATE jobs (no UPDATE policy)", async () => {
    // Seed a job via service_role so a real row exists to target.
    const service = makeServiceClient();
    const { data: job } = await service
      .from("jobs")
      .insert({ workspace_id: a.workspaceId, type: "svc" })
      .select("id")
      .single();

    expectDenied(
      await a.client
        .from("jobs")
        .update({ status: "completed" })
        .eq("id", job!.id)
        .select("id"),
    );
  });

  it("user cannot DELETE jobs (no DELETE policy)", async () => {
    expectDenied(
      await a.client
        .from("jobs")
        .delete()
        .eq("workspace_id", a.workspaceId)
        .select("id"),
    );
  });
});

describe("subscriptions: SELECT only", () => {
  it("user cannot INSERT a subscription (no INSERT policy)", async () => {
    expectDenied(
      await a.client
        .from("subscriptions")
        .insert({
          workspace_id: a.workspaceId,
          stripe_customer_id: "cus_x",
          status: "active",
        })
        .select("id"),
    );
  });
});

describe("audit_log: SELECT only", () => {
  it("user cannot INSERT an audit row (no INSERT policy)", async () => {
    expectDenied(
      await a.client
        .from("audit_log")
        .insert({
          workspace_id: a.workspaceId,
          action: "x",
          resource_type: "client",
        })
        .select("id"),
    );
  });
});

describe("ai_usage_ledger: SELECT + INSERT only", () => {
  it("user can INSERT a ledger row", async () => {
    const { error } = await a.client.from("ai_usage_ledger").insert({
      workspace_id: a.workspaceId,
      feature: "summarize",
      provider: "openai",
      model_id: "gpt-4o-mini",
      tokens_in: 10,
      tokens_out: 5,
      cost_cents: 1,
      cost_microcents: 10000, // F7c: NOT NULL micro-cents column
    });
    expect(error).toBeNull();
  });

  it("user cannot UPDATE a ledger row (no UPDATE policy)", async () => {
    const service = makeServiceClient();
    const { data: row } = await service
      .from("ai_usage_ledger")
      .insert({
        workspace_id: a.workspaceId,
        feature: "summarize",
        provider: "openai",
        model_id: "gpt-4o-mini",
        tokens_in: 1,
        tokens_out: 1,
        cost_cents: 1,
        cost_microcents: 10000, // F7c: NOT NULL micro-cents column
      })
      .select("id")
      .single();

    expectDenied(
      await a.client
        .from("ai_usage_ledger")
        .update({ cost_cents: 999 })
        .eq("id", row!.id)
        .select("id"),
    );
  });

  it("user cannot DELETE a ledger row (no DELETE policy)", async () => {
    expectDenied(
      await a.client
        .from("ai_usage_ledger")
        .delete()
        .eq("workspace_id", a.workspaceId)
        .select("id"),
    );
  });
});

describe("ai_model_manifest: no user writes", () => {
  it("user cannot INSERT into the manifest", async () => {
    expectDenied(
      await a.client
        .from("ai_model_manifest")
        .insert({
          provider: "openai",
          model_id: "rogue-model",
          display_name: "Rogue",
          max_input_tokens: 1,
          cost_per_1k_input: "0.000001",
          cost_per_1k_output: "0.000001",
        })
        .select("provider"),
    );
  });
});

describe("stripe_webhook_events: deny-all", () => {
  it("user cannot SELECT (RLS on, zero policies)", async () => {
    const { data } = await a.client
      .from("stripe_webhook_events")
      .select("event_id");
    expect(data ?? []).toHaveLength(0);
  });

  it("user cannot INSERT", async () => {
    expectDenied(
      await a.client
        .from("stripe_webhook_events")
        .insert({ event_id: "evt_x", type: "test" })
        .select("event_id"),
    );
  });
});
