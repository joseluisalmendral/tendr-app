import { desc, eq } from "drizzle-orm";

import { ensureAnonymousWorkspace } from "@/app/(auth)/actions";
import { db } from "@/db";
import { clients } from "@/db/schema/crm";
import { getCurrentWorkspace } from "@/lib/auth/get-current-workspace";

import { ClientsTable, type ClientRow } from "./clients-table";

/**
 * /clients — workspace client list.
 *
 * The (app) layout already guarantees a session. We read the caller's clients
 * via Drizzle with an EXPLICIT `workspace_id` filter (Drizzle is reads-only and
 * is NOT the tenant boundary per design ADR-D2, so the filter is mandatory) and
 * select ONLY the columns the table displays (no over-fetch). Search, status,
 * and tag filtering happen client-side over this fetched page (design §4,
 * fork #2). Writes go through the `createClient` Server Action under RLS.
 */
export default async function ClientsPage() {
  let current = await getCurrentWorkspace();

  if (current && current.workspaceId === null) {
    await ensureAnonymousWorkspace();
    current = await getCurrentWorkspace();
  }

  // The layout guard makes this unreachable; handled defensively.
  if (!current?.workspaceId) {
    return null;
  }

  const rows: ClientRow[] = await db
    .select({
      id: clients.id,
      name: clients.name,
      email: clients.email,
      company: clients.company,
      tags: clients.tags,
      status: clients.status,
    })
    .from(clients)
    .where(eq(clients.workspaceId, current.workspaceId))
    .orderBy(desc(clients.createdAt));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Clientes</h1>
        <p className="text-sm text-muted-foreground">
          Gestiona tus clientes y sus casos.
        </p>
      </div>

      <ClientsTable initialClients={rows} />
    </div>
  );
}
