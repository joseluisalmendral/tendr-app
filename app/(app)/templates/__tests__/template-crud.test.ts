import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  provisionTenant,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";

/**
 * Template CRUD seam (createTemplateWith / updateTemplateWith /
 * deleteTemplateWith / listTemplates) against the REAL local Supabase stack.
 *
 * Covers SPEC R-/templates editor UI CRUD:
 *   - create persists a workspace-scoped row; list returns it.
 *   - update mutates name/body/variables in place (single row).
 *   - delete removes the row.
 *   - CROSS-TENANT ISOLATION: tenant B cannot read/update/delete tenant A's
 *     template (explicit workspaceId gate → not_found, row untouched).
 *   - invalid input is rejected with field errors and writes nothing.
 *
 * DATABASE_URL must be exported in the shell (vitest has no env loader).
 */
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

describe("template CRUD seam", () => {
  let tenantA: Tenant;
  let tenantB: Tenant;
  let serviceDb: typeof import("@/db/service")["serviceDb"];
  let crud: typeof import("../template-crud");
  let s: typeof import("@/db/schema");

  beforeAll(async () => {
    ({ serviceDb } = await import("@/db/service"));
    crud = await import("../template-crud");
    s = await import("@/db/schema");

    tenantA = await provisionTenant("tmpl-a");
    tenantB = await provisionTenant("tmpl-b");
  });

  afterAll(async () => {
    await teardownTenants(tenantA, tenantB);
  });

  afterEach(async () => {
    await serviceDb
      .delete(s.templates)
      .where(eq(s.templates.workspaceId, tenantA.workspaceId));
    await serviceDb
      .delete(s.templates)
      .where(eq(s.templates.workspaceId, tenantB.workspaceId));
  });

  it("create persists a workspace-scoped row; list returns it", async () => {
    const result = await crud.createTemplateWith(
      { db: serviceDb },
      tenantA.workspaceId,
      {
        name: "Propuesta",
        bodyMarkdown: "# Hola {{cliente}}",
        variables: ["cliente"],
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.name).toBe("Propuesta");
    expect(result.template.variables).toEqual(["cliente"]);

    const rows = await serviceDb
      .select()
      .from(s.templates)
      .where(eq(s.templates.workspaceId, tenantA.workspaceId));
    expect(rows.length).toBe(1);
    expect(rows[0].workspaceId).toBe(tenantA.workspaceId);

    const listed = await crud.listTemplates(
      { db: serviceDb },
      tenantA.workspaceId,
    );
    expect(listed.length).toBe(1);
    expect(listed[0].id).toBe(result.template.id);
  });

  it("update mutates name/body/variables in place (single row)", async () => {
    const created = await crud.createTemplateWith(
      { db: serviceDb },
      tenantA.workspaceId,
      { name: "Original", bodyMarkdown: "v1", variables: [] },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await crud.updateTemplateWith(
      { db: serviceDb },
      tenantA.workspaceId,
      {
        id: created.template.id,
        name: "Editada",
        bodyMarkdown: "v2 **bold**",
        variables: ["a", "b"],
      },
    );
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.template.name).toBe("Editada");
    expect(updated.template.bodyMarkdown).toBe("v2 **bold**");
    expect(updated.template.variables).toEqual(["a", "b"]);

    const rows = await serviceDb
      .select()
      .from(s.templates)
      .where(eq(s.templates.workspaceId, tenantA.workspaceId));
    expect(rows.length).toBe(1);
  });

  it("delete removes the row", async () => {
    const created = await crud.createTemplateWith(
      { db: serviceDb },
      tenantA.workspaceId,
      { name: "Temp", bodyMarkdown: "body", variables: [] },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const del = await crud.deleteTemplateWith(
      { db: serviceDb },
      tenantA.workspaceId,
      { id: created.template.id },
    );
    expect(del.ok).toBe(true);

    const rows = await serviceDb
      .select()
      .from(s.templates)
      .where(eq(s.templates.workspaceId, tenantA.workspaceId));
    expect(rows.length).toBe(0);
  });

  it("cross-tenant: B cannot update or delete A's template (not_found, row intact)", async () => {
    const created = await crud.createTemplateWith(
      { db: serviceDb },
      tenantA.workspaceId,
      { name: "Solo-A", bodyMarkdown: "secreto-A", variables: [] },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const templateId = created.template.id;

    // B's list does NOT include A's template.
    const bList = await crud.listTemplates(
      { db: serviceDb },
      tenantB.workspaceId,
    );
    expect(bList.find((t) => t.id === templateId)).toBeUndefined();

    // B updating A's template id (scoped to B's workspace) → not_found.
    const bUpdate = await crud.updateTemplateWith(
      { db: serviceDb },
      tenantB.workspaceId,
      { id: templateId, name: "hijacked", bodyMarkdown: "x", variables: [] },
    );
    expect(bUpdate.ok).toBe(false);

    // B deleting A's template id (scoped to B's workspace) → not_found.
    const bDelete = await crud.deleteTemplateWith(
      { db: serviceDb },
      tenantB.workspaceId,
      { id: templateId },
    );
    expect(bDelete.ok).toBe(false);

    // A's row is untouched.
    const [row] = await serviceDb
      .select()
      .from(s.templates)
      .where(eq(s.templates.id, templateId));
    expect(row).toBeDefined();
    expect(row.name).toBe("Solo-A");
    expect(row.bodyMarkdown).toBe("secreto-A");
  });

  it("invalid input: empty name rejected with field error, writes nothing", async () => {
    const result = await crud.createTemplateWith(
      { db: serviceDb },
      tenantA.workspaceId,
      { name: "   ", bodyMarkdown: "body", variables: [] },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.name).toBeTruthy();

    const rows = await serviceDb
      .select()
      .from(s.templates)
      .where(eq(s.templates.workspaceId, tenantA.workspaceId));
    expect(rows.length).toBe(0);
  });

  it("invalid input: empty body rejected with field error", async () => {
    const result = await crud.createTemplateWith(
      { db: serviceDb },
      tenantA.workspaceId,
      { name: "Has name", bodyMarkdown: "", variables: [] },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.bodyMarkdown).toBeTruthy();
  });
});
