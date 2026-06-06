import Link from "next/link";

import { UsersIcon } from "@phosphor-icons/react/ssr";

import { ensureAnonymousWorkspace } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { getCurrentWorkspace } from "@/lib/auth/get-current-workspace";

import { DashboardCards } from "./dashboard-cards";
import { getRecentActivity } from "./dashboard-activity";
import { getDashboardCounts } from "./dashboard-data";
import { RecentActivity } from "./recent-activity";

/**
 * Dashboard home. The (app) layout already guarantees a session (it redirects
 * to /login on null), so getCurrentWorkspace resolves here. A fresh anonymous
 * visitor may not have a workspace yet — provision one, then re-read.
 *
 * Counts come from SQL aggregation (no row over-fetch); recent activity from
 * audit_log via the user-JWT path with a cases fallback.
 */
export default async function DashboardPage() {
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
  const [counts, activity] = await Promise.all([
    getDashboardCounts(workspaceId),
    getRecentActivity(workspaceId),
  ]);

  const hasData = counts.clientCount > 0 || counts.totalCases > 0;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Inicio</h1>
        <p className="text-sm text-muted-foreground">
          Un vistazo a tus clientes y casos.
        </p>
      </div>

      {hasData ? (
        <>
          <DashboardCards
            clientCount={counts.clientCount}
            caseBuckets={counts.caseBuckets}
          />
          <RecentActivity data={activity} />
        </>
      ) : (
        <Empty className="rounded-lg border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
            <EmptyTitle>Aún no tienes clientes</EmptyTitle>
            <EmptyDescription>
              Crea el primero para empezar a organizar tus casos.
            </EmptyDescription>
          </EmptyHeader>
          <Button asChild>
            <Link href="/clients">Crear el primero</Link>
          </Button>
        </Empty>
      )}
    </div>
  );
}
