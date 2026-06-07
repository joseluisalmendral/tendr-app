import type { ExtractionResult } from "@/inngest/extract-document";

import type { JobErrorResult, JobProgressEntry, JobStatus } from "./use-job";

/**
 * Pure presentation logic for the Documents tab (JobProgress / ExtractionView /
 * error states). Factored out of the React components so the terminal-state
 * guarantees — a failed job NEVER hangs the UI — are unit-testable without a
 * DOM, matching the project convention of testing the logic behind components
 * (cf. createCaseInWorkspace behind CasesTab).
 */

/** The five worker steps, in order, used to render per-step progress. */
export const EXTRACTION_STEPS = [
  "mark-running",
  "lookup-model",
  "create-signed-url",
  "extract",
  "persist",
] as const;

export type ExtractionStep = (typeof EXTRACTION_STEPS)[number];

/** Spanish (neutral) labels for each worker step. */
export const STEP_LABELS: Record<ExtractionStep, string> = {
  "mark-running": "Iniciando",
  "lookup-model": "Seleccionando modelo",
  "create-signed-url": "Preparando documento",
  extract: "Extrayendo datos",
  persist: "Guardando resultado",
};

export type StepDisplayState = "done" | "active" | "pending";

export type StepDisplay = {
  step: ExtractionStep;
  label: string;
  state: StepDisplayState;
};

/**
 * Derives the per-step display from the worker's `jobs.progress` array and the
 * job status. A step is `done` once it appears in progress; the first step not
 * yet in progress is `active` while the job is still running; the rest are
 * `pending`. On a terminal job no step is left `active` (no dangling spinner).
 */
export function deriveSteps(
  progress: JobProgressEntry[],
  status: JobStatus,
): StepDisplay[] {
  const completed = new Set(progress.map((p) => p.step));
  let activeAssigned = false;
  const running = status === "pending" || status === "running";

  return EXTRACTION_STEPS.map((step) => {
    if (completed.has(step)) {
      return { step, label: STEP_LABELS[step], state: "done" as const };
    }
    if (running && !activeAssigned) {
      activeAssigned = true;
      return { step, label: STEP_LABELS[step], state: "active" as const };
    }
    return { step, label: STEP_LABELS[step], state: "pending" as const };
  });
}

/** Maps an error_code to a neutral Spanish message the user can act on. */
const ERROR_MESSAGES: Record<string, string> = {
  validation_error: "El documento no pudo procesarse: el formato no es válido.",
  provider_error:
    "El servicio de extracción falló. Vuelve a intentarlo más tarde.",
  invalid_api_key: "La clave del proveedor de IA no es válida.",
  document_error: "No se pudo leer el documento. Verifica que el PDF sea válido.",
};

const DEFAULT_ERROR_MESSAGE =
  "La extracción falló. Vuelve a intentarlo más tarde.";

/** Human-facing message for a structured job error (never an empty/raw code). */
export function errorMessageFor(error: JobErrorResult | null): string {
  if (error?.error_code && ERROR_MESSAGES[error.error_code]) {
    return ERROR_MESSAGES[error.error_code];
  }
  if (error?.message) return error.message;
  return DEFAULT_ERROR_MESSAGE;
}

export type DocumentViewMode =
  | "idle" // no job yet (just uploaded, awaiting first realtime/catch-up)
  | "progress" // pending/running — show JobProgress
  | "extracted" // completed — show ExtractionView
  | "failed"; // failed — show terminal error (NEVER a spinner)

/**
 * Resolves which terminal/transient view to render for a document.
 *
 * CRITICAL invariant (spec slice C): every non-running status maps to a
 * TERMINAL view. `failed` -> 'failed' (error card), `completed` -> 'extracted'.
 * There is no status that maps to an indefinite spinner, so a failed job can
 * never hang the UI. `null` status (no job tracked yet) shows the existing
 * extracted metadata if present, else idle.
 */
export function resolveDocumentView(
  status: JobStatus | null,
  hasExtractedMetadata: boolean,
): DocumentViewMode {
  if (status === "failed") return "failed";
  if (status === "completed") return "extracted";
  if (status === "pending" || status === "running") return "progress";
  // No live job: fall back to whatever was already extracted.
  return hasExtractedMetadata ? "extracted" : "idle";
}

/**
 * Decides whether a document row should render EXPANDED on first paint, based on
 * its server-loaded latest-job status. A `pending`/`running` job auto-expands so
 * live extraction progress is visible without a click (design fork 3); every
 * terminal status (`completed`/`failed`) and `null` (no job) starts collapsed to
 * keep a multi-document client scannable.
 *
 * This is the SEED only — once mounted, the user's toggle wins; live status
 * transitions do NOT force re-expand/collapse. Pure so it is unit-testable
 * without a DOM, matching the document-view.ts convention.
 */
export function shouldAutoExpand(status: JobStatus | null): boolean {
  return status === "pending" || status === "running";
}

/** Narrow unknown extracted metadata to the extraction contract, defensively. */
export function asExtractionResult(value: unknown): ExtractionResult | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<ExtractionResult>;
  if (
    Array.isArray(v.fechasClave) &&
    Array.isArray(v.importes) &&
    Array.isArray(v.partesImplicadas) &&
    typeof v.resumen === "string"
  ) {
    return v as ExtractionResult;
  }
  return null;
}
