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
 * summarizeWith (the pure summarize seam) against the REAL local Supabase stack.
 * The provider model is an `ai/test` MockLanguageModelV3 injected via
 * getProviderClient (no network); the Langfuse trace port is a recording fake.
 *
 * Covers SPEC R-summarize:
 *   - with notes -> summary + clients.notes_summary updated + ledger row +
 *     trace metadata.feature='summarize'; note text NOT in trace (HARD-STOP).
 *   - without notes -> empty summary, NO model call, NO ledger row.
 *   - 101% budget -> budget_exceeded BEFORE any model call.
 *
 * DATABASE_URL must be exported in the shell.
 */
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const NOTE_A = "SECRET-NOTE-uno: el cliente quiere un descuento.";
const NOTE_B = "SECRET-NOTE-dos: reunión pendiente para el viernes.";
const SUMMARY_TEXT = "Resumen accionable del cliente.";

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
        inputTokens: { total: 80, noCache: 80, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 20, text: 20, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}

describe("summarizeWith", () => {
  let tenant: Tenant;
  let serviceDb: typeof import("@/db/service")["serviceDb"];
  let summarize: typeof import("../summarize")["summarizeWith"];
  let manifestCostFor: typeof import("@/lib/ai/manifest-cost")["manifestCostFor"];
  let s: typeof import("@/db/schema");
  let clientId: string;

  beforeAll(async () => {
    ({ serviceDb } = await import("@/db/service"));
    ({ summarizeWith: summarize } = await import("../summarize"));
    ({ manifestCostFor } = await import("@/lib/ai/manifest-cost"));
    s = await import("@/db/schema");

    tenant = await provisionTenant("summarize");
    const [cli] = await serviceDb
      .insert(s.clients)
      .values({ workspaceId: tenant.workspaceId, name: "Acme" })
      .returning({ id: s.clients.id });
    clientId = cli.id;
  });

  afterAll(async () => {
    await teardownTenants(tenant);
  });

  afterEach(async () => {
    await serviceDb.delete(s.notes).where(eq(s.notes.workspaceId, tenant.workspaceId));
    await serviceDb
      .delete(s.aiUsageLedger)
      .where(eq(s.aiUsageLedger.workspaceId, tenant.workspaceId));
    await serviceDb
      .update(s.clients)
      .set({ notesSummary: null })
      .where(eq(s.clients.id, clientId));
    await serviceDb
      .update(s.workspaces)
      .set({ aiMonthlyBudgetCents: 5000 })
      .where(eq(s.workspaces.id, tenant.workspaceId));
  });

  it("with notes: writes summary + notes_summary + ledger; trace omits note text", async () => {
    await serviceDb.insert(s.notes).values([
      { workspaceId: tenant.workspaceId, clientId, body: NOTE_A },
      { workspaceId: tenant.workspaceId, clientId, body: NOTE_B },
    ]);

    const model = generatingModel(SUMMARY_TEXT);
    const factory = vi.fn(async () => () => model);
    const { trace, dump } = recordingTrace();

    const result = await summarize(
      { db: serviceDb, getProviderClient: factory, getManifestCost: manifestCostFor, trace },
      tenant.workspaceId,
      { clientId },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary).toBe(SUMMARY_TEXT);

    const [client] = await serviceDb
      .select({ notesSummary: s.clients.notesSummary })
      .from(s.clients)
      .where(eq(s.clients.id, clientId));
    expect(client.notesSummary).toBe(SUMMARY_TEXT);

    const ledger = await serviceDb
      .select()
      .from(s.aiUsageLedger)
      .where(eq(s.aiUsageLedger.workspaceId, tenant.workspaceId));
    expect(ledger.length).toBe(1);
    expect(ledger[0].feature).toBe("summarize");
    expect(ledger[0].tokensIn).toBe(80);
    expect(ledger[0].tokensOut).toBe(20);

    const traced = dump();
    expect(traced).toContain("summarize"); // metadata.feature
    expect(traced).toContain("noteCount");
    // HARD-STOP: no note text, no produced summary text in the trace.
    expect(traced).not.toContain("SECRET-NOTE-uno");
    expect(traced).not.toContain("SECRET-NOTE-dos");
    expect(traced).not.toContain("Resumen accionable");
  });

  it("without notes: empty summary, NO model call, NO ledger row", async () => {
    const factory = vi.fn(async () => () => generatingModel(SUMMARY_TEXT));
    const { trace } = recordingTrace();

    const result = await summarize(
      { db: serviceDb, getProviderClient: factory, getManifestCost: manifestCostFor, trace },
      tenant.workspaceId,
      { clientId },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary).toBe("");
    // No model resolution / call at all.
    expect(factory).not.toHaveBeenCalled();

    const ledger = await serviceDb
      .select()
      .from(s.aiUsageLedger)
      .where(eq(s.aiUsageLedger.workspaceId, tenant.workspaceId));
    expect(ledger.length).toBe(0);
  });

  it("101% budget: budget_exceeded BEFORE any model call", async () => {
    await serviceDb.insert(s.notes).values({
      workspaceId: tenant.workspaceId,
      clientId,
      body: NOTE_A,
    });
    await serviceDb.insert(s.aiUsageLedger).values({
      workspaceId: tenant.workspaceId,
      feature: "summarize",
      provider: "google",
      modelId: "gemini-3.5-flash",
      tokensIn: 0,
      tokensOut: 0,
      costCents: 5100,
      costMicrocents: 5100 * 10000, // F7c: gate sums micro-cents
    });

    const factory = vi.fn(async () => () => generatingModel(SUMMARY_TEXT));
    const { trace } = recordingTrace();

    const result = await summarize(
      { db: serviceDb, getProviderClient: factory, getManifestCost: manifestCostFor, trace },
      tenant.workspaceId,
      { clientId },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("budget_exceeded");
    expect(factory).not.toHaveBeenCalled();
  });
});
