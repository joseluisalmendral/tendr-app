import { Skeleton } from "@/components/ui/skeleton";

/**
 * Dashboard loading skeleton. Mirrors app/(app)/app/page.tsx: title block, the
 * 5-metric card grid (DashboardCards), and the recent-activity list rows.
 * Shown by Next.js during the initial RSC data fetch (counts + activity).
 */
export default function DashboardLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      {/* Title block */}
      <div className="flex flex-col gap-1">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-56" />
      </div>

      {/* Metric cards grid (5 tiles) */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-lg border p-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-7 w-12" />
          </div>
        ))}
      </div>

      {/* Recent activity list */}
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <Skeleton className="h-5 w-36" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
