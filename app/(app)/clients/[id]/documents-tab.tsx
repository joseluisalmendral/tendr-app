"use client";

import { useRef, useState, useTransition } from "react";

import {
  CheckCircleIcon,
  FileTextIcon,
  SpinnerGapIcon,
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ExtractionResult } from "@/inngest/extract-document";

import { uploadDocument } from "./actions";
import {
  asExtractionResult,
  deriveSteps,
  errorMessageFor,
  resolveDocumentView,
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

/** A single document card: live job state + the resolved terminal view. */
function DocumentCard({
  doc,
  workspaceId,
}: {
  doc: DocumentRow;
  workspaceId: string;
}) {
  // Subscribe to this document's job. The hook's catch-up read guarantees a
  // terminal state is never missed even if the worker finished before mount.
  const live = useJob(doc.jobId, workspaceId);

  // Live status wins once known; otherwise fall back to the server-loaded one.
  const status: JobStatus | null = live?.status ?? doc.jobStatus;
  const hasMetadata = asExtractionResult(doc.extractedMetadata) !== null;
  const view = resolveDocumentView(status, hasMetadata);

  // Prefer the live result, else the server-loaded extracted metadata.
  const extracted =
    asExtractionResult(live?.result) ?? asExtractionResult(doc.extractedMetadata);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{doc.filename}</span>
        </CardTitle>
        <CardDescription>{formatSize(doc.sizeBytes)}</CardDescription>
      </CardHeader>
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
            <DocumentCard key={doc.id} doc={doc} workspaceId={workspaceId} />
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
