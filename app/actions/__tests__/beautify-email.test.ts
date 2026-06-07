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
 * beautifyEmailWith (the pure beautify_email seam) against the REAL local
 * Supabase stack. The provider model is an `ai/test` MockLanguageModelV3
 * injected via getProviderClient (no network) whose doGenerate returns a
 * JSON object so generateObject parses { subject, preheader, html }. The
 * Langfuse trace port is a recording fake.
 *
 * Covers decision #777 + plan-beautify #778:
 *   - happy path: generateObject parses -> beautified_* columns persisted +
 *     ledger row feature='beautify_email' with cost_microcents + trace metadata.
 *   - SANITIZE before persist: a <script> in the model HTML is NOT in the stored html.
 *   - HARD-STOP: the trace carries NO html/subject/preheader text (lengths only).
 *   - 101% budget -> budget_exceeded BEFORE any model call.
 *   - cross-workspace adaptationId -> not_found.
 *
 * DATABASE_URL must be exported in the shell.
 */
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SOURCE_TEXT = "Hola Acme, gracias por confiar en nosotros este mes.";
const GEN_SUBJECT = "SUBJECT-SECRETO: novedades del mes";
const GEN_PREHEADER = "PREHEADER-SECRETO: lo último para ti";
const GEN_HTML =
  '<!DOCTYPE html><html><head><meta name="color-scheme" content="light dark"></head>' +
  '<body><span style="display:none;mso-hide:all">PREHEADER-SECRETO</span>' +
  '<table role="presentation" width="600"><tr><td style="padding:16px;color:#1c1917">' +
  "BODY-SECRETO Hola Acme" +
  '<script>steal()</script>' +
  '<a href="https://tendr.test" style="background-color:#2563eb;color:#ffffff;padding:12px">CTA</a>' +
  "</td></tr></table></body></html>";

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

/** A mock model whose doGenerate returns a JSON object generateObject can parse. */
function objectModel(obj: unknown): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "mock",
    modelId: "mock-gen-object",
    doGenerate: async () => ({
      content: [{ type: "text" as const, text: JSON.stringify(obj) }],
      finishReason: { unified: "stop" as const, raw: "stop" },
      usage: {
        inputTokens: { total: 120, noCache: 120, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 300, text: 300, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}

describe("beautifyEmailWith", () => {
  let tenantA: Tenant;
  let tenantB: Tenant;
  let serviceDb: typeof import("@/db/service")["serviceDb"];
  let beautify: typeof import("../beautify-email")["beautifyEmailWith"];
  let manifestCostFor: typeof import("@/lib/ai/manifest-cost")["manifestCostFor"];
  let s: typeof import("@/db/schema");
  let adaptationId: string;
  let foreignAdaptationId: string;

  async function seedAdaptation(tenant: Tenant): Promise<string> {
    const [tpl] = await serviceDb
      .insert(s.templates)
      .values({
        workspaceId: tenant.workspaceId,
        name: "Plantilla",
        bodyMarkdown: "Hola {{nombre}}",
      })
      .returning({ id: s.templates.id });
    const [cli] = await serviceDb
      .insert(s.clients)
      .values({ workspaceId: tenant.workspaceId, name: "Acme" })
      .returning({ id: s.clients.id });
    const [adapt] = await serviceDb
      .insert(s.templateAdaptations)
      .values({
        workspaceId: tenant.workspaceId,
        templateId: tpl.id,
        clientId: cli.id,
        resultText: SOURCE_TEXT,
      })
      .returning({ id: s.templateAdaptations.id });
    return adapt.id;
  }

  beforeAll(async () => {
    ({ serviceDb } = await import("@/db/service"));
    ({ beautifyEmailWith: beautify } = await import("../beautify-email"));
    ({ manifestCostFor } = await import("@/lib/ai/manifest-cost"));
    s = await import("@/db/schema");

    tenantA = await provisionTenant("beautify-a");
    tenantB = await provisionTenant("beautify-b");
    adaptationId = await seedAdaptation(tenantA);
    foreignAdaptationId = await seedAdaptation(tenantB);
  });

  afterAll(async () => {
    await teardownTenants(tenantA, tenantB);
  });

  afterEach(async () => {
    await serviceDb
      .delete(s.aiUsageLedger)
      .where(eq(s.aiUsageLedger.workspaceId, tenantA.workspaceId));
    await serviceDb
      .update(s.templateAdaptations)
      .set({
        beautifiedHtml: null,
        emailSubject: null,
        emailPreheader: null,
        beautifiedPalette: null,
        beautifiedAt: null,
      })
      .where(eq(s.templateAdaptations.workspaceId, tenantA.workspaceId));
    await serviceDb
      .update(s.workspaces)
      .set({ aiMonthlyBudgetCents: 5000 })
      .where(eq(s.workspaces.id, tenantA.workspaceId));
  });

  it("happy path: parses object, sanitizes + persists beautified columns, writes ledger; trace omits text", async () => {
    const model = objectModel({
      subject: GEN_SUBJECT,
      preheader: GEN_PREHEADER,
      html: GEN_HTML,
    });
    const factory = vi.fn(async () => () => model);
    const { trace, dump } = recordingTrace();

    const result = await beautify(
      { db: serviceDb, getProviderClient: factory, getManifestCost: manifestCostFor, trace },
      tenantA.workspaceId,
      { adaptationId, paletteId: "niebla" },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.subject).toBe(GEN_SUBJECT);
    expect(result.preheader).toBe(GEN_PREHEADER);
    expect(result.paletteId).toBe("niebla");

    // SANITIZE before persist: <script> stripped from the returned + stored html.
    expect(result.html).not.toContain("<script");
    expect(result.html).not.toContain("steal()");
    expect(result.html).toContain("https://tendr.test");

    const [row] = await serviceDb
      .select({
        html: s.templateAdaptations.beautifiedHtml,
        subject: s.templateAdaptations.emailSubject,
        preheader: s.templateAdaptations.emailPreheader,
        palette: s.templateAdaptations.beautifiedPalette,
        at: s.templateAdaptations.beautifiedAt,
      })
      .from(s.templateAdaptations)
      .where(eq(s.templateAdaptations.id, adaptationId));
    expect(row.html).not.toContain("<script");
    expect(row.subject).toBe(GEN_SUBJECT);
    expect(row.preheader).toBe(GEN_PREHEADER);
    expect(row.palette).toBe("niebla");
    expect(row.at).not.toBeNull();

    const ledger = await serviceDb
      .select()
      .from(s.aiUsageLedger)
      .where(eq(s.aiUsageLedger.workspaceId, tenantA.workspaceId));
    expect(ledger.length).toBe(1);
    expect(ledger[0].feature).toBe("beautify_email");
    expect(ledger[0].tokensIn).toBe(120);
    expect(ledger[0].tokensOut).toBe(300);
    // cost_microcents computed from gemini-3.5-flash per-1k cost (default model).
    expect(ledger[0].costMicrocents).toBeGreaterThan(0);

    const traced = dump();
    expect(traced).toContain("beautify_email"); // metadata.feature
    expect(traced).toContain("paletteId");
    expect(traced).toContain("htmlLength");
    // HARD-STOP: no subject/preheader/body text in the trace.
    expect(traced).not.toContain("SUBJECT-SECRETO");
    expect(traced).not.toContain("PREHEADER-SECRETO");
    expect(traced).not.toContain("BODY-SECRETO");
  });

  it("101% budget: budget_exceeded BEFORE any model call", async () => {
    await serviceDb.insert(s.aiUsageLedger).values({
      workspaceId: tenantA.workspaceId,
      feature: "beautify_email",
      provider: "google",
      modelId: "gemini-3.5-flash",
      tokensIn: 0,
      tokensOut: 0,
      costCents: 5100,
      costMicrocents: 5100 * 10000,
    });

    const factory = vi.fn(async () => () => objectModel({}));
    const { trace } = recordingTrace();

    const result = await beautify(
      { db: serviceDb, getProviderClient: factory, getManifestCost: manifestCostFor, trace },
      tenantA.workspaceId,
      { adaptationId, paletteId: "niebla" },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("budget_exceeded");
    expect(factory).not.toHaveBeenCalled();
  });

  it("cross-workspace adaptationId: not_found, NO model call", async () => {
    const factory = vi.fn(async () => () => objectModel({}));
    const { trace } = recordingTrace();

    const result = await beautify(
      { db: serviceDb, getProviderClient: factory, getManifestCost: manifestCostFor, trace },
      tenantA.workspaceId,
      { adaptationId: foreignAdaptationId, paletteId: "niebla" },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("not_found");
    expect(factory).not.toHaveBeenCalled();
  });

  it("invalid palette: validation_error, NO model call", async () => {
    const factory = vi.fn(async () => () => objectModel({}));
    const { trace } = recordingTrace();

    const result = await beautify(
      { db: serviceDb, getProviderClient: factory, getManifestCost: manifestCostFor, trace },
      tenantA.workspaceId,
      { adaptationId, paletteId: "not-a-palette" },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("validation_error");
    expect(factory).not.toHaveBeenCalled();
  });
});
