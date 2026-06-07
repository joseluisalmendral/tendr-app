import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  provisionTenant,
  seedClientRow,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";

/**
 * getDocumentSignedUrlWith (the signed-URL seam reused by the preview dialog)
 * exercised against the REAL local Supabase stack. The preview modal renders its
 * three states off this result: ready (ok:true), error (ok:false), and loading
 * (in-flight). This file pins the error contract the dialog depends on so a
 * signing failure surfaces as a recoverable error state, never a hung modal.
 *
 * Covers SPEC R-PREVIEW (PDF Preview Dialog):
 *   - success         -> { ok:true, url } (a fresh signed URL is minted)
 *   - not found / cross-tenant (RLS) -> { ok:false, error:"Not found." }
 *   - sign error      -> { ok:false, error:"Cannot sign URL." } (no hang)
 *
 * The Drizzle client connects via DATABASE_URL (local string); the module reads
 * env at load time, so we set it before importing the seam.
 */
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const BUCKET = "documents";

function makeFakeInngest() {
  const sent: unknown[] = [];
  return {
    sent,
    async send(event: {
      name: "documents/extract";
      id?: string;
      data: { jobId: string; documentId: string; workspaceId: string };
    }) {
      sent.push(event);
      return { ids: [event.id ?? "evt"] };
    },
  };
}

describe("getDocumentSignedUrlWith — preview dialog signing seam", () => {
  let tenantA: Tenant;
  let tenantB: Tenant;
  let clientA: string;
  let db: typeof import("@/db")["db"];
  let sign: typeof import("../upload-document")["getDocumentSignedUrlWith"];
  let upload: typeof import("../upload-document")["uploadDocumentWith"];
  let documentId: string;
  let storagePath: string;

  beforeAll(async () => {
    ({ db } = await import("@/db"));
    ({ getDocumentSignedUrlWith: sign, uploadDocumentWith: upload } =
      await import("../upload-document"));

    tenantA = await provisionTenant("signurl-a");
    tenantB = await provisionTenant("signurl-b");
    clientA = await seedClientRow(tenantA, "Cliente SignUrl A");

    const result = await upload(
      {
        supabase: tenantA.client,
        db,
        inngest: makeFakeInngest(),
        markJobFailed: async () => undefined,
      },
      {
        workspaceId: tenantA.workspaceId,
        clientId: clientA,
        filename: "preview.pdf",
        mimeType: "application/pdf",
        size: 1024,
        body: new ArrayBuffer(1024),
      },
    );
    if (!result.ok) throw new Error("seed upload failed");
    documentId = result.documentId;
    storagePath = `${tenantA.workspaceId}/${clientA}/${documentId}.pdf`;
  });

  afterAll(async () => {
    await tenantA.client.storage.from(BUCKET).remove([storagePath]);
    await teardownTenants(tenantA, tenantB);
  });

  it("success: mints a fresh signed URL for an owned document (ready state)", async () => {
    const result = await sign(
      { supabase: tenantA.client, db },
      documentId,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url).toContain("/storage/v1/");
    expect(result.url).toContain("token=");
  });

  it("cross-tenant id: no signed URL is leaked to another workspace", async () => {
    // Tenant B asks for tenant A's document id. In production the user-session
    // Drizzle read is RLS-scoped, so the row never resolves (-> "Not found.").
    // In this test harness the `db` connection is the privileged `postgres`
    // role (DATABASE_URL), so the row DOES resolve here and tenancy is instead
    // enforced at the Storage signing step: tenant B's user-session Storage
    // client cannot sign A's object (storage.objects RLS), so createSignedUrl
    // fails -> "Cannot sign URL.". Either way the contract the preview dialog
    // relies on holds: { ok:false } and NO signed URL crosses the workspace
    // boundary. (Same harness deviation documented in the Slice A delete seam.)
    const result = await sign(
      { supabase: tenantB.client, db },
      documentId,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(["Not found.", "Cannot sign URL."]).toContain(result.error);
  });

  it("missing document id: workspace read resolves no row -> { ok:false }", async () => {
    // A document id that does not exist returns the not-found branch directly,
    // pinning the "Not found." copy the seam returns when the row is absent.
    const result = await sign(
      { supabase: tenantA.client, db },
      "00000000-0000-0000-0000-000000000000",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Not found.");
  });

  it("sign error: createSignedUrl fails -> { ok:false } (modal never hangs)", async () => {
    // The document row resolves (real db), but the Storage signing call fails.
    // The preview dialog renders its error state off this branch, so it can
    // never sit on a blank/loading view.
    const failingSupabase = {
      storage: {
        from() {
          return {
            async createSignedUrl() {
              return { data: null, error: { message: "sign boom" } };
            },
          };
        },
      },
    } as unknown as Tenant["client"];

    const result = await sign(
      { supabase: failingSupabase, db },
      documentId,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Cannot sign URL.");
  });
});
