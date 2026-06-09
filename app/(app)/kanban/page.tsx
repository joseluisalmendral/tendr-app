import { desc, eq } from "drizzle-orm";

import { ensureAnonymousWorkspace } from "@/app/(auth)/actions";
import { db } from "@/db";
import { cases, clients } from "@/db/schema/crm";
import { getCurrentWorkspace } from "@/lib/auth/get-current-workspace";

import { KanbanBoard, type KanbanCase } from "./kanban-board";

/**
 * /kanban — workspace case board.
 *
 * The (app) layout already guarantees a session. We read ALL of the caller's
 * cases via Drizzle with an EXPLICIT `workspace_id` filter (Drizzle is
 * reads-only and is NOT the tenant boundary per design ADR-D2, so the filter is
 * mandatory), joining `clients` only for the display name. We select ONLY what
 * the board renders (no over-fetch). Status moves go through the `moveCase`
 * Server Action (`move_case` atomic RPC under RLS); the board overlays the move
 * optimistically and a single global Realtime subscription keeps it in sync
 * (design §1 / §6).
 */
export default async function KanbanPage() {
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

  const rows: KanbanCase[] = await db
    .select({
      id: cases.id,
      title: cases.title,
      status: cases.status,
      valueCents: cases.valueCents,
      clientName: clients.name,
      updatedAt: cases.updatedAt,
    })
    .from(cases)
    .innerJoin(clients, eq(cases.clientId, clients.id))
    .where(eq(cases.workspaceId, workspaceId))
    .orderBy(desc(cases.updatedAt));

  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Kanban</h1>
        <p className="text-sm text-muted-foreground">
          Arrastra los casos entre estados. Los cambios se sincronizan en tiempo
          real entre tus pestañas.
        </p>
      </div>

      <KanbanBoard initialCases={rows} workspaceId={workspaceId} />
    </div>
  );
}
