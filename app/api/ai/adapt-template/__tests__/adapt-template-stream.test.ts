import { MockLanguageModelV3 } from "ai/test";
import { simulateReadableStream } from "ai";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  provisionTenant,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";
import type { TracePort, TraceGeneration } from "@/lib/ai/trace";

/**
 * adaptTemplateStreamWith (the pure streaming seam) against the REAL local
 * Supabase stack. The ONLY faked effects are the provider model (an `ai/test`
 * MockLanguageModelV3, injected via the deps.getProviderClient seam — no
 * network) and the Langfuse trace port (a recording fake — no real export).
 *
 * Covers SPEC R-adaptTemplate:
 *   - configured mapping -> stream works + ledger row with REAL cost from the
 *     seeded manifest costs.
 *   - no mapping/default -> clear NO_KEY_CONFIGURED error (no stream).
 *   - provider rejects with a real-shaped 401 -> INVALID_KEY (curated).
 *   - the full template body / client notes appear in NO captured trace data
 *     (PII redaction HARD-STOP).
 *   - 101% budget -> budget_exceeded BEFORE any model call (factory never run).
 *
 * DATABASE_URL must be exported in the shell (vitest has no env loader).
 */
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const TEMPLATE_BODY =
  "# Propuesta\nHola {{nombre}}, esta es nuestra propuesta SECRET-TEMPLATE-BODY para tu proyecto.";
const CLIENT_NOTES =
  "El cliente prefiere reuniones por la mañana. SECRET-CLIENT-NOTES confidencial.";

/** Records every traced arg so the PII assertions can scan all of it. */
function recordingTrace(): {
  trace: TracePort;
  dump: () => string;
} {
  const records: unknown[] = [];
  const generation: TraceGeneration = {
    update: (args) => records.push(args),
    end: () => {},
  };
  const trace: TracePort = {
    startGeneration: (name, model, metadata) => {
      records.push({ name, model, metadata });
      return generation;
    },
    flush: async () => {},
  };
  return { trace, dump: () => JSON.stringify(records) };
}

/**
 * A streaming mock that emits two text deltas then a finish with usage.
 * `capture` (optional) records the full prompt the seam sent to the MODEL so a
 * test can assert the enriched personalization (notes/cases/instructions)
 * reaches the model — these are exactly what must NOT appear in the trace.
 */
function streamingModel(capture?: (input: string) => void): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "mock",
    modelId: "mock-stream",
    doStream: async (options) => {
      capture?.(JSON.stringify(options.prompt));
      return {
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start" as const, warnings: [] },
          { type: "text-start" as const, id: "t1" },
          { type: "text-delta" as const, id: "t1", delta: "Hola " },
          { type: "text-delta" as const, id: "t1", delta: "adaptado." },
          { type: "text-end" as const, id: "t1" },
          {
            type: "finish" as const,
            finishReason: { unified: "stop" as const, raw: "stop" },
            usage: {
              inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
              outputTokens: { total: 50, text: 50, reasoning: undefined },
            },
          },
        ],
      }),
      };
    },
  });
}

/** Drains a StreamTextResult's text stream so onFinish runs to completion. */
async function drain(stream: AsyncIterable<string>): Promise<string> {
  let out = "";
  for await (const chunk of stream) out += chunk;
  return out;
}

describe("adaptTemplateStreamWith", () => {
  let tenant: Tenant;
  let serviceDb: typeof import("@/db/service")["serviceDb"];
  let adapt: typeof import("../adapt-template-stream")["adaptTemplateStreamWith"];
  let manifestCostFor: typeof import("@/lib/ai/manifest-cost")["manifestCostFor"];
  let computeCostMicrocents: typeof import("@/lib/ai/compute-cost-microcents")["computeCostMicrocents"];
  let microcentsToCents: typeof import("@/lib/ai/compute-cost-microcents")["microcentsToCents"];
  let s: typeof import("@/db/schema");
  let templateId: string;
  let clientId: string;

  beforeAll(async () => {
    ({ serviceDb } = await import("@/db/service"));
    ({ adaptTemplateStreamWith: adapt } = await import(
      "../adapt-template-stream"
    ));
    ({ manifestCostFor } = await import("@/lib/ai/manifest-cost"));
    ({ computeCostMicrocents, microcentsToCents } = await import(
      "@/lib/ai/compute-cost-microcents"
    ));
    s = await import("@/db/schema");

    tenant = await provisionTenant("adapt-template");

    const [tpl] = await serviceDb
      .insert(s.templates)
      .values({
        workspaceId: tenant.workspaceId,
        name: "Propuesta",
        bodyMarkdown: TEMPLATE_BODY,
      })
      .returning({ id: s.templates.id });
    templateId = tpl.id;

    const [cli] = await serviceDb
      .insert(s.clients)
      .values({
        workspaceId: tenant.workspaceId,
        name: "Acme Corp",
        notesSummary: CLIENT_NOTES,
      })
      .returning({ id: s.clients.id });
    clientId = cli.id;

    // Active case (must reach the model prompt) + closed case (must NOT).
    await serviceDb.insert(s.cases).values([
      {
        workspaceId: tenant.workspaceId,
        clientId,
        title: "SECRET-ACTIVE-CASE migración CRM",
        status: "active",
      },
      {
        workspaceId: tenant.workspaceId,
        clientId,
        title: "SECRET-CLOSED-CASE proyecto viejo",
        status: "closed_won",
      },
    ]);
  });

  afterAll(async () => {
    await teardownTenants(tenant);
  });

  afterEach(async () => {
    // Clear ledger + persisted adaptations + any feature mapping between cases.
    await serviceDb
      .delete(s.templateAdaptations)
      .where(eq(s.templateAdaptations.workspaceId, tenant.workspaceId));
    await serviceDb
      .delete(s.aiUsageLedger)
      .where(eq(s.aiUsageLedger.workspaceId, tenant.workspaceId));
    await serviceDb
      .delete(s.aiFeatureModelMapping)
      .where(eq(s.aiFeatureModelMapping.workspaceId, tenant.workspaceId));
    // Reset the workspace budget to the default.
    await serviceDb
      .update(s.workspaces)
      .set({ aiMonthlyBudgetCents: 5000 })
      .where(eq(s.workspaces.id, tenant.workspaceId));
  });

  it("configured default: streams + inserts ledger row with real cost; trace omits PII", async () => {
    let modelInput = "";
    const model = streamingModel((input) => {
      modelInput = input;
    });
    const factory = vi.fn(async () => () => model);
    const { trace, dump } = recordingTrace();

    const result = await adapt(
      {
        db: serviceDb,
        getProviderClient: factory,
        getManifestCost: manifestCostFor,
        trace,
      },
      tenant.workspaceId,
      { templateId, clientId, extraInstructions: "SECRET-EXTRA-INSTRUCTION usa un tono cercano" },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const text = await drain(result.stream.textStream);
    expect(text).toBe("Hola adaptado.");

    // ENRICHED PROMPT: notes_summary + the ACTIVE case + extra instructions all
    // reach the MODEL. The closed case does NOT.
    expect(modelInput).toContain("SECRET-CLIENT-NOTES");
    expect(modelInput).toContain("SECRET-ACTIVE-CASE");
    expect(modelInput).toContain("SECRET-EXTRA-INSTRUCTION");
    expect(modelInput).not.toContain("SECRET-CLOSED-CASE");

    // AUTOMATIC PERSIST: the completed adaptation is stored linked to
    // (workspace, template, client) with the full result + provenance.
    const adaptations = await serviceDb
      .select()
      .from(s.templateAdaptations)
      .where(eq(s.templateAdaptations.workspaceId, tenant.workspaceId));
    expect(adaptations).toHaveLength(1);
    expect(adaptations[0].templateId).toBe(templateId);
    expect(adaptations[0].clientId).toBe(clientId);
    expect(adaptations[0].resultText).toBe("Hola adaptado.");
    expect(adaptations[0].extraInstructions).toBe(
      "SECRET-EXTRA-INSTRUCTION usa un tono cercano",
    );
    expect(adaptations[0].provider).toBe("google");
    expect(adaptations[0].modelId).toBeTruthy();

    // Resolved via the manifest default (gemini-3.5-flash, ADR-007).
    expect(factory).toHaveBeenCalledWith(tenant.workspaceId, "google");

    // Ledger row with REAL usage + cost computed from the seeded manifest.
    const ledger = await serviceDb
      .select()
      .from(s.aiUsageLedger)
      .where(eq(s.aiUsageLedger.workspaceId, tenant.workspaceId));
    expect(ledger.length).toBe(1);
    expect(ledger[0].feature).toBe("adapt_template");
    expect(ledger[0].provider).toBe("google");
    expect(ledger[0].tokensIn).toBe(100);
    expect(ledger[0].tokensOut).toBe(50);

    const cost = await manifestCostFor(serviceDb, "google", ledger[0].modelId);
    // F7c: authoritative micro-cents (no per-call ceil) + dual-written cents.
    const expectedMicrocents = computeCostMicrocents(
      100,
      50,
      cost?.costPer1kInput ?? 0,
      cost?.costPer1kOutput ?? 0,
    );
    expect(ledger[0].costMicrocents).toBe(expectedMicrocents);
    expect(ledger[0].costCents).toBe(microcentsToCents(expectedMicrocents));

    // HARD-STOP: no template body, no client notes, no cases text, no extra
    // instructions, no generated text in trace — ONLY lengths/counts/ids.
    const traced = dump();
    expect(traced).not.toContain("SECRET-TEMPLATE-BODY");
    expect(traced).not.toContain("SECRET-CLIENT-NOTES");
    expect(traced).not.toContain("SECRET-ACTIVE-CASE");
    expect(traced).not.toContain("SECRET-CLOSED-CASE");
    expect(traced).not.toContain("SECRET-EXTRA-INSTRUCTION");
    expect(traced).not.toContain("adaptado.");
    // Metadata-only fields ARE present (lengths + counts).
    expect(traced).toContain("templateLength");
    expect(traced).toContain("notesSummaryLength");
    expect(traced).toContain("activeCasesCount");
    expect(traced).toContain("extraInstructionsLength");
    expect(traced).toContain("adapt_template");
  });

  it("extra_instructions over the max length: validation_error, no model call, no persist", async () => {
    const factory = vi.fn(async () => () => streamingModel());
    const { trace } = recordingTrace();

    const result = await adapt(
      {
        db: serviceDb,
        getProviderClient: factory,
        getManifestCost: manifestCostFor,
        trace,
      },
      tenant.workspaceId,
      { templateId, clientId, extraInstructions: "x".repeat(2001) },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("validation_error");
    expect(factory).not.toHaveBeenCalled();

    const adaptations = await serviceDb
      .select()
      .from(s.templateAdaptations)
      .where(eq(s.templateAdaptations.workspaceId, tenant.workspaceId));
    expect(adaptations).toHaveLength(0);
  });

  it("no provider key configured: returns NO_KEY_CONFIGURED, no stream, no ledger", async () => {
    // The manifest default (gemini-3.5-flash, ADR-007) always resolves the
    // MODEL, so the "no key" condition for this slice is a workspace that has
    // never saved a Google key: getProviderClient throws
    // ProviderNotConfiguredError, which the seam maps to NO_KEY_CONFIGURED.
    const err = Object.assign(new Error("No key configured for google"), {
      name: "ProviderNotConfiguredError",
    });
    const factory = vi.fn(async () => {
      throw err;
    });
    const { trace } = recordingTrace();

    const result = await adapt(
      {
        db: serviceDb,
        getProviderClient: factory,
        getManifestCost: manifestCostFor,
        trace,
      },
      tenant.workspaceId,
      { templateId, clientId },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("NO_KEY_CONFIGURED");

    const ledger = await serviceDb
      .select()
      .from(s.aiUsageLedger)
      .where(eq(s.aiUsageLedger.workspaceId, tenant.workspaceId));
    expect(ledger.length).toBe(0);
  });

  it("revoked/invalid provider key (real-shaped 401): returns INVALID_KEY", async () => {
    // Mirror OpenAI's real 401 payload shape on the provider factory.
    const real401 = Object.assign(new Error("Incorrect API key provided"), {
      name: "AI_APICallError",
      statusCode: 401,
      data: { error: { type: "invalid_request_error", code: "invalid_api_key" } },
    });
    const factory = vi.fn(async () => {
      throw real401;
    });
    const { trace } = recordingTrace();

    const result = await adapt(
      {
        db: serviceDb,
        getProviderClient: factory,
        getManifestCost: manifestCostFor,
        trace,
      },
      tenant.workspaceId,
      { templateId, clientId },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("INVALID_KEY");
  });

  it("101% budget: budget_exceeded BEFORE any model call (factory never invoked)", async () => {
    // Push the ledger over the budget for the current UTC month.
    await serviceDb.insert(s.aiUsageLedger).values({
      workspaceId: tenant.workspaceId,
      feature: "adapt_template",
      provider: "google",
      modelId: "gemini-3.5-flash",
      tokensIn: 0,
      tokensOut: 0,
      costCents: 5100, // > 5000 default budget
      costMicrocents: 5100 * 10000, // F7c: gate sums micro-cents
    });

    const factory = vi.fn(async () => () => streamingModel());
    const { trace } = recordingTrace();

    const result = await adapt(
      {
        db: serviceDb,
        getProviderClient: factory,
        getManifestCost: manifestCostFor,
        trace,
      },
      tenant.workspaceId,
      { templateId, clientId },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("budget_exceeded");
    // The model factory was NEVER reached.
    expect(factory).not.toHaveBeenCalled();
  });

  it("not found: cross-workspace template id resolves to no row", async () => {
    const factory = vi.fn(async () => () => streamingModel());
    const { trace } = recordingTrace();

    const result = await adapt(
      {
        db: serviceDb,
        getProviderClient: factory,
        getManifestCost: manifestCostFor,
        trace,
      },
      tenant.workspaceId,
      { templateId: "11111111-1111-4111-8111-111111111111", clientId },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("not_found");
    expect(factory).not.toHaveBeenCalled();
  });
});
