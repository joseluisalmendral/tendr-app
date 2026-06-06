"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Badge } from "@/components/ui/badge";

import { STATUS_LABELS, type KanbanCase } from "./kanban-board";

/**
 * Presentational draggable case card (design §7 motion, CSS-only).
 *
 * dnd-kit's `useSortable` supplies the GPU-accelerated `transform` (golden
 * rule: only transform/opacity animate) and a damped `transition` for the
 * settle-on-drop. On top of that we layer functional, within-budget
 * (MOTION_INTENSITY 4-5) feedback purely via Tailwind utilities:
 *   - lift on grab: raised shadow + scale(1.02) while `isDragging`
 *   - press feedback: scale(0.98) on :active (tactile push)
 *   - shadow easing: 150ms ease-out-quint
 * `prefers-reduced-motion:` variants drop the scale/shadow transitions and keep
 * instant position changes (accessibility).
 *
 * aria-label gives screen-reader users the case + status context and tells them
 * the card is keyboard-movable (a KeyboardSensor is wired in the board).
 */
export function KanbanCard({ kanbanCase }: { kanbanCase: KanbanCase }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: kanbanCase.id });

  const statusLabel = STATUS_LABELS[kanbanCase.status ?? "prospect"];

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        // dnd-kit's damped settle (≈200ms) when not actively dragging.
        transition,
      }}
      {...attributes}
      {...listeners}
      aria-label={`Caso ${kanbanCase.title}, estado ${statusLabel}. Usa las teclas de flecha para moverlo entre estados.`}
      data-dragging={isDragging ? "" : undefined}
      className={[
        "group cursor-grab touch-none rounded-lg border bg-card p-3 text-card-foreground",
        "shadow-xs outline-none transition-[box-shadow,transform] duration-150 ease-[cubic-bezier(.23,1,.32,1)]",
        "hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring",
        "active:scale-[0.98] active:cursor-grabbing",
        "data-[dragging]:scale-[1.02] data-[dragging]:cursor-grabbing data-[dragging]:shadow-lg data-[dragging]:opacity-90",
        "motion-reduce:transition-none motion-reduce:active:scale-100 motion-reduce:data-[dragging]:scale-100",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{kanbanCase.title}</p>
        {kanbanCase.valueCents !== null ? (
          <Badge variant="secondary" className="shrink-0 tabular-nums">
            {formatCents(kanbanCase.valueCents)}
          </Badge>
        ) : null}
      </div>
      <p className="mt-1.5 truncate text-xs text-muted-foreground">
        {kanbanCase.clientName}
      </p>
    </li>
  );
}

/** Cents → es-AR currency string (value_cents stored as integer cents). */
function formatCents(valueCents: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(valueCents / 100);
}
