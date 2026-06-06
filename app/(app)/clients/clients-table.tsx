"use client";

import { useMemo, useOptimistic, useState } from "react";

import { UsersIcon } from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { NewClientDialog } from "./new-client-dialog";

export type ClientRow = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  tags: string[] | null;
  status: "active" | "archived" | null;
};

type StatusFilter = "all" | "active" | "archived";
const ALL_TAGS = "__all__";

const STATUS_LABELS: Record<"active" | "archived", string> = {
  active: "Activo",
  archived: "Archivado",
};

/**
 * Client list table (fork #2: optimistic state lives HERE, at table level).
 *
 * `useOptimistic` overlays a just-created client on top of the server-rendered
 * rows so it appears instantly; once `revalidatePath` re-renders the RSC with
 * the authoritative row, the overlay is dropped (auto-settle). Search, status,
 * and tag filters run client-side over the optimistic list — no Realtime in
 * this slice (design §6: Realtime arrives globally in slice D).
 */
export function ClientsTable({
  initialClients,
}: {
  initialClients: ClientRow[];
}) {
  const [optimisticClients, addOptimisticClient] = useOptimistic(
    initialClients,
    (state: ClientRow[], newClient: ClientRow) => [newClient, ...state],
  );

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [tagFilter, setTagFilter] = useState<string>(ALL_TAGS);

  // Distinct tags across the fetched page, for the tag <Select>.
  const availableTags = useMemo(() => {
    const set = new Set<string>();
    for (const client of optimisticClients) {
      for (const tag of client.tags ?? []) set.add(tag);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [optimisticClients]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return optimisticClients.filter((client) => {
      const effectiveStatus = client.status ?? "active";
      if (statusFilter !== "all" && effectiveStatus !== statusFilter) {
        return false;
      }
      if (tagFilter !== ALL_TAGS && !(client.tags ?? []).includes(tagFilter)) {
        return false;
      }
      if (query.length > 0) {
        const haystack = [client.name, client.email, client.company]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [optimisticClients, search, statusFilter, tagFilter]);

  const hasClients = optimisticClients.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            type="search"
            placeholder="Buscar por nombre, email o empresa"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="sm:max-w-xs"
            aria-label="Buscar clientes"
          />
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
          >
            <SelectTrigger className="sm:w-36" aria-label="Filtrar por estado">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Activos</SelectItem>
              <SelectItem value="archived">Archivados</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="sm:w-36" aria-label="Filtrar por etiqueta">
              <SelectValue placeholder="Etiqueta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TAGS}>Todas las etiquetas</SelectItem>
              {availableTags.map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <NewClientDialog onCreated={addOptimisticClient} />
      </div>

      {hasClients ? (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Etiquetas</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length > 0 ? (
                filtered.map((client) => (
                  <TableRow key={client.id} className="text-sm">
                    <TableCell className="py-2 font-medium">
                      {client.name}
                    </TableCell>
                    <TableCell className="py-2 text-muted-foreground">
                      {client.email ?? "—"}
                    </TableCell>
                    <TableCell className="py-2 text-muted-foreground">
                      {client.company ?? "—"}
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {(client.tags ?? []).length > 0 ? (
                          (client.tags ?? []).map((tag) => (
                            <Badge key={tag} variant="secondary">
                              {tag}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge
                        variant={
                          (client.status ?? "active") === "active"
                            ? "default"
                            : "outline"
                        }
                      >
                        {STATUS_LABELS[client.status ?? "active"]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    Ningún cliente coincide con los filtros.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <Empty className="rounded-lg border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
            <EmptyTitle>Aún no tenés clientes</EmptyTitle>
            <EmptyDescription>
              Creá el primero para empezar a organizar tus casos.
            </EmptyDescription>
          </EmptyHeader>
          <NewClientDialog onCreated={addOptimisticClient} />
        </Empty>
      )}
    </div>
  );
}
