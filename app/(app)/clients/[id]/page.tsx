import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CaretLeftIcon } from "@phosphor-icons/react/ssr";

import { ensureAnonymousWorkspace } from "@/app/(auth)/actions";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { cases, clients, notes } from "@/db/schema/crm";
import { documents } from "@/db/schema/documents";
import { jobs } from "@/db/schema/jobs";
import { getCurrentWorkspace } from "@/lib/auth/get-current-workspace";

import {
  ClientDetailTabs,
  type CaseRow,
  type NoteRow,
} from "./client-detail-tabs";
import type { DocumentRow } from "./documents-tab";
import type { JobStatus } from "./use-job";

const CLIENT_STATUS_LABELS: Record<"active" | "archived", string> = {
  active: "Activo",
  archived: "Archivado",
};

/**
 * /clients/[id] — single client detail.
 *
 * The (app) layout already guarantees a session. We read the client and its
 * cases/notes via Drizzle with an EXPLICIT `workspace_id` filter (Drizzle is
 * reads-only and is NOT the tenant boundary per design ADR-D2, so the filter is
 * mandatory). The client lookup ANDs the id with the workspace filter, so a
 * foreign or nonexistent id resolves to zero rows → `notFound()` (no
 * cross-tenant leak, no 500). Cases/notes are read in parallel, each scoped to
 * the same workspace AND this client. Writes go through the `createCase` /
 * `createNote` Server Actions under RLS.
 */
export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let current = await getCurrentWorkspace();

  if (current && current.workspaceId === null) {
    await ensureAnonymousWorkspace();
    current = await getCurrentWorkspace();
  }

  // The layout guard makes this unreachable; handled defensively.
  if (!current?.workspaceId) {
    notFound();
  }

  const workspaceId = current.workspaceId;

  const [client] = await db
    .select({
      id: clients.id,
      name: clients.name,
      company: clients.company,
      email: clients.email,
      tags: clients.tags,
      status: clients.status,
    })
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.workspaceId, workspaceId)))
    .limit(1);

  // Workspace-scoped: a foreign/nonexistent id is invisible to this caller.
  if (!client) {
    notFound();
  }

  const [clientCases, clientNotes, clientDocuments] = await Promise.all([
    db
      .select({
        id: cases.id,
        title: cases.title,
        status: cases.status,
        valueCents: cases.valueCents,
        createdAt: cases.createdAt,
      })
      .from(cases)
      .where(and(eq(cases.workspaceId, workspaceId), eq(cases.clientId, id)))
      .orderBy(desc(cases.createdAt)),
    db
      .select({
        id: notes.id,
        body: notes.body,
        createdAt: notes.createdAt,
      })
      .from(notes)
      .where(and(eq(notes.workspaceId, workspaceId), eq(notes.clientId, id)))
      .orderBy(desc(notes.createdAt)),
    db
      .select({
        id: documents.id,
        filename: documents.filename,
        sizeBytes: documents.sizeBytes,
        createdAt: documents.createdAt,
        extractedMetadata: documents.extractedMetadata,
      })
      .from(documents)
      .where(
        and(eq(documents.workspaceId, workspaceId), eq(documents.clientId, id)),
      )
      .orderBy(desc(documents.createdAt)),
  ]);

  // Resolve each document's latest extraction job (jobs.payload.documentId links
  // the two; no FK column exists). The user-session RLS SELECT policy on `jobs`
  // scopes this read. The hook then takes over for live progress per document.
  const docIds = clientDocuments.map((d) => d.id);
  const jobRows = docIds.length
    ? await db
        .select({
          id: jobs.id,
          status: jobs.status,
          payload: jobs.payload,
          createdAt: jobs.createdAt,
        })
        .from(jobs)
        .where(eq(jobs.workspaceId, workspaceId))
        .orderBy(desc(jobs.createdAt))
    : [];

  // Keep only the latest job per documentId (rows are already newest-first).
  const latestJobByDoc = new Map<string, { id: string; status: JobStatus }>();
  for (const job of jobRows) {
    const payloadDocId = (job.payload as { documentId?: string } | null)
      ?.documentId;
    if (!payloadDocId || latestJobByDoc.has(payloadDocId)) continue;
    latestJobByDoc.set(payloadDocId, {
      id: job.id,
      status: job.status as JobStatus,
    });
  }

  const caseRows: CaseRow[] = clientCases.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status ?? "prospect",
    valueCents: row.valueCents ?? null,
    createdAt: row.createdAt.toISOString(),
  }));

  const noteRows: NoteRow[] = clientNotes.map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  }));

  const documentRows: DocumentRow[] = clientDocuments.map((row) => {
    const job = latestJobByDoc.get(row.id) ?? null;
    return {
      id: row.id,
      filename: row.filename,
      sizeBytes: row.sizeBytes,
      createdAt: row.createdAt.toISOString(),
      extractedMetadata: row.extractedMetadata,
      jobId: job?.id ?? null,
      jobStatus: job?.status ?? null,
    };
  });

  const tags = client.tags ?? [];
  const status = client.status ?? "active";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Link
          href="/clients"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <CaretLeftIcon weight="bold" className="size-4" />
          Volver a clientes
        </Link>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {client.name}
            </h1>
            {client.company ? (
              <p className="text-sm text-muted-foreground">{client.company}</p>
            ) : null}
            {client.email ? (
              <p className="text-sm text-muted-foreground">{client.email}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={status === "active" ? "default" : "outline"}>
              {CLIENT_STATUS_LABELS[status]}
            </Badge>
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <ClientDetailTabs
        clientId={client.id}
        workspaceId={workspaceId}
        initialCases={caseRows}
        initialNotes={noteRows}
        initialDocuments={documentRows}
      />
    </div>
  );
}
