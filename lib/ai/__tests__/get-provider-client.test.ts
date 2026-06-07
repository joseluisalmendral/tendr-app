import { MockLanguageModelV3 } from "ai/test";
import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { aiProviderConfigs } from "@/db/schema/ai";
import { serviceDb } from "@/db/service";
import {
  provisionTenant,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";
import {
  __setProviderFactory,
  getProviderClient,
  ProviderNotConfiguredError,
  type AiProvider,
} from "@/lib/ai/get-provider-client";
import { encryptProviderKey } from "@/lib/crypto/envelope";

/**
 * F7 REWRITE (expected, not a regression): the F6 test asserted the FROZEN sync
 * `getProviderClient` that only wired the env Google key. F7 supersedes that
 * behavior — the resolver is now async, DB-backed (envelope from
 * `ai_provider_configs`), and constructs any of the 5 providers. The old sync
 * assertions are removed deliberately.
 *
 * SECRETS HARD-STOP: a deterministic, obviously-fake test KEK is injected and
 * restored; plaintext provider keys are fake test constants and we assert they
 * never reach captured logs.
 */

const TEST_KEK = "ab".repeat(32); // 64 hex chars, non-secret test constant.
const PLAINTEXT_KEY = "sk-byo-fake-plaintext-key-9999999999";

let priorKek: string | undefined;
let tenant: Tenant;

/** Inserts an envelope row for (workspace, provider) via serviceDb. */
async function seedProviderConfig(
  workspaceId: string,
  provider: AiProvider,
  plaintext: string,
): Promise<void> {
  const env = encryptProviderKey(plaintext);
  await serviceDb.insert(aiProviderConfigs).values({
    workspaceId,
    provider,
    encryptedKey: env.encryptedKey,
    keyIv: env.keyIv,
    keyTag: env.keyTag,
    encryptedDek: env.encryptedDek,
    keyValidatedAt: new Date(),
  });
}

beforeAll(async () => {
  priorKek = process.env.AI_KEY_KEK;
  process.env.AI_KEY_KEK = TEST_KEK;
  tenant = await provisionTenant("get-provider-client");
});

afterAll(async () => {
  await serviceDb
    .delete(aiProviderConfigs)
    .where(eq(aiProviderConfigs.workspaceId, tenant.workspaceId))
    .catch(() => undefined);
  await teardownTenants(tenant);
  if (priorKek === undefined) {
    delete process.env.AI_KEY_KEK;
  } else {
    process.env.AI_KEY_KEK = priorKek;
  }
});

afterEach(async () => {
  __setProviderFactory(null);
  vi.restoreAllMocks();
  // Clear any seeded rows so each test controls its own provider config set.
  await serviceDb
    .delete(aiProviderConfigs)
    .where(eq(aiProviderConfigs.workspaceId, tenant.workspaceId));
});

describe("getProviderClient (F7 async, envelope-backed)", () => {
  it.each<AiProvider>([
    "openai",
    "anthropic",
    "google",
    "deepseek",
    "moonshot",
  ])(
    "constructs a client for provider %s from a stored envelope and stamps last_used_at",
    async (provider) => {
      await seedProviderConfig(tenant.workspaceId, provider, PLAINTEXT_KEY);

      // Inject a mock factory: assert it receives the DECRYPTED key, and avoid
      // any real SDK key call.
      let receivedProvider: AiProvider | null = null;
      let receivedKey: string | null = null;
      const mockModel = new MockLanguageModelV3({
        provider: "mock",
        modelId: "mock",
      });
      __setProviderFactory((p, apiKey) => {
        receivedProvider = p;
        receivedKey = apiKey;
        return () => mockModel;
      });

      const client = await getProviderClient(tenant.workspaceId, provider);

      // The factory built a callable client and got the decrypted plaintext.
      expect(typeof client).toBe("function");
      expect(client("some-model")).toBe(mockModel);
      expect(receivedProvider).toBe(provider);
      expect(receivedKey).toBe(PLAINTEXT_KEY);

      // last_used_at is stamped.
      const [row] = await serviceDb
        .select({ lastUsedAt: aiProviderConfigs.lastUsedAt })
        .from(aiProviderConfigs)
        .where(eq(aiProviderConfigs.workspaceId, tenant.workspaceId))
        .limit(1);
      expect(row?.lastUsedAt).toBeInstanceOf(Date);
    },
  );

  it("throws ProviderNotConfiguredError ('No key configured for X') when no row exists", async () => {
    await expect(
      getProviderClient(tenant.workspaceId, "openai"),
    ).rejects.toThrow(ProviderNotConfiguredError);
    await expect(
      getProviderClient(tenant.workspaceId, "openai"),
    ).rejects.toThrow(/No key configured for openai/);
  });

  it("never writes the decrypted plaintext key to logs (hard-stop)", async () => {
    await seedProviderConfig(tenant.workspaceId, "anthropic", PLAINTEXT_KEY);

    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "info").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
      vi.spyOn(console, "debug").mockImplementation(() => undefined),
    ];

    __setProviderFactory(() => () => new MockLanguageModelV3());

    await getProviderClient(tenant.workspaceId, "anthropic");

    const allLogged = spies
      .flatMap((s) => s.mock.calls)
      .flat()
      .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
      .join("\n");

    expect(allLogged).not.toContain(PLAINTEXT_KEY);
  });
});
