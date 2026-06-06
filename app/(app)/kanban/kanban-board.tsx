"use client";

import { useCallback, useMemo, useOptimistic, useTransition } from "react";

import { useRouter } from "next/navigation";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  KeyboardCode,
  type KeyboardCoordinateGetter,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  getFirstCollision,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
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
    // Keyboard accessibility: cards are movable without a pointer. The custom
    // coordinate getter (below) makes EMPTY columns reachable — the stock
    // sortable getter only targets sortable items, so empty columns (which have
    // no items) were unreachable.
    useSensor(KeyboardSensor, {
      coordinateGetter: multipleContainersCoordinateGetter,
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
        let result: Awaited<ReturnType<typeof moveCase>>;
        try {
          result = await moveCase(caseId, targetStatus);
        } catch {
          // Network failure (offline, aborted request): the Server Action
          // rejects instead of returning a structured error. Same rollback
          // path — no refresh → useOptimistic auto-reverts to the server base.
          toast.error("Sin conexión. No se pudo mover el caso, vuelve a intentarlo.");
          return;
        }
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
      collisionDetection={boardCollisionDetection}
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
 * A single status column. The column itself is registered as a `useDroppable`
 * container keyed by its `status` string, so dropping (pointer OR keyboard)
 * onto an EMPTY column resolves to a real, measurable droppable rect — the
 * stock sortable-only target list never exposed empty columns. The
 * `SortableContext` items are only the card ids (within-column ordering); the
 * column droppable handles cross-column / empty-column targeting.
 */
function KanbanColumn({
  status,
  cases,
}: {
  status: CaseStatus;
  cases: KanbanCase[];
}) {
  const itemIds = useMemo(() => cases.map((c) => c.id), [cases]);

  // Register the column as a droppable container (id === status). This gives
  // empty columns a measured rect that both collision detection and the custom
  // keyboard coordinate getter can target.
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      ref={setNodeRef}
      aria-label={`Columna ${STATUS_LABELS[status]}`}
      data-over={isOver ? "" : undefined}
      className="flex min-h-48 flex-col gap-3 rounded-lg border bg-muted/30 p-3 transition-colors duration-150 data-[over]:border-foreground/30 data-[over]:bg-muted/60"
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

const ARROW_KEYS: readonly string[] = [
  KeyboardCode.Down,
  KeyboardCode.Right,
  KeyboardCode.Up,
  KeyboardCode.Left,
];

/**
 * Custom keyboard coordinate getter for the multiple-containers (column) layout
 * — adapted from dnd-kit's official multipleContainersCoordinateGetter example.
 *
 * WHY: the stock `sortableKeyboardCoordinates` only proposes coordinates of
 * sortable ITEMS. An empty column has no items, so it is impossible to move a
 * card into it with the keyboard. Because each column is now a `useDroppable`
 * container (id === status) with a measured rect, this getter can target the
 * column rects directly:
 *
 *  - Left / Right → jump to the nearest COLUMN droppable in that horizontal
 *    direction (reachable even when empty).
 *  - Up / Down → move between droppables in that vertical direction; within a
 *    column this lands on the next/previous card, falling back to the column
 *    rect. This preserves intra-column ordering while keeping cross-column
 *    movement possible.
 *
 * Space/Enter (grab/drop) and Escape (cancel) are handled by the KeyboardSensor
 * itself and are unaffected.
 */
/**
 * Board-level collision detection. `rectIntersection` first: a card placed
 * INSIDE a column (pointer drag or keyboard jump) intersects that column's
 * droppable rect, so it wins over the card's now-distant original slot.
 * Plain `closestCorners` failed here for tall empty columns: the original
 * slot's four corners (same Y, ~one column away) average closer than the
 * empty column's far-down bottom corners, so keyboard moves resolved back
 * onto the active card itself. Fall back to `closestCorners` only when
 * nothing intersects (e.g. dragging in the gap between columns).
 */
const boardCollisionDetection: CollisionDetection = (args) => {
  const intersections = rectIntersection(args);
  if (intersections.length > 0) return intersections;
  return closestCorners(args);
};

const multipleContainersCoordinateGetter: KeyboardCoordinateGetter = (
  event,
  { context: { active, droppableRects, droppableContainers, collisionRect } },
) => {
  if (!ARROW_KEYS.includes(event.code)) return;
  event.preventDefault();
  if (!active || !collisionRect) return;

  const isHorizontal =
    event.code === KeyboardCode.Right || event.code === KeyboardCode.Left;
  const isForward =
    event.code === KeyboardCode.Right || event.code === KeyboardCode.Down;

  // The card sits INSIDE its column (padding), so the column's own left edge
  // is slightly left of the card's — edge-based compares made the CURRENT
  // column a valid "left" candidate and closestCorners would pick it (a
  // same-column no-op). Compare CENTERS instead, and skip any container whose
  // rect contains the card's center (that is the column we are already in).
  const centerX = collisionRect.left + collisionRect.width / 2;
  const centerY = collisionRect.top + collisionRect.height / 2;
  const candidates = droppableContainers.getEnabled().filter((container) => {
    if (container.id === active.id) return false;
    const rect = droppableRects.get(container.id);
    if (!rect) return false;
    const containsCenter =
      rect.left <= centerX &&
      centerX <= rect.right &&
      rect.top <= centerY &&
      centerY <= rect.bottom;
    if (containsCenter) return false;
    const rectCenterX = rect.left + rect.width / 2;
    const rectCenterY = rect.top + rect.height / 2;
    if (isHorizontal) {
      // Columns are laid out horizontally → compare on the X axis.
      return isForward ? rectCenterX > centerX : rectCenterX < centerX;
    }
    // Within a column, cards are stacked vertically → compare on the Y axis.
    return isForward ? rectCenterY > centerY : rectCenterY < centerY;
  });

  if (candidates.length === 0) return;

  // Use closestCorners against the candidate rects to pick the nearest target,
  // measured from the active item's current collision rect.
  const collisions = closestCorners({
    active,
    collisionRect,
    droppableRects,
    droppableContainers: candidates,
    pointerCoordinates: null,
  });
  const closestId = getFirstCollision(collisions, "id");
  if (closestId == null) return;

  const newRect = droppableRects.get(closestId);
  if (!newRect) return;

  // Aim for the top-left of the target droppable (matches the example).
  return { x: newRect.left, y: newRect.top };
};
