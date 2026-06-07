import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  provisionTenant,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";

/**
 * Adaptations read/delete seam (listAdaptations / deleteAdaptationWith) against
 * the REAL local Supabase stack. The rows are normally WRITTEN by the streaming
 * adaptTemplate onFinish; here we seed them via serviceDb to exercise the read
 * + delete seams directly.
 *
 * Covers SPEC R-adaptations-history:
 *   - list returns a (template, client) pair's adaptations NEWEST-FIRST.
 *   - delete removes ONLY the caller's own row (cross-workspace id → not_found,
 *     the other tenant's row survives).
 *
 * DATABASE_URL must be exported in the shell (vitest has no env loader).
 */
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

describe("adaptations CRUD seam", () => {
  let tenantA: Tenant;
  let tenantB: Tenant;
  let serviceDb: typeof import("@/db/service")["serviceDb"];
  let crud: typeof import("../adaptations-crud");
  let s: typeof import("@/db/schema");
  let aTemplateId: string;
  let aClientId: string;
  let bTemplateId: string;
  let bClientId: string;

  async function seedFixtures(tenant: Tenant) {
    const [tpl] = await serviceDb
      .insert(s.templates)
      .values({
        workspaceId: tenant.workspaceId,
        name: "Propuesta",
        bodyMarkdown: "# Hola",
      })
      .returning({ id: s.templates.id });
    const [cli] = await serviceDb
      .insert(s.clients)
      .values({ workspaceId: tenant.workspaceId, name: "Acme" })
      .returning({ id: s.clients.id });
    return { templateId: tpl.id, clientId: cli.id };
  }

  beforeAll(async () => {
    ({ serviceDb } = await import("@/db/service"));
    crud = await import("../adaptations-crud");
    s = await import("@/db/schema");

    tenantA = await provisionTenant("adapt-crud-a");
    tenantB = await provisionTenant("adapt-crud-b");

    ({ templateId: aTemplateId, clientId: aClientId } =
      await seedFixtures(tenantA));
    ({ templateId: bTemplateId, clientId: bClientId } =
      await seedFixtures(tenantB));
  });

  afterAll(async () => {
    await teardownTenants(tenantA, tenantB);
  });

  afterEach(async () => {
    await serviceDb
      .delete(s.templateAdaptations)
      .where(eq(s.templateAdaptations.workspaceId, tenantA.workspaceId));
    await serviceDb
      .delete(s.templateAdaptations)
      .where(eq(s.templateAdaptations.workspaceId, tenantB.workspaceId));
  });

  it("lists a (template, client) pair's adaptations newest-first", async () => {
    // Insert two rows with explicit, ordered created_at so the sort is provable.
    await serviceDb.insert(s.templateAdaptations).values({
      workspaceId: tenantA.workspaceId,
      templateId: aTemplateId,
      clientId: aClientId,
      resultText: "older",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    await serviceDb.insert(s.templateAdaptations).values({
      workspaceId: tenantA.workspaceId,
      templateId: aTemplateId,
      clientId: aClientId,
      resultText: "newer",
      extraInstructions: "tono cercano",
      provider: "google",
      modelId: "gemini-3.5-flash",
      createdAt: new Date("2026-02-01T00:00:00Z"),
    });

    const rows = await crud.listAdaptations(
      { db: serviceDb },
      tenantA.workspaceId,
      { templateId: aTemplateId, clientId: aClientId },
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].resultText).toBe("newer");
    expect(rows[0].extraInstructions).toBe("tono cercano");
    expect(rows[0].provider).toBe("google");
    expect(rows[1].resultText).toBe("older");
  });

  it("list surfaces the beautified_* fields when an email was generated", async () => {
    await serviceDb.insert(s.templateAdaptations).values({
      workspaceId: tenantA.workspaceId,
      templateId: aTemplateId,
      clientId: aClientId,
      resultText: "adapted body",
      beautifiedHtml: "<html><body><p>Hola</p></body></html>",
      emailSubject: "Asunto generado",
      emailPreheader: "Preview corto",
      beautifiedPalette: "oceano",
      beautifiedAt: new Date("2026-03-01T00:00:00Z"),
    });

    const [row] = await crud.listAdaptations(
      { db: serviceDb },
      tenantA.workspaceId,
      { templateId: aTemplateId, clientId: aClientId },
    );

    expect(row.beautifiedHtml).toContain("<p>Hola</p>");
    expect(row.emailSubject).toBe("Asunto generado");
    expect(row.emailPreheader).toBe("Preview corto");
    expect(row.beautifiedPalette).toBe("oceano");
  });

  it("list returns null beautified_* fields for a not-yet-beautified row", async () => {
    await serviceDb.insert(s.templateAdaptations).values({
      workspaceId: tenantA.workspaceId,
      templateId: aTemplateId,
      clientId: aClientId,
      resultText: "plain adaptation",
    });

    const [row] = await crud.listAdaptations(
      { db: serviceDb },
      tenantA.workspaceId,
      { templateId: aTemplateId, clientId: aClientId },
    );

    expect(row.beautifiedHtml).toBeNull();
    expect(row.emailSubject).toBeNull();
    expect(row.emailPreheader).toBeNull();
    expect(row.beautifiedPalette).toBeNull();
  });

  it("list does not return another (template, client) pair's rows", async () => {
    await serviceDb.insert(s.templateAdaptations).values({
      workspaceId: tenantA.workspaceId,
      templateId: aTemplateId,
      clientId: aClientId,
      resultText: "for this pair",
    });
    // Same workspace, different client → must not appear for aClientId list when
    // queried with a different clientId.
    const rows = await crud.listAdaptations(
      { db: serviceDb },
      tenantA.workspaceId,
      {
        templateId: aTemplateId,
        clientId: "11111111-1111-4111-8111-111111111111",
      },
    );
    expect(rows).toHaveLength(0);
  });

  it("delete removes only the caller's own row", async () => {
    const [row] = await serviceDb
      .insert(s.templateAdaptations)
      .values({
        workspaceId: tenantA.workspaceId,
        templateId: aTemplateId,
        clientId: aClientId,
        resultText: "to delete",
      })
      .returning({ id: s.templateAdaptations.id });

    const result = await crud.deleteAdaptationWith(
      { db: serviceDb },
      tenantA.workspaceId,
      { id: row.id },
    );
    expect(result.ok).toBe(true);

    const remaining = await serviceDb
      .select({ id: s.templateAdaptations.id })
      .from(s.templateAdaptations)
      .where(eq(s.templateAdaptations.id, row.id));
    expect(remaining).toHaveLength(0);
  });

  it("delete of another workspace's adaptation is refused (row survives)", async () => {
    const [bRow] = await serviceDb
      .insert(s.templateAdaptations)
      .values({
        workspaceId: tenantB.workspaceId,
        templateId: bTemplateId,
        clientId: bClientId,
        resultText: "B owns this",
      })
      .returning({ id: s.templateAdaptations.id });

    // A attempts to delete B's row → explicit workspaceId gate → not_found.
    const result = await crud.deleteAdaptationWith(
      { db: serviceDb },
      tenantA.workspaceId,
      { id: bRow.id },
    );
    expect(result.ok).toBe(false);

    // B's row still exists.
    const still = await serviceDb
      .select({ id: s.templateAdaptations.id })
      .from(s.templateAdaptations)
      .where(eq(s.templateAdaptations.id, bRow.id));
    expect(still).toHaveLength(1);
  });

  it("delete with an invalid id returns not_found, writes nothing", async () => {
    const result = await crud.deleteAdaptationWith(
      { db: serviceDb },
      tenantA.workspaceId,
      { id: "not-a-uuid" },
    );
    expect(result.ok).toBe(false);
  });
});
