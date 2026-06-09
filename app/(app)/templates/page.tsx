import { asc, eq } from "drizzle-orm";

import { ensureAnonymousWorkspace } from "@/app/(auth)/actions";
import { db } from "@/db";
import { clients } from "@/db/schema/crm";
import { getCurrentWorkspace } from "@/lib/auth/get-current-workspace";

import { listTemplates } from "./template-crud";
import { TemplatesIsland, type ClientOption } from "./templates-island";

/**
 * /templates — workspace template editor (F7 Block C / PR4b).
 *
 * Server Component: the (app) layout already guarantees a session. We read the
 * workspace templates via the pure `listTemplates` seam (explicit workspaceId
 * gate, RLS-bound user-session db) and the workspace clients for the "Adaptar
 * para cliente X" selector (only id + name, no over-fetch). The interactive
 * CRUD + adapt streaming lives in the TemplatesIsland client component.
 */

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  let current = await getCurrentWorkspace();

  if (current && current.workspaceId === null) {
    await ensureAnonymousWorkspace();
    current = await getCurrentWorkspace();
  }

  // The layout guard makes this unreachable; handled defensively.
  if (!current?.workspaceId) {
    return null;
  }
  const workspaceId = current.workspaceId;

  const templateRows = await listTemplates({ db }, workspaceId);

  const clientRows: ClientOption[] = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.workspaceId, workspaceId))
    .orderBy(asc(clients.name));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Plantillas</h1>
        <p className="text-sm text-muted-foreground">
          Crea plantillas en markdown y adáptalas a cada cliente con IA.
        </p>
      </div>

      <TemplatesIsland
        initialTemplates={templateRows}
        clients={clientRows}
      />
    </div>
  );
}
