import { MockLanguageModelV3 } from "ai/test";
import { eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import { serviceDb } from "@/db/service";
import { aiUsageLedger, jobs, workspaces } from "@/db/schema";
import { aiProviderConfigs } from "@/db/schema/ai";
import {
  provisionTenant,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";
import {
  assertExtractBudget,
  __setResolveModelClient,
} from "@/inngest/extract-document";
import {
  __setProviderFactory,
  type AiProvider,
} from "@/lib/ai/get-provider-client";
import { encryptProviderKey } from "@/lib/crypto/envelope";
import type { ExtractionModelRoute } from "@/lib/ai/route-extraction-model";

/**
 * F7 PR5 — extractor migration to getProviderClient (BYO key) + budget gate.
 *
 * These tests close the gap left by the F6 text-path / schema-rejection tests
 * (which inject the model directly into `runExtractAttempt`, bypassing the
 * resolver). Here we drive:
 *   1. the F7 ASYNC, workspaceId-threaded `defaultResolveModelClient` BYO path —
 *      a stored envelope is decrypted via getProviderClient and a model client
 *      is built (mock provider factory: no real SDK key call / network);
 *   2. the env-Google MIGRATION FALLBACK — a workspace with NO BYO google row
 *      still resolves a client off the system key (so F6 jobs keep working);
 *   3. the BUDGET GATE — an already-exceeded monthly budget is TERMINAL: the job
 *      is failed with `error_code='budget_exceeded'` and a NonRetriableError is
 *      thrown (no retry burn); under budget the gate passes.
 *
 * SECRETS HARD-STOP: a deterministic, obviously-fake test KEK is injected and
 * restored; the BYO plaintext key is a fake constant and never reaches a log.
 */

const TEST_KEK = "ab".repeat(32); // 64 hex chars, non-secret test constant.
const PLAINTEXT_KEY = "sk-byo-fake-plaintext-key-9999999999";

const GOOGLE_ROUTE: ExtractionModelRoute = {
  provider: "google",
  modelId: "gemini-3.5-flash",
  supportsPdf: false,
  costPer1kInput: 0.000075,
  costPer1kOutput: 0.0003,
};

let priorKek: string | undefined;
let priorGoogleEnv: string | undefined;
let tenant: Tenant;

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

async function makeJob(workspaceId: string): Promise<string> {
  const [job] = await serviceDb
    .insert(jobs)
    .values({
      workspaceId,
      type: "extract_document",
      status: "running",
      startedAt: new Date(),
    })
    .returning({ id: jobs.id });
  return job.id;
}

beforeAll(async () => {
  priorKek = process.env.AI_KEY_KEK;
  process.env.AI_KEY_KEK = TEST_KEK;
  priorGoogleEnv = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "fake-system-google-key";
  tenant = await provisionTenant("extract-byo");
});

afterAll(async () => {
  await serviceDb
    .delete(aiProviderConfigs)
    .where(eq(aiProviderConfigs.workspaceId, tenant.workspaceId))
    .catch(() => undefined);
  await serviceDb
    .delete(aiUsageLedger)
    .where(eq(aiUsageLedger.workspaceId, tenant.workspaceId))
    .catch(() => undefined);
  await teardownTenants(tenant);
  if (priorKek === undefined) delete process.env.AI_KEY_KEK;
  else process.env.AI_KEY_KEK = priorKek;
  if (priorGoogleEnv === undefined)
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  else process.env.GOOGLE_GENERATIVE_AI_API_KEY = priorGoogleEnv;
});

afterEach(async () => {
  __setResolveModelClient(null);
  __setProviderFactory(null);
  await serviceDb
    .delete(aiProviderConfigs)
    .where(eq(aiProviderConfigs.workspaceId, tenant.workspaceId));
  await serviceDb
    .delete(aiUsageLedger)
    .where(eq(aiUsageLedger.workspaceId, tenant.workspaceId));
  // Reset the workspace budget to the default between tests.
  await serviceDb
    .update(workspaces)
    .set({ aiMonthlyBudgetCents: 5000 })
    .where(eq(workspaces.id, tenant.workspaceId));
});

describe("extractor model resolution (F7 BYO key path)", () => {
  it("resolves the model client from the workspace BYO key via getProviderClient", async () => {
    await seedProviderConfig(tenant.workspaceId, "google", PLAINTEXT_KEY);

    // Inject a mock provider factory so getProviderClient builds a client
    // WITHOUT a real SDK key call, and assert it received the DECRYPTED key.
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

    // The production default resolver (not a test stub) is exercised: it must
    // be async and thread workspaceId into getProviderClient.
    const { __getDefaultResolveModelClient } = await import(
      "@/inngest/extract-document"
    );
    const resolve = __getDefaultResolveModelClient();
    const model = await resolve(GOOGLE_ROUTE, tenant.workspaceId);

    expect(model).toBe(mockModel);
    expect(receivedProvider).toBe("google");
    expect(receivedKey).toBe(PLAINTEXT_KEY);
  });

  it("falls back to the system Google env key when the workspace has no BYO google row", async () => {
    // No provider config seeded for this workspace -> ProviderNotConfiguredError
    // inside getProviderClient -> google env fallback path.
    const { __getDefaultResolveModelClient } = await import(
      "@/inngest/extract-document"
    );
    const resolve = __getDefaultResolveModelClient();
    const model = await resolve(GOOGLE_ROUTE, tenant.workspaceId);

    // The fallback builds a real Google client off the system env key; we only
    // assert a model object was produced (no network call happens here).
    expect(model).toBeTruthy();
  });
});

describe("extractor budget gate (F7)", () => {
  it("passes under budget without throwing", async () => {
    const jobId = await makeJob(tenant.workspaceId);
    await expect(
      assertExtractBudget(jobId, tenant.workspaceId),
    ).resolves.toBeUndefined();

    const [row] = await serviceDb
      .select({ status: jobs.status })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    expect(row.status).toBe("running"); // untouched
    await serviceDb.delete(jobs).where(eq(jobs.id, jobId));
  });

  it("over budget: terminal failure with budget_exceeded, NonRetriableError, no model call", async () => {
    // Drive the workspace over budget: a 1-cent budget with a 50-cent ledger row.
    await serviceDb
      .update(workspaces)
      .set({ aiMonthlyBudgetCents: 1 })
      .where(eq(workspaces.id, tenant.workspaceId));
    await serviceDb.insert(aiUsageLedger).values({
      workspaceId: tenant.workspaceId,
      feature: "extract_document",
      provider: "google",
      modelId: "gemini-3.5-flash",
      tokensIn: 100,
      tokensOut: 100,
      costCents: 50,
    });

    const jobId = await makeJob(tenant.workspaceId);

    await expect(
      assertExtractBudget(jobId, tenant.workspaceId),
    ).rejects.toBeInstanceOf(NonRetriableError);

    const [row] = await serviceDb
      .select({ status: jobs.status, result: jobs.result })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    expect(row.status).toBe("failed");
    expect(
      (row.result as { error_code?: string } | null)?.error_code,
    ).toBe("budget_exceeded");

    await serviceDb.delete(jobs).where(eq(jobs.id, jobId));
  });
});
