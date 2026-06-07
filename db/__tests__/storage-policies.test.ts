import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  provisionTenant,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";

/**
 * Storage RLS for the private `documents` bucket (db/policies/storage.sql,
 * applied to the LOCAL stack via `pnpm db:storage`) exercised against the REAL
 * local Supabase Storage API through each tenant's user-session client.
 *
 * The object path is {workspace_id}/{client_id}/{document_id}.pdf, so the
 * policies gate access by the first path segment resolving to a workspace the
 * caller owns. We assert the SPEC slice-A scenario: a file owned by workspace A
 * is denied to a user of workspace B, while the owner can read it.
 *
 * The bucket is private, so a user-session client lists/downloads only objects
 * its policies permit — a cross-workspace download returns an error/empty.
 */

const BUCKET = "documents";

function pdfBytes(): Uint8Array {
  // Minimal but valid-enough PDF header; content is irrelevant to RLS.
  return new TextEncoder().encode("%PDF-1.4\n%test\n");
}

describe("documents bucket storage policies", () => {
  let a: Tenant;
  let b: Tenant;
  let pathA: string;

  beforeAll(async () => {
    a = await provisionTenant("storage-a");
    b = await provisionTenant("storage-b");

    // Tenant A uploads an object under its own workspace prefix via its
    // user-session client — this also asserts the INSERT policy allows it.
    const clientId = crypto.randomUUID();
    const documentId = crypto.randomUUID();
    pathA = `${a.workspaceId}/${clientId}/${documentId}.pdf`;

    const { error } = await a.client.storage
      .from(BUCKET)
      .upload(pathA, pdfBytes(), {
        contentType: "application/pdf",
        upsert: false,
      });
    expect(error).toBeNull();
  });

  afterAll(async () => {
    // Remove the object (owner client) before deleting the users.
    await a.client.storage.from(BUCKET).remove([pathA]).catch(() => undefined);
    await teardownTenants(a, b);
  });

  it("owner (workspace A) can download its own object", async () => {
    const { data, error } = await a.client.storage.from(BUCKET).download(pathA);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it("cross-workspace read denied: tenant B cannot download A's object", async () => {
    const { data, error } = await b.client.storage.from(BUCKET).download(pathA);
    // The SELECT policy denies the row, so the download yields no object.
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("cross-workspace write denied: tenant B cannot upload into A's prefix", async () => {
    const foreignPath = `${a.workspaceId}/${crypto.randomUUID()}/${crypto.randomUUID()}.pdf`;
    const { error } = await b.client.storage
      .from(BUCKET)
      .upload(foreignPath, pdfBytes(), {
        contentType: "application/pdf",
        upsert: false,
      });
    // The INSERT policy rejects an object whose first path segment is not a
    // workspace tenant B owns.
    expect(error).not.toBeNull();
  });
});
