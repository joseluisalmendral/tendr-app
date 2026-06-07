import { MockLanguageModelV3 } from "ai/test";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  provisionTenant,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";
import type { TracePort, TraceGeneration } from "@/lib/ai/trace";

/**
 * suggestWith (the pure suggest seam) against the REAL local Supabase stack.
 *
 * Covers SPEC R-suggest:
 *   - valid case -> suggestion + ledger row + trace metadata.feature='suggest';
 *     ZERO writes to clients/cases (ephemeral).
 *   - 101% budget -> budget_exceeded BEFORE any model call.
 *   - note/summary/suggestion text NOT in trace (HARD-STOP).
 *
 * DATABASE_URL must be exported in the shell.
 */
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const NOTE_TEXT = "SECRET-SUGGEST-NOTE: el cliente no respondió al último email.";
const SUGGESTION_TEXT = "Envía un email de seguimiento mañana.";

function recordingTrace(): { trace: TracePort; dump: () => string } {
  const records: unknown[] = [];
  const generation: TraceGeneration = {
    update: (args) => records.push(args),
    end: () => {},
  };
  return {
    trace: {
      startGeneration: (name, model, metadata) => {
        records.push({ name, model, metadata });
        return generation;
      },
      flush: async () => {},
    },
    dump: () => JSON.stringify(records),
  };
}

function generatingModel(text: string): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "mock",
    modelId: "mock-gen",
    doGenerate: async () => ({
      content: [{ type: "text" as const, text }],
      finishReason: { unified: "stop" as const, raw: "stop" },
      usage: {
        inputTokens: { total: 40, noCache: 40, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 10, text: 10, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}

describe("suggestWith", () => {
  let tenant: Tenant;
  let serviceDb: typeof import("@/db/service")["serviceDb"];
  let suggest: typeof import("../suggest")["suggestWith"];
  let manifestCostFor: typeof import("@/lib/ai/manifest-cost")["manifestCostFor"];
  let s: typeof import("@/db/schema");
  let clientId: string;
  let caseId: string;

  beforeAll(async () => {
    ({ serviceDb } = await import("@/db/service"));
    ({ suggestWith: suggest } = await import("../suggest"));
    ({ manifestCostFor } = await import("@/lib/ai/manifest-cost"));
    s = await import("@/db/schema");

    tenant = await provisionTenant("suggest");
    const [cli] = await serviceDb
      .insert(s.clients)
      .values({ workspaceId: tenant.workspaceId, name: "Acme" })
      .returning({ id: s.clients.id });
    clientId = cli.id;

    const [cs] = await serviceDb
      .insert(s.cases)
      .values({ workspaceId: tenant.workspaceId, clientId, title: "Renovación" })
      .returning({ id: s.cases.id });
    caseId = cs.id;

    await serviceDb.insert(s.notes).values({
      workspaceId: tenant.workspaceId,
      clientId,
      body: NOTE_TEXT,
    });
  });

  afterAll(async () => {
    await teardownTenants(tenant);
  });

  afterEach(async () => {
    await serviceDb
      .delete(s.aiUsageLedger)
      .where(eq(s.aiUsageLedger.workspaceId, tenant.workspaceId));
    await serviceDb
      .update(s.workspaces)
      .set({ aiMonthlyBudgetCents: 5000 })
      .where(eq(s.workspaces.id, tenant.workspaceId));
  });

  it("valid case: suggestion + ledger + feature metadata; NO writes to clients/cases", async () => {
    const model = generatingModel(SUGGESTION_TEXT);
    const factory = vi.fn(async () => () => model);
    const { trace, dump } = recordingTrace();

    // Snapshot client + case so we can prove the feature wrote nothing to them.
    const [clientBefore] = await serviceDb
      .select()
      .from(s.clients)
      .where(eq(s.clients.id, clientId));
    const [caseBefore] = await serviceDb
      .select()
      .from(s.cases)
      .where(eq(s.cases.id, caseId));

    const result = await suggest(
      { db: serviceDb, getProviderClient: factory, getManifestCost: manifestCostFor, trace },
      tenant.workspaceId,
      { caseId },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suggestion).toBe(SUGGESTION_TEXT);

    const ledger = await serviceDb
      .select()
      .from(s.aiUsageLedger)
      .where(eq(s.aiUsageLedger.workspaceId, tenant.workspaceId));
    expect(ledger.length).toBe(1);
    expect(ledger[0].feature).toBe("suggest");

    // ZERO writes to clients/cases.
    const [clientAfter] = await serviceDb
      .select()
      .from(s.clients)
      .where(eq(s.clients.id, clientId));
    const [caseAfter] = await serviceDb
      .select()
      .from(s.cases)
      .where(eq(s.cases.id, caseId));
    expect(clientAfter).toEqual(clientBefore);
    expect(caseAfter).toEqual(caseBefore);

    const traced = dump();
    expect(traced).toContain("suggest"); // metadata.feature
    // HARD-STOP: note + suggestion text NOT traced.
    expect(traced).not.toContain("SECRET-SUGGEST-NOTE");
    expect(traced).not.toContain("seguimiento");
  });

  it("101% budget: budget_exceeded BEFORE any model call", async () => {
    await serviceDb.insert(s.aiUsageLedger).values({
      workspaceId: tenant.workspaceId,
      feature: "suggest",
      provider: "google",
      modelId: "gemini-3.5-flash",
      tokensIn: 0,
      tokensOut: 0,
      costCents: 5100,
      costMicrocents: 5100 * 10000, // F7c: gate sums micro-cents
    });

    const factory = vi.fn(async () => () => generatingModel(SUGGESTION_TEXT));
    const { trace } = recordingTrace();

    const result = await suggest(
      { db: serviceDb, getProviderClient: factory, getManifestCost: manifestCostFor, trace },
      tenant.workspaceId,
      { caseId },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("budget_exceeded");
    expect(factory).not.toHaveBeenCalled();
  });
});
