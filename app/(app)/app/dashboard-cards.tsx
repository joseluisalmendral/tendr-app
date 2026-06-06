import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { CaseBuckets } from "./dashboard-data";

type DashboardCardsProps = {
  clientCount: number;
  caseBuckets: CaseBuckets;
};

type Metric = {
  key: string;
  label: string;
  value: number;
  description: string;
};

/**
 * Metric tiles: a clients total plus the 4 case display buckets
 * (prospect / proposal / active / Cerrados). "Cerrados" collapses the DB
 * statuses closed_won + closed_lost; the kanban board keeps all 5 columns.
 */
export function DashboardCards({
  clientCount,
  caseBuckets,
}: DashboardCardsProps) {
  const metrics: Metric[] = [
    {
      key: "clients",
      label: "Clientes",
      value: clientCount,
      description: "Total en tu workspace",
    },
    {
      key: "prospect",
      label: "Prospectos",
      value: caseBuckets.prospect,
      description: "Casos en prospección",
    },
    {
      key: "proposal",
      label: "Propuestas",
      value: caseBuckets.proposal,
      description: "Casos con propuesta enviada",
    },
    {
      key: "active",
      label: "Activos",
      value: caseBuckets.active,
      description: "Casos en curso",
    },
    {
      key: "closed",
      label: "Cerrados",
      value: caseBuckets.closed,
      description: "Ganados y perdidos",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      {metrics.map((metric) => (
        <Card key={metric.key}>
          <CardHeader>
            <CardDescription>{metric.label}</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {metric.value}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {metric.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
