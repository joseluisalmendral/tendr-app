"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";
import {
  FileTextIcon,
  PencilSimpleIcon,
  PlusIcon,
  SparkleIcon,
  SpinnerGapIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { deleteTemplate } from "./actions";
import { AdaptDialog } from "./adapt-dialog";
import { TemplateFormDialog } from "./template-form-dialog";
import type { TemplateRow } from "./template-crud";

export type ClientOption = { id: string; name: string };

/** Localized short date for the "Actualizada" column. */
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
  }).format(new Date(iso));
}

/**
 * /templates interactive island (F7 Block C / PR4b). Renders the workspace
 * template table with per-row actions: Adaptar (streaming dialog), Editar, and
 * Eliminar (confirm dialog). Create lives in the header. The RSC list is the
 * source of truth; after each mutation we router.refresh() so the authoritative
 * rows come straight from the server read.
 */
export function TemplatesIsland({
  initialTemplates,
  clients,
}: {
  initialTemplates: TemplateRow[];
  clients: ClientOption[];
}) {
  const hasTemplates = initialTemplates.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <TemplateFormDialog
          trigger={
            <Button>
              <PlusIcon weight="bold" data-icon="inline-start" />
              Nueva plantilla
            </Button>
          }
        />
      </div>

      {hasTemplates ? (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Variables</TableHead>
                <TableHead>Actualizada</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialTemplates.map((template) => (
                <TableRow key={template.id} className="text-sm">
                  <TableCell className="py-2 font-medium">
                    {template.name}
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex flex-wrap gap-1">
                      {template.variables.length > 0 ? (
                        template.variables.map((v) => (
                          <Badge key={v} variant="secondary">
                            {v}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-muted-foreground">
                    {formatDate(template.updatedAt)}
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex items-center justify-end gap-1">
                      <AdaptDialog
                        template={template}
                        clients={clients}
                        trigger={
                          <Button variant="ghost" size="sm">
                            <SparkleIcon
                              weight="fill"
                              data-icon="inline-start"
                              className="text-support-cobalt-fg"
                            />
                            Adaptar
                          </Button>
                        }
                      />
                      <TemplateFormDialog
                        template={template}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Editar ${template.name}`}
                          >
                            <PencilSimpleIcon />
                          </Button>
                        }
                      />
                      <DeleteTemplateButton template={template} />
                    </div>
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
              <FileTextIcon />
            </EmptyMedia>
            <EmptyTitle>Aún no tienes plantillas</EmptyTitle>
            <EmptyDescription>
              Crea la primera para empezar a adaptarla a tus clientes con IA.
            </EmptyDescription>
          </EmptyHeader>
          <TemplateFormDialog
            trigger={
              <Button>
                <PlusIcon weight="bold" data-icon="inline-start" />
                Nueva plantilla
              </Button>
            }
          />
        </Empty>
      )}
    </div>
  );
}

/**
 * Per-row delete affordance gated by a destructive confirm dialog (matching the
 * documents-tab convention — the repo has no AlertDialog primitive). On failure
 * the row is kept and the action stays retryable.
 */
function DeleteTemplateButton({ template }: { template: TemplateRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteTemplate({ id: template.id });
      if (result.ok) {
        toast.success("Plantilla eliminada");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Eliminar ${template.name}`}
        onClick={() => setOpen(true)}
      >
        <TrashIcon />
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminar plantilla</DialogTitle>
          <DialogDescription>
            Vas a eliminar “{template.name}”. Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={pending}
          >
            {pending ? (
              <SpinnerGapIcon className="animate-spin" data-icon="inline-start" />
            ) : (
              <TrashIcon data-icon="inline-start" />
            )}
            {pending ? "Eliminando…" : "Eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
