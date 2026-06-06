"use client";

import { useActionState, useRef, useState } from "react";

import { BriefcaseIcon, PlusIcon, SpinnerGapIcon } from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

import { createCase, type CreateCaseState } from "./actions";
import type { CaseRow } from "./client-detail-tabs";
import { CASE_STATUS_VALUES, type CaseStatus } from "./create-case";

const INITIAL_STATE: CreateCaseState = { status: "idle" };

const STATUS_LABELS: Record<CaseStatus, string> = {
  prospect: "Prospecto",
  proposal: "Propuesta",
  active: "Activo",
  closed_won: "Ganado",
  closed_lost: "Perdido",
};

const STATUS_VARIANT: Record<
  CaseStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  prospect: "outline",
  proposal: "secondary",
  active: "default",
  closed_won: "default",
  closed_lost: "destructive",
};

/** Formats integer cents as a localized ARS-style amount, or em dash if absent. */
function formatValue(valueCents: number | null): string {
  if (valueCents === null) return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(valueCents / 100);
}

/**
 * Casos tab: the client's cases plus a "Nuevo caso" dialog. The dialog mirrors
 * the slice B optimistic-inside-transition pattern — the local `useActionState`
 * action dispatches `addOptimisticCase` SYNCHRONOUSLY at the start (inside the
 * transition React owns, so it is a legal optimistic update) before awaiting
 * the server action. When the transition settles after `revalidatePath`, the
 * optimistic overlay is dropped atomically and the authoritative row renders.
 */
export function CasesTab({
  clientId,
  cases,
  addOptimisticCase,
}: {
  clientId: string;
  cases: CaseRow[];
  addOptimisticCase: (newCase: CaseRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, pending] = useActionState(
    async (prevState: CreateCaseState, formData: FormData) => {
      const valueRaw = ((formData.get("valueCents") as string | null) ?? "")
        .trim();
      const optimisticCase: CaseRow = {
        id: `optimistic-${crypto.randomUUID()}`,
        title: ((formData.get("title") as string | null) ?? "").trim(),
        status:
          ((formData.get("status") as string | null) ?? "prospect") as CaseStatus,
        valueCents: valueRaw.length > 0 ? Number(valueRaw) : null,
        createdAt: new Date().toISOString(),
      };
      addOptimisticCase(optimisticCase);

      const result = await createCase(prevState, formData);

      if (result.status === "success") {
        setOpen(false);
        formRef.current?.reset();
      }
      return result;
    },
    INITIAL_STATE,
  );

  const fieldErrors =
    state.status === "error" ? (state.fieldErrors ?? {}) : {};

  const newCaseDialog = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon weight="bold" />
          Nuevo caso
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo caso</DialogTitle>
          <DialogDescription>
            Crea un caso para este cliente. Solo el título es obligatorio.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="clientId" value={clientId} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              name="title"
              required
              autoComplete="off"
              aria-invalid={Boolean(fieldErrors.title)}
            />
            {fieldErrors.title ? (
              <p className="text-sm text-destructive">{fieldErrors.title}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="status">Estado</Label>
            <Select name="status" defaultValue="prospect">
              <SelectTrigger id="status" aria-invalid={Boolean(fieldErrors.status)}>
                <SelectValue placeholder="Elegí un estado" />
              </SelectTrigger>
              <SelectContent>
                {CASE_STATUS_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {STATUS_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.status ? (
              <p className="text-sm text-destructive">{fieldErrors.status}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="valueCents">Valor (en centavos)</Label>
            <Input
              id="valueCents"
              name="valueCents"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              placeholder="Opcional, ej: 150000"
              autoComplete="off"
              aria-invalid={Boolean(fieldErrors.valueCents)}
            />
            {fieldErrors.valueCents ? (
              <p className="text-sm text-destructive">{fieldErrors.valueCents}</p>
            ) : null}
          </div>

          {state.status === "error" && !state.fieldErrors ? (
            <p className="text-sm text-destructive">{state.message}</p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <SpinnerGapIcon className="animate-spin" />
              ) : (
                <PlusIcon weight="bold" />
              )}
              {pending ? "Creando…" : "Crear caso"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          {cases.length > 0
            ? `${cases.length} ${cases.length === 1 ? "caso" : "casos"}`
            : "Casos"}
        </h2>
        {cases.length > 0 ? newCaseDialog : null}
      </div>

      {cases.length > 0 ? (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((caseRow) => (
                <TableRow key={caseRow.id} className="text-sm">
                  <TableCell className="py-2 font-medium">
                    {caseRow.title}
                  </TableCell>
                  <TableCell className="py-2">
                    <Badge variant={STATUS_VARIANT[caseRow.status]}>
                      {STATUS_LABELS[caseRow.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 text-right tabular-nums text-muted-foreground">
                    {formatValue(caseRow.valueCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <Empty className="rounded-lg border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BriefcaseIcon />
            </EmptyMedia>
            <EmptyTitle>Todavía no hay casos</EmptyTitle>
            <EmptyDescription>
              Crea el primer caso para empezar a seguir el trabajo de este
              cliente.
            </EmptyDescription>
          </EmptyHeader>
          {newCaseDialog}
        </Empty>
      )}
    </div>
  );
}
