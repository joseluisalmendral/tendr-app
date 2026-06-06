"use client";

import { useCallback, useMemo, useOptimistic, useTransition } from "react";

import { useRouter } from "next/navigation";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { KanbanIcon } from "@phosphor-icons/react";
import { toast } from "sonner";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  useWorkspaceRealtime,
  type WorkspaceRealtimeEvent,
} from "@/lib/realtime/use-workspace-realtime";

import {
  CASE_STATUS_VALUES,
  type CaseStatus,
} from "@/app/(app)/clients/[id]/create-case";

import { moveCase } from "./actions";
import { KanbanCard } from "./kanban-card";

export type KanbanCase = {
  id: string;
  title: string;
  status: CaseStatus | null;
  valueCents: number | null;
  clientName: string;
  updatedAt: Date | string;
};

/** Column order + Spanish labels for the 5 real `case_status` enum values. */
export const STATUS_LABELS: Record<CaseStatus, string> = {
  prospect: "Prospecto",
  proposal: "Propuesta",
  active: "Activo",
  closed_won: "Ganado",
  closed_lost: "Perdido",
};

const REALTIME_EVENTS: WorkspaceRealtimeEvent[] = ["INSERT", "UPDATE", "DELETE"];

/** The minimal shape of a `cases` row delivered by a postgres_changes payload. */
type CaseRealtimeRow = {
  id: string;
  status: CaseStatus | null;
  workspace_id: string;
};

/**
 * Kanban board (slice D). DndContext + one SortableContext per status column.
 *
 * STATE FLOW (design §1, board-level useOptimistic keyed by caseId→status):
 *  1. The RSC page is the source of truth: `initialCases` is the authoritative
 *     base. `useOptimistic` mirrors a transient `{caseId,newStatus}` overlay.
 *  2. On drag end the card lands in a new column → `startTransition(() => {
 *     addOptimistic(...); moveCase(...) })`. The card shows in the new column
 *     instantly.
 *  3. On success → `router.refresh()` re-pulls fresh DB rows; the optimistic
 *     overlay auto-settles onto the new base.
 *  4. On error → no refresh; `useOptimistic` auto-reverts to the previous base
 *     and a sonner rollback toast fires (honest Spanish copy).
 *
 * SELF-ECHO RECONCILIATION (design §1, idempotent payload-vs-local compare):
 *  A single global Realtime subscription (the shared hook) receives every
 *  workspace `cases` change. On UPDATE we apply it ONLY if the payload's status
 *  differs from what we currently display for that case — otherwise it is a
 *  no-op. The originating tab's own echo is therefore naturally a no-op (its
 *  local state already equals the server value), while a SECOND same-user tab
 *  sees a real difference and refreshes. INSERT/DELETE always refresh (a case
 *  created/removed elsewhere should appear/disappear). Because the compare is
 *  idempotent there is no double-apply and no flicker.
 */
export function KanbanBoard({
  initialCases,
  workspaceId,
}: {
  initialCases: KanbanCase[];
  workspaceId: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [optimisticCases, applyOptimisticMove] = useOptimistic(
    initialCases,
    (state: KanbanCase[], move: { caseId: string; newStatus: CaseStatus }) =>
      state.map((c) =>
        c.id === move.caseId ? { ...c, status: move.newStatus } : c,
      ),
  );

  // caseId → currently displayed status, for the idempotent realtime compare.
  const displayedStatusById = useMemo(() => {
    const map = new Map<string, CaseStatus>();
    for (const c of optimisticCases) {
      map.set(c.id, c.status ?? "prospect");
    }
    return map;
  }, [optimisticCases]);

  const columns = useMemo(() => {
    const grouped: Record<CaseStatus, KanbanCase[]> = {
      prospect: [],
      proposal: [],
      active: [],
      closed_won: [],
      closed_lost: [],
    };
    for (const c of optimisticCases) {
      grouped[c.status ?? "prospect"].push(c);
    }
    return grouped;
  }, [optimisticCases]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // A small activation distance so a click on a card isn't read as a drag.
      activationConstraint: { distance: 6 },
    }),
    // Keyboard accessibility: cards are movable without a pointer.
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const caseId = String(active.id);
      // `over.id` is either a column droppable id (a status) or another card id.
      const overId = String(over.id);
      const targetStatus = resolveTargetStatus(overId, optimisticCases);
      if (!targetStatus) return;

      const currentStatus =
        optimisticCases.find((c) => c.id === caseId)?.status ?? "prospect";
      if (currentStatus === targetStatus) return;

      startTransition(async () => {
        applyOptimisticMove({ caseId, newStatus: targetStatus });
        const result = await moveCase(caseId, targetStatus);
        if (result.status === "error") {
          // No refresh → useOptimistic auto-reverts to the server base.
          toast.error(result.message);
          return;
        }
        // Re-pull authoritative rows; the overlay settles onto the new base.
        router.refresh();
      });
    },
    [optimisticCases, applyOptimisticMove, router],
  );

  const handleRealtimeChange = useCallback(
    (payload: RealtimePostgresChangesPayload<CaseRealtimeRow>) => {
      if (payload.eventType === "UPDATE") {
        const row = payload.new;
        if (!row?.id || !row.status) return;
        // Idempotent compare: only act when the incoming status differs from
        // what we display. The originating tab's own echo is a no-op here.
        if (displayedStatusById.get(row.id) === row.status) return;
        router.refresh();
        return;
      }
      // INSERT/DELETE: a case appeared/disappeared elsewhere → resync.
      router.refresh();
    },
    [displayedStatusById, router],
  );

  useWorkspaceRealtime<CaseRealtimeRow>({
    workspaceId,
    table: "cases",
    events: REALTIME_EVENTS,
    onChange: handleRealtimeChange,
    // Catch-up after (re)connect for any events missed while disconnected.
    onSubscribed: () => router.refresh(),
  });

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragEnd={handleDragEnd}
    >
      <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {CASE_STATUS_VALUES.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            cases={columns[status]}
          />
        ))}
      </div>
    </DndContext>
  );
}

/**
 * A single status column. Its `SortableContext` items include a synthetic
 * column id so dropping into an EMPTY column still resolves to a status (the
 * column id IS the status string).
 */
function KanbanColumn({
  status,
  cases,
}: {
  status: CaseStatus;
  cases: KanbanCase[];
}) {
  const itemIds = useMemo(
    () => [status, ...cases.map((c) => c.id)],
    [status, cases],
  );

  return (
    <section
      aria-label={`Columna ${STATUS_LABELS[status]}`}
      className="flex min-h-48 flex-col gap-3 rounded-lg border bg-muted/30 p-3 transition-colors duration-150"
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">{STATUS_LABELS[status]}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
          {cases.length}
        </span>
      </header>

      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <ul
          id={status}
          className="flex flex-1 flex-col gap-2"
          data-column-status={status}
        >
          {cases.length > 0 ? (
            cases.map((kanbanCase) => (
              <KanbanCard key={kanbanCase.id} kanbanCase={kanbanCase} />
            ))
          ) : (
            <Empty className="flex-1 border border-dashed bg-transparent py-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <KanbanIcon />
                </EmptyMedia>
                <EmptyTitle className="text-sm">Sin casos</EmptyTitle>
                <EmptyDescription className="text-xs">
                  Sin casos en este estado.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </ul>
      </SortableContext>
    </section>
  );
}

/**
 * Resolves the drop target to a status. `overId` is either:
 *  - a status string (dropped onto a column container / empty column), or
 *  - a card id (dropped onto another card) → use that card's current status.
 */
function resolveTargetStatus(
  overId: string,
  cases: KanbanCase[],
): CaseStatus | null {
  if ((CASE_STATUS_VALUES as readonly string[]).includes(overId)) {
    return overId as CaseStatus;
  }
  const overCase = cases.find((c) => c.id === overId);
  return overCase?.status ?? null;
}
