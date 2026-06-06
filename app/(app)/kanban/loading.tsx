import { Skeleton } from "@/components/ui/skeleton";

/**
 * /kanban loading skeleton. Mirrors app/(app)/kanban/page.tsx + KanbanBoard:
 * title block and the 5-column board grid, each column showing a header (label
 * + count) and a few card-sized blocks. Shown during the Drizzle read of all
 * workspace cases.
 */
export default function KanbanLoading() {
  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-6">
      {/* Title block */}
      <div className="flex flex-col gap-1">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* 5-column board grid */}
      <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, col) => (
          <div
            key={col}
            className="flex min-h-48 flex-col gap-3 rounded-lg border bg-muted/30 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-6 rounded-full" />
            </div>
            <div className="flex flex-col gap-2">
              {Array.from({ length: 2 }).map((__, card) => (
                <Skeleton key={card} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
