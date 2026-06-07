import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  provisionTenant,
  seedClientRow,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";

import { canDeleteDocument } from "../delete-document";

/**
 * deleteDocumentWith (the pure delete seam) exercised against the REAL local
 * Supabase stack: Storage via the tenant's user-session client + a real Drizzle
 * client for the workspace-scoped reads/delete. Fakes are injected ONLY for the
 * partial-failure cases (storage.remove fail / db.delete fail).
 *
 * Covers SPEC R-DELETE (Guarded Document Delete):
 *   - happy terminal job -> object 404, documents row gone, jobs row KEPT (ADR-1)
 *   - terminal guard (pending) -> {ok:false}, object+row untouched, NO remove
 *   - storage.remove fails -> {ok:false}, row preserved, DB delete NOT attempted
 *   - db.delete fails after remove -> {ok:false}, object gone but row remains,
 *     re-delete is idempotent (storage.remove on a missing path is non-fatal)
 *   - cross-workspace id -> resolve no row (workspace scope + RLS) -> {ok:false}
 *
 * The Drizzle client connects via DATABASE_URL (local string); the module reads
 * env at load time, so we set it before importing the seam.
 */
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const BUCKET = "documents";

type FakeInngest = {
  sent: unknown[];
  send: (event: {
    name: "documents/extract";
    id?: string;
    data: { jobId: string; documentId: string; workspaceId: string };
  }) => Promise<unknown>;
};

function makeFakeInngest(): FakeInngest {
  const sent: unknown[] = [];
  return {
    sent,
    async send(event) {
      sent.push(event);
      return { ids: [event.id ?? "evt"] };
    },
  };
}

/**
 * Seeds a real document (Storage object + documents row + a pending job) via
 * the upload seam, then forces the job to a terminal status by inserting a
 * fresh, newer job row (jobs UPDATE is service_role-only, so the "latest job"
 * rule decides — we add a newer terminal job rather than mutating the old one).
 */
async function seedDocument(
  tenant: Tenant,
  clientId: string,
  db: typeof import("@/db")["db"],
  upload: typeof import("../upload-document")["uploadDocumentWith"],
  filename: string,
): Promise<{ documentId: string; storagePath: string; pendingJobId: string }> {
  const inngest = makeFakeInngest();
  const result = await upload(
    {
      supabase: tenant.client,
      db,
      inngest,
      markJobFailed: async () => undefined,
    },
    {
      workspaceId: tenant.workspaceId,
      clientId,
      filename,
      mimeType: "application/pdf",
      size: 1024,
      body: new ArrayBuffer(1024),
    },
  );
  if (!result.ok) throw new Error("seed upload failed");
  return {
    documentId: result.documentId,
    storagePath: `${tenant.workspaceId}/${clientId}/${result.documentId}.pdf`,
    pendingJobId: result.jobId,
  };
}

/** Inserts a newer job row for a document with the given terminal status. */
async function seedTerminalJob(
  tenant: Tenant,
  documentId: string,
  status: "completed" | "failed",
): Promise<void> {
  const { error } = await tenant.client.from("jobs").insert({
    workspace_id: tenant.workspaceId,
    type: "extract_document",
    status,
    payload: { documentId, workspaceId: tenant.workspaceId },
  });
  if (error) throw new Error(`seed terminal job failed: ${error.message}`);
}

describe("canDeleteDocument — terminal guard (pure)", () => {
  it("blocks pending and running", () => {
    expect(canDeleteDocument("pending")).toBe(false);
    expect(canDeleteDocument("running")).toBe(false);
  });

  it("allows completed, failed, and no-job (null)", () => {
    expect(canDeleteDocument("completed")).toBe(true);
    expect(canDeleteDocument("failed")).toBe(true);
    expect(canDeleteDocument(null)).toBe(true);
  });
});

describe("deleteDocumentWith", () => {
  let tenantA: Tenant;
  let tenantB: Tenant;
  let clientA: string;
  let db: typeof import("@/db")["db"];
  let del: typeof import("../delete-document")["deleteDocumentWith"];
  let upload: typeof import("../upload-document")["uploadDocumentWith"];

  beforeAll(async () => {
    ({ db } = await import("@/db"));
    ({ deleteDocumentWith: del } = await import("../delete-document"));
    ({ uploadDocumentWith: upload } = await import("../upload-document"));

    tenantA = await provisionTenant("delete-a");
    tenantB = await provisionTenant("delete-b");
    clientA = await seedClientRow(tenantA, "Cliente Delete A");
  });

  afterAll(async () => {
    await teardownTenants(tenantA, tenantB);
  });

  it("happy path: object removed, documents row gone, jobs rows KEPT (ADR-1)", async () => {
    const { documentId, storagePath, pendingJobId } = await seedDocument(
      tenantA,
      clientA,
      db,
      upload,
      "delete-happy.pdf",
    );
    // A newer terminal job makes the latest status terminal.
    await seedTerminalJob(tenantA, documentId, "completed");

    const result = await del(
      { supabase: tenantA.client, db },
      { workspaceId: tenantA.workspaceId, documentId },
    );

    expect(result.ok).toBe(true);

    // Storage object is gone.
    const { data: dl } = await tenantA.client.storage
      .from(BUCKET)
      .download(storagePath);
    expect(dl).toBeNull();

    // documents row is gone.
    const { data: doc } = await tenantA.client
      .from("documents")
      .select("id")
      .eq("id", documentId)
      .maybeSingle();
    expect(doc).toBeNull();

    // jobs rows are KEPT — both the original pending job and the terminal one.
    const { data: keptJobs } = await tenantA.client
      .from("jobs")
      .select("id")
      .eq("id", pendingJobId);
    expect(keptJobs?.length).toBe(1);

    const { data: allJobs } = await tenantA.client
      .from("jobs")
      .select("id, payload");
    const linked = (allJobs ?? []).filter(
      (j) =>
        (j.payload as { documentId?: string } | null)?.documentId ===
        documentId,
    );
    // Both the pending and the terminal jobs survive the document delete.
    expect(linked.length).toBe(2);
  });

  it("terminal guard: pending latest job blocks delete, nothing touched", async () => {
    const { documentId, storagePath } = await seedDocument(
      tenantA,
      clientA,
      db,
      upload,
      "delete-pending.pdf",
    );
    // No terminal job seeded -> the upload's pending job is the latest.

    const removeSpy = vi.spyOn(tenantA.client.storage, "from");

    const result = await del(
      { supabase: tenantA.client, db },
      { workspaceId: tenantA.workspaceId, documentId },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("en curso");

    // Storage was never touched (guard ran before any destructive call).
    expect(removeSpy).not.toHaveBeenCalled();
    removeSpy.mockRestore();

    // Object + row intact.
    const { data: dl } = await tenantA.client.storage
      .from(BUCKET)
      .download(storagePath);
    expect(dl).not.toBeNull();
    const { data: doc } = await tenantA.client
      .from("documents")
      .select("id")
      .eq("id", documentId)
      .maybeSingle();
    expect(doc?.id).toBe(documentId);

    // Cleanup.
    await tenantA.client.storage.from(BUCKET).remove([storagePath]);
    await db
      .delete((await import("@/db/schema")).documents)
      .where(
        (await import("drizzle-orm")).eq(
          (await import("@/db/schema")).documents.id,
          documentId,
        ),
      );
  });

  it("storage.remove fails: nothing deleted, DB delete NOT attempted, retryable", async () => {
    const { documentId, storagePath } = await seedDocument(
      tenantA,
      clientA,
      db,
      upload,
      "delete-storage-fail.pdf",
    );
    await seedTerminalJob(tenantA, documentId, "failed");

    // Inject a supabase whose storage.remove returns an error.
    const fakeSupabase = {
      storage: {
        from: () => ({
          remove: async () => ({
            data: null,
            error: { message: "remove boom" },
          }),
        }),
      },
    } as unknown as typeof tenantA.client;

    const result = await del(
      { supabase: fakeSupabase, db },
      { workspaceId: tenantA.workspaceId, documentId },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Vuelve a intentarlo");

    // documents row still present (DB delete was never reached).
    const { data: doc } = await tenantA.client
      .from("documents")
      .select("id")
      .eq("id", documentId)
      .maybeSingle();
    expect(doc?.id).toBe(documentId);

    // Cleanup the real object + row.
    await tenantA.client.storage.from(BUCKET).remove([storagePath]);
    await db
      .delete((await import("@/db/schema")).documents)
      .where(
        (await import("drizzle-orm")).eq(
          (await import("@/db/schema")).documents.id,
          documentId,
        ),
      );
  });

  it("db delete fails after object removed: orphan row remains, re-delete is idempotent", async () => {
    const { documentId, storagePath } = await seedDocument(
      tenantA,
      clientA,
      db,
      upload,
      "delete-db-fail.pdf",
    );
    await seedTerminalJob(tenantA, documentId, "completed");

    // First attempt: real Storage remove succeeds, but the DB delete throws.
    const throwingDb = {
      select: db.select.bind(db),
      delete: () => {
        throw new Error("db delete boom");
      },
    } as unknown as typeof db;

    const first = await del(
      { supabase: tenantA.client, db: throwingDb },
      { workspaceId: tenantA.workspaceId, documentId },
    );

    expect(first.ok).toBe(false);

    // Object is gone (storage-first), but the row remains (recoverable orphan).
    const { data: dlAfterFirst } = await tenantA.client.storage
      .from(BUCKET)
      .download(storagePath);
    expect(dlAfterFirst).toBeNull();
    const { data: orphan } = await tenantA.client
      .from("documents")
      .select("id")
      .eq("id", documentId)
      .maybeSingle();
    expect(orphan?.id).toBe(documentId);

    // Re-delete with the real db: storage.remove on the now-missing path is
    // non-fatal (idempotent), the row is finally removed, {ok:true}.
    const second = await del(
      { supabase: tenantA.client, db },
      { workspaceId: tenantA.workspaceId, documentId },
    );
    expect(second.ok).toBe(true);

    const { data: gone } = await tenantA.client
      .from("documents")
      .select("id")
      .eq("id", documentId)
      .maybeSingle();
    expect(gone).toBeNull();
  });

  it("cross-workspace: tenant B cannot delete tenant A's document", async () => {
    const { documentId, storagePath } = await seedDocument(
      tenantA,
      clientA,
      db,
      upload,
      "delete-cross.pdf",
    );
    await seedTerminalJob(tenantA, documentId, "completed");

    // Tenant B attempts to delete A's document id, scoped to B's workspace.
    const result = await del(
      { supabase: tenantB.client, db },
      { workspaceId: tenantB.workspaceId, documentId },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("No se encontró");

    // A's object + row are intact.
    const { data: dl } = await tenantA.client.storage
      .from(BUCKET)
      .download(storagePath);
    expect(dl).not.toBeNull();
    const { data: doc } = await tenantA.client
      .from("documents")
      .select("id")
      .eq("id", documentId)
      .maybeSingle();
    expect(doc?.id).toBe(documentId);

    // Cleanup.
    await tenantA.client.storage.from(BUCKET).remove([storagePath]);
    await db
      .delete((await import("@/db/schema")).documents)
      .where(
        (await import("drizzle-orm")).eq(
          (await import("@/db/schema")).documents.id,
          documentId,
        ),
      );
  });
});

describe("RSC boundary guard", () => {
  it('imports NO value from a "use client" module (client references throw when called server-side)', async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("../delete-document.ts", import.meta.url),
      "utf8",
    );
    // use-job.ts is "use client": importing a function from it into this
    // server-invoked seam turns it into a client reference and the call
    // throws at runtime ("Attempted to call isTerminalStatus() from the
    // server") while build/tests stay green. Shared logic must come from
    // the directive-free ./job-status module instead.
    expect(source).not.toMatch(/from\s+["']\.\/use-job["']/);
  });
});
