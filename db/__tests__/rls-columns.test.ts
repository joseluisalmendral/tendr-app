import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  makeServiceClient,
  provisionTenant,
  teardownTenants,
  type Tenant,
} from "./setup";

/**
 * M6 — column-level secrecy on ai_provider_configs.
 *
 * The workspace owner may SEE that a provider row exists (provider,
 * key_validated_at, last_used_at, ...) but the envelope columns
 * (encrypted_key, key_iv, key_tag, encrypted_dek) are REVOKEd from user roles.
 * A user-session select touching them ERRORS; service_role reads everything.
 */

let a: Tenant;

const SECRET_COLUMNS = [
  "encrypted_key",
  "key_iv",
  "key_tag",
  "encrypted_dek",
] as const;

beforeAll(async () => {
  a = await provisionTenant("cols");

  // Seed a provider config via service_role (it bypasses both RLS and the
  // column REVOKE, and produces the encrypted envelope in real code).
  const service = makeServiceClient();
  const { error } = await service.from("ai_provider_configs").insert({
    workspace_id: a.workspaceId,
    provider: "openai",
    encrypted_key: "enc",
    key_iv: "iv",
    key_tag: "tag",
    encrypted_dek: "dek",
  });
  if (error) throw new Error(`seed provider config failed: ${error.message}`);
});

afterAll(async () => {
  await teardownTenants(a);
});

describe("user session column secrecy", () => {
  it("selecting allowed columns succeeds", async () => {
    const { data, error } = await a.client
      .from("ai_provider_configs")
      .select("id, workspace_id, provider, key_validated_at, last_used_at");
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1);
  });

  it("`select *` FAILS (would expose revoked envelope columns)", async () => {
    const { error } = await a.client
      .from("ai_provider_configs")
      .select("*");
    expect(error).not.toBeNull();
  });

  for (const col of SECRET_COLUMNS) {
    it(`selecting ${col} is denied`, async () => {
      const { error } = await a.client
        .from("ai_provider_configs")
        .select(col);
      expect(error, `column ${col}`).not.toBeNull();
    });
  }
});

describe("service_role bypasses column REVOKE", () => {
  it("service_role can read the envelope columns", async () => {
    const service = makeServiceClient();
    const { data, error } = await service
      .from("ai_provider_configs")
      .select("encrypted_key, key_iv, key_tag, encrypted_dek")
      .eq("workspace_id", a.workspaceId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1);
    expect((data![0] as Record<string, unknown>).encrypted_key).toBe("enc");
  });
});
