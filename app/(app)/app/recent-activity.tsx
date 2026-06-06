import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/ssr";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";

import type { RecentActivity as RecentActivityData } from "./dashboard-activity";

const RELATIVE = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

/** Coarse relative time ("hace 3 h"); avoids per-locale date noise. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = then - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  if (Math.abs(diffMin) < 60) return RELATIVE.format(diffMin, "minute");
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return RELATIVE.format(diffHr, "hour");
  return RELATIVE.format(Math.round(diffHr / 24), "day");
}

export function RecentActivity({ data }: { data: RecentActivityData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Actividad reciente</CardTitle>
        <CardDescription>
          {data.source === "audit"
            ? "Últimos eventos de tu workspace"
            : "Últimos casos actualizados"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ClockCounterClockwiseIcon />
              </EmptyMedia>
              <EmptyTitle>Sin actividad todavía</EmptyTitle>
              <EmptyDescription>
                Cuando trabajes en tus casos y clientes, vas a verlo acá.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col">
            {data.items.map((item, index) => (
              <li key={item.id}>
                {index > 0 ? <Separator className="my-1" /> : null}
                <div className="flex items-center justify-between gap-4 py-2 text-sm">
                  <span className="truncate">{item.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {relativeTime(item.at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
