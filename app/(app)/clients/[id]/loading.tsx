import { Skeleton } from "@/components/ui/skeleton";

/**
 * /clients/[id] loading skeleton. Mirrors app/(app)/clients/[id]/page.tsx +
 * ClientDetailTabs: back link, header block (name/company/email + status/tag
 * badges), the 4-item tabs bar, and content rows. Shown during the parallel
 * client + cases + notes Drizzle reads.
 */
export default function ClientDetailLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-4">
        {/* Back link */}
        <Skeleton className="h-4 w-32" />

        {/* Header: name/company/email + badges */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        </div>
      </div>

      {/* Tabs bar (Casos / Notas / Documentos / Plantillas) */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24" />
        ))}
      </div>

      {/* Tab content rows */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
