import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  provisionTenant,
  teardownTenants,
  type Tenant,
} from "@/db/__tests__/setup";

import type { InngestSender } from "../upload-document";

/**
 * retryExtractionWith (the pure retry seam) exercised against the REAL local
 * Supabase stack: privileged jobs reset + a FAKE InngestSender recorder (so no
 * worker runs and the event payload is asserted directly).
 *
 * Covers F7c PR-F7C-2 design 4b:
 *   - failed extract job -> status reset to pending (error/result/completed_at
 *     cleared) + documents/extract event re-sent (no idempotency id)
 *   - non-failed job (pending/completed) -> refused, NO reset, NO event
 *   - cross-workspace jobId -> refused, NO reset, NO event (tenancy gate)
 *
 * DATABASE_URL must be exported in the shell (vitest has no env loader).
 */
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

describe("retryExtractionWith", () => {
  let tenant: Tenant;
  let otherTenant: Tenant;
  let serviceDb: typeof import("@/db/service")["serviceDb"];
  let retry: typeof import("../retry-extraction")["retryExtractionWith"];
  let jobs: typeof import("@/db/schema")["jobs"];
  let eq: typeof import("drizzle-orm")["eq"];

  /** Inserts a job row with a given status + documentId payload, returns its id. */
  async function seedJob(
    workspaceId: string,
    status: "failed" | "pending" | "completed",
    documentId = "11111111-1111-1111-1111-111111111111",
  ): Promise<string> {
    const [row] = await serviceDb
      .insert(jobs)
      .values({
        workspaceId,
        type: "extract_document",
        status,
        payload: { documentId, workspaceId },
        error: status === "failed" ? "boom" : null,
        result:
          status === "failed"
            ? { error_code: "provider_error", message: "boom" }
            : null,
        completedAt: status === "failed" ? new Date() : null,
      })
      .returning({ id: jobs.id });
    return row.id;
  }

  function fakeInngest(): { sender: InngestSender; sent: unknown[] } {
    const sent: unknown[] = [];
    const sender: InngestSender = {
      send: vi.fn(async (event: unknown) => {
        sent.push(event);
        return {};
      }),
    };
    return { sender, sent };
  }

  beforeAll(async () => {
    ({ serviceDb } = await import("@/db/service"));
    ({ retryExtractionWith: retry } = await import("../retry-extraction"));
    ({ jobs } = await import("@/db/schema"));
    ({ eq } = await import("drizzle-orm"));

    tenant = await provisionTenant("retry-extract");
    otherTenant = await provisionTenant("retry-extract-other");
  });

  afterAll(async () => {
    await teardownTenants(tenant, otherTenant);
  });

  afterEach(async () => {
    for (const ws of [tenant.workspaceId, otherTenant.workspaceId]) {
      await serviceDb.delete(jobs).where(eq(jobs.workspaceId, ws));
    }
  });

  it("failed job: resets to pending (clears terminal fields) + re-sends event", async () => {
    const documentId = "22222222-2222-2222-2222-222222222222";
    const jobId = await seedJob(tenant.workspaceId, "failed", documentId);
    const { sender, sent } = fakeInngest();

    const result = await retry(
      { db: serviceDb, inngest: sender },
      { workspaceId: tenant.workspaceId, jobId },
    );
    expect(result).toEqual({ ok: true });

    const [row] = await serviceDb
      .select({
        status: jobs.status,
        error: jobs.error,
        result: jobs.result,
        completedAt: jobs.completedAt,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId));
    expect(row.status).toBe("pending");
    expect(row.error).toBeNull();
    expect(row.result).toBeNull();
    expect(row.completedAt).toBeNull();

    // Event re-sent with the right payload and NO idempotency id (a real retry).
    expect(sent.length).toBe(1);
    expect(sent[0]).toEqual({
      name: "documents/extract",
      data: { jobId, documentId, workspaceId: tenant.workspaceId },
    });
  });

  it("non-failed job (pending): refused, NO reset, NO event", async () => {
    const jobId = await seedJob(tenant.workspaceId, "pending");
    const { sender, sent } = fakeInngest();

    const result = await retry(
      { db: serviceDb, inngest: sender },
      { workspaceId: tenant.workspaceId, jobId },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("ha fallado");
    expect(sent.length).toBe(0);

    const [row] = await serviceDb
      .select({ status: jobs.status })
      .from(jobs)
      .where(eq(jobs.id, jobId));
    expect(row.status).toBe("pending");
  });

  it("cross-workspace jobId: refused, NO reset, NO event (tenancy gate)", async () => {
    const jobId = await seedJob(otherTenant.workspaceId, "failed");
    const { sender, sent } = fakeInngest();

    // tenant tries to retry otherTenant's failed job.
    const result = await retry(
      { db: serviceDb, inngest: sender },
      { workspaceId: tenant.workspaceId, jobId },
    );
    expect(result.ok).toBe(false);
    expect(sent.length).toBe(0);

    // otherTenant's job is untouched (still failed).
    const [row] = await serviceDb
      .select({ status: jobs.status })
      .from(jobs)
      .where(eq(jobs.id, jobId));
    expect(row.status).toBe("failed");
  });
});
