import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  provisionTenant,
  seedClientRow,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";

/**
 * uploadDocumentWith (the pure upload seam) exercised against the REAL local
 * Supabase stack: Storage via tenant A's user-session client + a real Drizzle
 * client for the documents+jobs transaction + a fake Inngest recorder.
 *
 * Covers SPEC slice A — Upload validation and persistence + the failure matrix:
 *   - valid 2MB PDF -> Storage object + documents row + pending job + send(id=jobId)
 *   - 12MB / non-PDF -> Zod rejects BEFORE any Storage write (no rows)
 *   - tx INSERT fails after Storage upload -> compensating Storage.remove
 *
 * The Drizzle client connects via DATABASE_URL (privileged local string); the
 * module reads the env at load time, so we set it before importing the seam.
 */
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const BUCKET = "documents";

type FakeInngest = {
  sent: Array<{ name: string; id?: string; data: unknown }>;
  send: (event: {
    name: "documents/extract";
    id?: string;
    data: { jobId: string; documentId: string; workspaceId: string };
  }) => Promise<unknown>;
};

function makeFakeInngest(): FakeInngest {
  const sent: FakeInngest["sent"] = [];
  return {
    sent,
    async send(event) {
      sent.push(event);
      return { ids: [event.id ?? "evt"] };
    },
  };
}

function pdfFileBody(sizeBytes: number): ArrayBuffer {
  return new ArrayBuffer(sizeBytes);
}

/** Typed recorder for the injected `markJobFailed` recovery hook. */
function makeMarkJobFailed() {
  const fn: (
    jobId: string,
    errorCode: string,
    message: string,
  ) => Promise<void> = async () => undefined;
  return vi.fn(fn);
}

describe("uploadDocumentWith", () => {
  let tenant: Tenant;
  let clientId: string;
  let db: typeof import("@/db")["db"];
  let upload: typeof import("../upload-document")["uploadDocumentWith"];

  beforeAll(async () => {
    ({ db } = await import("@/db"));
    ({ uploadDocumentWith: upload } = await import("../upload-document"));

    tenant = await provisionTenant("upload");
    clientId = await seedClientRow(tenant, "Cliente Upload");
  });

  afterAll(async () => {
    await teardownTenants(tenant);
  });

  it("valid 2MB PDF: object + documents row + pending job + send(id=jobId)", async () => {
    const inngest = makeFakeInngest();
    const markJobFailed = makeMarkJobFailed();

    const result = await upload(
      { supabase: tenant.client, db, inngest, markJobFailed },
      {
        workspaceId: tenant.workspaceId,
        clientId,
        filename: "contract.pdf",
        mimeType: "application/pdf",
        size: 2 * 1024 * 1024,
        body: pdfFileBody(2 * 1024 * 1024),
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Storage object exists at the expected workspace-scoped path.
    const expectedPath = `${tenant.workspaceId}/${clientId}/${result.documentId}.pdf`;
    const { data: downloaded, error: dlErr } = await tenant.client.storage
      .from(BUCKET)
      .download(expectedPath);
    expect(dlErr).toBeNull();
    expect(downloaded).not.toBeNull();

    // documents row exists (read through the owner's RLS-scoped client).
    const { data: doc } = await tenant.client
      .from("documents")
      .select("id, storage_path, filename, size_bytes")
      .eq("id", result.documentId)
      .single();
    expect(doc?.storage_path).toBe(expectedPath);
    expect(doc?.filename).toBe("contract.pdf");

    // jobs row exists, pending, type=extract_document.
    const { data: job } = await tenant.client
      .from("jobs")
      .select("id, status, type")
      .eq("id", result.jobId)
      .single();
    expect(job?.status).toBe("pending");
    expect(job?.type).toBe("extract_document");

    // Inngest event sent with the job id as idempotency key.
    expect(inngest.sent).toHaveLength(1);
    expect(inngest.sent[0]).toMatchObject({
      name: "documents/extract",
      id: result.jobId,
      data: { jobId: result.jobId, workspaceId: tenant.workspaceId },
    });
    expect(markJobFailed).not.toHaveBeenCalled();

    await tenant.client.storage.from(BUCKET).remove([expectedPath]);
  });

  it("12MB file: Zod rejects BEFORE any Storage write, no rows", async () => {
    const inngest = makeFakeInngest();
    const markJobFailed = makeMarkJobFailed();
    const storageSpy = vi.spyOn(tenant.client.storage, "from");

    const result = await upload(
      { supabase: tenant.client, db, inngest, markJobFailed },
      {
        workspaceId: tenant.workspaceId,
        clientId,
        filename: "huge.pdf",
        mimeType: "application/pdf",
        size: 12 * 1024 * 1024,
        body: pdfFileBody(0),
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("validation_error");
    // No Storage call, no Inngest send.
    expect(storageSpy).not.toHaveBeenCalled();
    expect(inngest.sent).toHaveLength(0);

    storageSpy.mockRestore();
  });

  it("non-PDF: Zod rejects BEFORE any Storage write", async () => {
    const inngest = makeFakeInngest();
    const markJobFailed = makeMarkJobFailed();
    const storageSpy = vi.spyOn(tenant.client.storage, "from");

    const result = await upload(
      { supabase: tenant.client, db, inngest, markJobFailed },
      {
        workspaceId: tenant.workspaceId,
        clientId,
        filename: "image.png",
        mimeType: "image/png",
        size: 1024,
        body: pdfFileBody(0),
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("validation_error");
    expect(storageSpy).not.toHaveBeenCalled();

    storageSpy.mockRestore();
  });

  it("inngest.send fails post-commit: job marked failed (no zombie pending)", async () => {
    const failingInngest = {
      sent: [] as unknown[],
      async send(): Promise<unknown> {
        throw new Error("send boom");
      },
    };
    const markJobFailed = makeMarkJobFailed();

    const result = await upload(
      { supabase: tenant.client, db, inngest: failingInngest, markJobFailed },
      {
        workspaceId: tenant.workspaceId,
        clientId,
        filename: "send-fail.pdf",
        mimeType: "application/pdf",
        size: 1024,
        body: pdfFileBody(1024),
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("provider_error");

    // The tx committed (so a jobId exists) and the post-commit recovery marked
    // it failed instead of leaving a zombie pending job.
    expect(markJobFailed).toHaveBeenCalledTimes(1);
    const [jobId, errorCode] = markJobFailed.mock.calls[0];
    expect(typeof jobId).toBe("string");
    expect(errorCode).toBe("provider_error");

    // Cleanup the orphan object left behind (the document/job rows persist by
    // design — the job is terminal-failed, not removed).
    const { data: doc } = await tenant.client
      .from("documents")
      .select("storage_path")
      .eq("filename", "send-fail.pdf")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (doc?.storage_path) {
      await tenant.client.storage.from(BUCKET).remove([doc.storage_path]);
    }
  });

  it("tx INSERT fails after Storage upload: compensating Storage.remove", async () => {
    const inngest = makeFakeInngest();
    const markJobFailed = makeMarkJobFailed();

    // Inject a db whose transaction throws, so the Storage object must be
    // compensated. We spy on the user-session Storage to assert remove().
    const fakeDb = {
      transaction: vi.fn(async () => {
        throw new Error("tx boom");
      }),
    } as unknown as typeof db;

    const removed: string[][] = [];
    const realFrom = tenant.client.storage.from.bind(tenant.client.storage);
    const fromSpy = vi
      .spyOn(tenant.client.storage, "from")
      .mockImplementation((bucket: string) => {
        const bucketApi = realFrom(bucket);
        const originalRemove = bucketApi.remove.bind(bucketApi);
        bucketApi.remove = (async (paths: string[]) => {
          removed.push(paths);
          return originalRemove(paths);
        }) as typeof bucketApi.remove;
        return bucketApi;
      });

    const result = await upload(
      { supabase: tenant.client, db: fakeDb, inngest, markJobFailed },
      {
        workspaceId: tenant.workspaceId,
        clientId,
        filename: "rollback.pdf",
        mimeType: "application/pdf",
        size: 1024,
        body: pdfFileBody(1024),
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("document_error");

    // The transaction was attempted and the object was compensated.
    expect(fakeDb.transaction).toHaveBeenCalledTimes(1);
    expect(removed).toHaveLength(1);
    expect(removed[0][0]).toMatch(
      new RegExp(`^${tenant.workspaceId}/${clientId}/.+\\.pdf$`),
    );
    // No event was sent and no job exists to mark failed.
    expect(inngest.sent).toHaveLength(0);
    expect(markJobFailed).not.toHaveBeenCalled();

    fromSpy.mockRestore();
  });
});
