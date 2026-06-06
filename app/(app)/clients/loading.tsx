import { Skeleton } from "@/components/ui/skeleton";

/**
 * /clients loading skeleton. Mirrors app/(app)/clients/page.tsx + ClientsTable:
 * title block, the toolbar (search input + status/tag selects + new-client
 * button), and table header plus a few rows. Shown during the Drizzle read.
 */
export default function ClientsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      {/* Title block */}
      <div className="flex flex-col gap-1">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-52" />
      </div>

      <div className="flex flex-col gap-4">
        {/* Toolbar: search + two selects + new-client button */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <Skeleton className="h-9 w-full sm:max-w-xs" />
            <Skeleton className="h-9 w-full sm:w-36" />
            <Skeleton className="h-9 w-full sm:w-36" />
          </div>
          <Skeleton className="h-9 w-full sm:w-32" />
        </div>

        {/* Table header + rows */}
        <div className="overflow-hidden rounded-lg border">
          <div className="flex items-center gap-4 border-b px-4 py-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-4 flex-1" />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-2.5">
              {Array.from({ length: 5 }).map((__, j) => (
                <Skeleton key={j} className="h-4 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
