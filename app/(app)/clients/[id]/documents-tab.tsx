"use client";

import { useRef, useState, useTransition } from "react";

import {
  CaretDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  EyeIcon,
  FileTextIcon,
  SpinnerGapIcon,
  TrashIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
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
import type { ExtractionResult } from "@/inngest/extract-document";

import {
  deleteDocument,
  getDocumentSignedUrl,
  uploadDocument,
} from "./actions";
import { canDeleteDocument } from "./delete-document";
import {
  asExtractionResult,
  deriveSteps,
  errorMessageFor,
  resolveDocumentView,
  shouldAutoExpand,
} from "./document-view";
import { useJob, type JobStatus } from "./use-job";

/** A document row shown in the tab (server-loaded, plus its latest job). */
export type DocumentRow = {
  id: string;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  extractedMetadata: unknown;
  /** The latest job for this document, if any (drives live progress). */
  jobId: string | null;
  jobStatus: JobStatus | null;
};

const MAX_BYTES = 10 * 1024 * 1024;

/** Formats a byte count as a short human-readable size. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Per-step progress indicator driven by `jobs.progress`. */
function JobProgress({
  progress,
  status,
}: {
  progress: { step: string; at: string }[];
  status: JobStatus;
}) {
  const steps = deriveSteps(progress, status);
  return (
    <ol className="flex flex-col gap-2">
      {steps.map((s) => (
        <li key={s.step} className="flex items-center gap-2 text-sm">
          {s.state === "done" ? (
            <CheckCircleIcon
              weight="fill"
              className="size-4 shrink-0 text-primary"
            />
          ) : s.state === "active" ? (
            <SpinnerGapIcon className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <span className="size-4 shrink-0 rounded-full border border-muted-foreground/40" />
          )}
          <span
            className={
              s.state === "pending"
                ? "text-muted-foreground"
                : "text-foreground"
            }
          >
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Renders the extracted metadata (fechasClave / importes / partesImplicadas / resumen). */
function ExtractionView({ data }: { data: ExtractionResult }) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      {data.resumen ? (
        <section className="flex flex-col gap-1">
          <h4 className="text-xs font-medium text-muted-foreground">Resumen</h4>
          <p className="text-foreground">{data.resumen}</p>
        </section>
      ) : null}

      {data.fechasClave.length > 0 ? (
        <section className="flex flex-col gap-1">
          <h4 className="text-xs font-medium text-muted-foreground">
            Fechas clave
          </h4>
          <ul className="flex flex-col gap-1">
            {data.fechasClave.map((f, i) => (
              <li key={`${f.fecha}-${i}`} className="flex gap-2">
                <span className="tabular-nums text-muted-foreground">
                  {f.fecha}
                </span>
                <span>{f.descripcion}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.importes.length > 0 ? (
        <section className="flex flex-col gap-1">
          <h4 className="text-xs font-medium text-muted-foreground">Importes</h4>
          <ul className="flex flex-col gap-1">
            {data.importes.map((m, i) => (
              <li key={`${m.descripcion}-${i}`} className="flex gap-2">
                <span className="tabular-nums">
                  {m.cantidad} {m.moneda}
                </span>
                <span className="text-muted-foreground">{m.descripcion}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.partesImplicadas.length > 0 ? (
        <section className="flex flex-col gap-1">
          <h4 className="text-xs font-medium text-muted-foreground">
            Partes implicadas
          </h4>
          <ul className="flex flex-col gap-1">
            {data.partesImplicadas.map((p, i) => (
              <li key={`${p.nombre}-${i}`} className="flex gap-2">
                <span className="font-medium">{p.nombre}</span>
                <span className="text-muted-foreground">{p.rol}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

const NON_TERMINAL_DELETE_REASON =
  "La extracción sigue en curso. Espera a que termine.";

/**
 * Per-row delete affordance. ENABLED only when the document's latest job is
 * terminal (canDeleteDocument); pending/running render it disabled with a
 * visible reason. A confirm dialog (destructive) gates the actual call. On
 * failure the row is kept and the action stays retryable — `deleteDocument` is
 * idempotent, so re-clicking after a partial failure recovers (storage.remove
 * on a now-missing path is non-fatal).
 */
function DeleteDocumentButton({
  documentId,
  clientId,
  filename,
  status,
}: {
  documentId: string;
  clientId: string;
  filename: string;
  status: JobStatus | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const canDelete = canDeleteDocument(status);

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteDocument({ documentId, clientId });
      if (!result.ok) {
        // Keep the row; surface the neutral-Spanish error and allow a re-click
        // (the delete is idempotent on a partial failure).
        setError(result.error);
        return;
      }
      // Success: the row disappears via revalidatePath; just close the dialog.
      setOpen(false);
    });
  }

  if (!canDelete) {
    return (
      <span
        className="text-xs text-muted-foreground"
        title={NON_TERMINAL_DELETE_REASON}
      >
        {NON_TERMINAL_DELETE_REASON}
      </span>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Eliminar documento"
        >
          <TrashIcon className="text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminar documento</DialogTitle>
          <DialogDescription>
            Vas a eliminar «{filename}». El archivo se borra de forma
            permanente; el historial de la extracción se conserva. Esta acción
            no se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={pending}>
              Cancelar
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? (
              <SpinnerGapIcon className="animate-spin" />
            ) : (
              <TrashIcon weight="bold" />
            )}
            {pending ? "Eliminando…" : "Eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Compact status chip shown in a row's header so a COLLAPSED row still
 * communicates its live state without expanding. Driven by the same `status`
 * (live ?? server) the card already computes, so a collapsed active row's chip
 * keeps updating while its detail body is hidden (useJob stays mounted).
 */
function StatusChip({ status }: { status: JobStatus | null }) {
  if (status === "pending" || status === "running") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        <SpinnerGapIcon className="size-3 animate-spin" />
        Procesando
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
        <CheckCircleIcon weight="fill" className="size-3" />
        Listo
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
        <WarningCircleIcon weight="fill" className="size-3" />
        Error
      </span>
    );
  }
  return null;
}

/**
 * Per-row PDF preview. Opens a modal and signs the document's download URL ON
 * OPEN (never at list render, so URLs are fresh and absent from the initial
 * HTML — ADR-4). The signed URL is component-local and re-fetched every open
 * (1h TTL). Three states: loading (spinner), error (neutral-Spanish retry copy,
 * never a hung blank view), ready (iframe embed). A signing failure — including
 * a cross-workspace id blocked by RLS — lands in the error state.
 */
function DocumentPreviewDialog({
  documentId,
  filename,
}: {
  documentId: string;
  filename: string;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startTransition] = useTransition();

  const PREVIEW_ERROR = "No se pudo abrir el documento. Vuelve a intentarlo.";

  // Sign ON OPEN (event-driven, not in an effect): a fresh 1h URL is fetched
  // each time the dialog opens, and transient state is dropped on close so
  // nothing persistent is created or revoked.
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setUrl(null);
      setError(null);
      return;
    }
    setUrl(null);
    setError(null);
    startTransition(async () => {
      try {
        const result = await getDocumentSignedUrl(documentId);
        if (result.ok) {
          setUrl(result.url);
        } else {
          setError(PREVIEW_ERROR);
        }
      } catch {
        setError(PREVIEW_ERROR);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Ver PDF"
        >
          <EyeIcon className="text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate">{filename}</DialogTitle>
          <DialogDescription>Vista previa del documento.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex h-[70vh] w-full items-center justify-center rounded-md border text-sm text-muted-foreground">
            <SpinnerGapIcon className="mr-2 size-4 animate-spin" />
            Cargando documento…
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <WarningCircleIcon weight="fill" className="mt-0.5 size-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : url ? (
          <iframe
            src={url}
            title={filename}
            className="h-[70vh] w-full rounded-md border"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** A single document card: live job state + the resolved terminal view. */
function DocumentCard({
  doc,
  clientId,
  workspaceId,
}: {
  doc: DocumentRow;
  clientId: string;
  workspaceId: string;
}) {
  // Subscribe to this document's job. The hook's catch-up read guarantees a
  // terminal state is never missed even if the worker finished before mount.
  // CRITICAL: this stays mounted regardless of collapse state, so a collapsed
  // active row still receives live updates and its header StatusChip refreshes
  // (collapsing hides only the detail body below, never the hook).
  const live = useJob(doc.jobId, workspaceId);

  // Live status wins once known; otherwise fall back to the server-loaded one.
  const status: JobStatus | null = live?.status ?? doc.jobStatus;
  const hasMetadata = asExtractionResult(doc.extractedMetadata) !== null;
  const view = resolveDocumentView(status, hasMetadata);

  // Prefer the live result, else the server-loaded extracted metadata.
  const extracted =
    asExtractionResult(live?.result) ?? asExtractionResult(doc.extractedMetadata);

  // Per-row collapse state, SEEDED from the SERVER status (deterministic, no
  // hydration drift): an active job auto-expands; terminal/no-job rows start
  // collapsed. After first paint the user's toggle wins — live transitions do
  // NOT force re-expand/collapse. Not persisted (no localStorage — out of scope).
  const [open, setOpen] = useState(() => shouldAutoExpand(doc.jobStatus));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{doc.filename}</span>
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              <span>{formatSize(doc.sizeBytes)}</span>
              <StatusChip status={status} />
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <DocumentPreviewDialog documentId={doc.id} filename={doc.filename} />
            <DeleteDocumentButton
              documentId={doc.id}
              clientId={clientId}
              filename={doc.filename}
              status={status}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-expanded={open}
              aria-label={open ? "Contraer detalle" : "Expandir detalle"}
              onClick={() => setOpen((prev) => !prev)}
            >
              {open ? (
                <CaretUpIcon className="text-muted-foreground" />
              ) : (
                <CaretDownIcon className="text-muted-foreground" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      {open ? (
        <CardContent>
          {view === "progress" ? (
            <JobProgress
              progress={live?.progress ?? []}
              status={status ?? "pending"}
            />
          ) : view === "failed" ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <WarningCircleIcon
                weight="fill"
                className="mt-0.5 size-4 shrink-0"
              />
              <p>{errorMessageFor(live?.error ?? null)}</p>
            </div>
          ) : view === "extracted" && extracted ? (
            <ExtractionView data={extracted} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Esperando la extracción…
            </p>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}

/**
 * Documentos tab: a PDF upload form plus the client's documents, each showing
 * live extraction progress (JobProgress), the extracted result
 * (ExtractionView), or a terminal error. A failed job ALWAYS renders a terminal
 * error card — never an indefinite spinner (spec slice C).
 */
export function DocumentsTab({
  clientId,
  workspaceId,
  documents,
}: {
  clientId: string;
  workspaceId: string;
  documents: DocumentRow[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);

    const file = formData.get("file");
    // Inline client-side validation mirrors the server's Zod rules so the user
    // gets immediate feedback (the server re-validates authoritatively).
    if (!(file instanceof File) || file.size === 0) {
      setError("Elegí un archivo PDF.");
      return;
    }
    if (file.type !== "application/pdf") {
      setError("El archivo debe ser un PDF.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("El PDF no puede superar los 10 MB.");
      return;
    }

    startTransition(async () => {
      const result = await uploadDocument(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Success: the document list re-renders via revalidatePath, and the new
      // document's job is tracked live by its DocumentCard.
      formRef.current?.reset();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        ref={formRef}
        action={onSubmit}
        className="flex flex-col gap-2 rounded-lg border p-4"
      >
        <input type="hidden" name="clientId" value={clientId} />
        <Label htmlFor="file">Subir documento (PDF, máx. 10 MB)</Label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            id="file"
            name="file"
            type="file"
            accept="application/pdf"
            aria-invalid={Boolean(error)}
          />
          <Button type="submit" disabled={pending}>
            {pending ? (
              <SpinnerGapIcon className="animate-spin" />
            ) : (
              <UploadSimpleIcon weight="bold" />
            )}
            {pending ? "Subiendo…" : "Subir"}
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </form>

      {documents.length > 0 ? (
        <div className="flex flex-col gap-3">
          {documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              clientId={clientId}
              workspaceId={workspaceId}
            />
          ))}
        </div>
      ) : (
        <Empty className="rounded-lg border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileTextIcon />
            </EmptyMedia>
            <EmptyTitle>Todavía no hay documentos</EmptyTitle>
            <EmptyDescription>
              Subí un PDF para extraer fechas, importes y partes implicadas
              automáticamente.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
