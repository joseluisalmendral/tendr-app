// Esqueleto de referencia del Kanban board · F5
// Client component. El alumno NO copia este archivo literal; el agente lo
// genera adaptado al proyecto. Sirve para validar que el patrón final
// coincide.

'use client'

import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useOptimistic, useTransition, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { moveCase } from '@/app/actions/cases'
import { useRealtimeWorkspace } from '@/lib/realtime/workspace'

type CaseStatus =
  | 'prospect'
  | 'proposal'
  | 'active'
  | 'closed_won'
  | 'closed_lost'

type Case = {
  id: string
  title: string
  status: CaseStatus
  client_name: string
  value_cents: number | null
  workspace_id: string
}

const COLUMNS: { id: CaseStatus; label: string }[] = [
  { id: 'prospect', label: 'Prospect' },
  { id: 'proposal', label: 'Propuesta' },
  { id: 'active', label: 'En curso' },
  { id: 'closed_won', label: 'Cerrado · ganado' },
  { id: 'closed_lost', label: 'Cerrado · perdido' },
]

export function KanbanBoard({
  initialCases,
  workspaceId,
}: {
  initialCases: Case[]
  workspaceId: string
}) {
  const [cases, setCases] = useState(initialCases)
  const [optimisticCases, applyOptimistic] = useOptimistic<Case[], { id: string; status: CaseStatus }>(
    cases,
    (state, change) =>
      state.map((c) => (c.id === change.id ? { ...c, status: change.status } : c)),
  )
  const [, startTransition] = useTransition()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Realtime fanout: cuando otro tab del mismo workspace mueve una card,
  // sincronizar el estado local.
  useRealtimeWorkspace(workspaceId, (payload) => {
    if (payload.table === 'cases' && payload.eventType === 'UPDATE') {
      setCases((prev) =>
        prev.map((c) =>
          c.id === payload.new.id
            ? { ...c, status: payload.new.status as CaseStatus }
            : c,
        ),
      )
    }
  })

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const caseId = String(active.id)
    const newStatus = String(over.id) as CaseStatus
    const current = cases.find((c) => c.id === caseId)
    if (!current || current.status === newStatus) return

    // 1. Optimistic: mover en UI inmediatamente.
    startTransition(() => {
      applyOptimistic({ id: caseId, status: newStatus })
    })

    // 2. Server Action; rollback si falla.
    try {
      const result = await moveCase(caseId, newStatus)
      if (!result.ok) throw new Error(result.error)
      setCases((prev) =>
        prev.map((c) => (c.id === caseId ? { ...c, status: newStatus } : c)),
      )
    } catch (e) {
      toast.error('No se pudo mover el caso. Reintenta.')
      // El estado real no se modificó; el optimistic se descarta en el
      // próximo render porque arrancamos desde `cases`.
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {COLUMNS.map((col) => {
          const casesInCol = optimisticCases.filter((c) => c.status === col.id)
          return (
            <KanbanColumn key={col.id} id={col.id} label={col.label} cases={casesInCol} />
          )
        })}
      </div>
    </DndContext>
  )
}

function KanbanColumn({
  id,
  label,
  cases,
}: {
  id: CaseStatus
  label: string
  cases: Case[]
}) {
  return (
    <section
      aria-label={`Columna ${label}`}
      className="bg-muted/40 rounded-lg p-3 min-h-[200px]"
    >
      <header className="font-medium mb-2">
        {label}
        <span className="text-muted-foreground text-sm ml-2">{cases.length}</span>
      </header>
      <SortableContext items={cases.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {cases.length === 0 && (
            <p className="text-muted-foreground text-sm">Sin casos.</p>
          )}
          {cases.map((c) => (
            <KanbanCard key={c.id} case_={c} />
          ))}
        </div>
      </SortableContext>
    </section>
  )
}

function KanbanCard({ case_ }: { case_: Case }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: case_.id })

  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      aria-label={`Caso ${case_.title} del cliente ${case_.client_name}`}
      {...attributes}
      {...listeners}
      className="bg-card border rounded p-3 cursor-grab active:cursor-grabbing"
    >
      <h3 className="font-medium text-sm">{case_.title}</h3>
      <p className="text-muted-foreground text-xs">{case_.client_name}</p>
      {case_.value_cents !== null && (
        <p className="text-xs mt-1">
          {(case_.value_cents / 100).toLocaleString('es-ES', {
            style: 'currency',
            currency: 'EUR',
          })}
        </p>
      )}
    </article>
  )
}
