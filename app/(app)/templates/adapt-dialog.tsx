"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import {
  CaretDownIcon,
  CheckIcon,
  CopyIcon,
  EnvelopeSimpleIcon,
  SparkleIcon,
  SpinnerGapIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  EmptyTitle,
} from "@/components/ui/empty";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  deleteAdaptationAction,
  getBudgetWarningAction,
  listAdaptationsAction,
  type AdaptationRow,
} from "./actions";
import {
  adaptationModelLabel,
  adaptationSnippet,
  adaptationTimestamp,
  applyDeleteResult,
} from "./adaptation-history";
import { BeautifyEmailPanel } from "./beautify-email-panel";
import { consumeAdaptStream } from "./consume-adapt-stream";
import { EXTRA_INSTRUCTIONS_MAX } from "./template-limits";
import type { ClientOption } from "./templates-island";
import type { TemplateRow } from "./template-crud";

type Phase = "idle" | "streaming" | "done" | "error";

/**
 * "Adaptar para cliente X" dialog (F7 Block C / PR4b; UX extended in F7c PR3b).
 * Picks a workspace client, optionally takes free-text "instrucciones extra",
 * POSTs to /api/ai/adapt-template, and renders the adaptation LIVE chunk by
 * chunk as a markdown preview via the headless `consumeAdaptStream` helper.
 *
 * F7c PR3b additions (decisions #775, finding 3):
 *   - an optional "Instrucciones extra" textarea (bounded by
 *     EXTRA_INSTRUCTIONS_MAX, sent in the POST body — the stream seam persists
 *     it on the adaptation row);
 *   - a Copy button on the just-streamed result (navigator.clipboard);
 *   - a per (template, client) HISTORY list of previously persisted adaptations
 *     (listAdaptationsAction, newest-first) with expand-to-full-markdown, Copy,
 *     and Delete (deleteAdaptationAction) per row.
 *
 * Persistence is automatic server-side (the stream seam's onFinish writes the
 * row); this dialog only READS the history and offers delete. After a stream
 * completes we reload the history so the new row shows immediately.
 *
 * Error UX (review-pr4a WARNING-1): pre-stream 4xx/429 errors surface the
 * curated taxonomy message; a mid-stream provider failure is DETECTED (the
 * reader rejects) and shown as a curated message — never a silently truncated
 * adaptation. On dialog close mid-stream we abort the fetch (AbortController);
 * the route's onAbort closes the trace cleanly.
 *
 * SECRETS/PII: the streamed result + history result text are the user's own
 * workspace PII under RLS — rendered only in their own UI here, NEVER logged or
 * sent to any trace.
 */
export function AdaptDialog({
  template,
  clients,
  trigger,
}: {
  template: TemplateRow;
  clients: ClientOption[];
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState<string>("");
  const [extraInstructions, setExtraInstructions] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [output, setOutput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<AdaptationRow[]>([]);
  // Which history row is expanded. Lifted here (controlled) so the done-state
  // "Convertir en email" entry can expand the freshest adaptation directly.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function reset() {
    setPhase("idle");
    setOutput("");
    setErrorMessage(null);
  }

  // Loads (or reloads) the per (template, client) adaptation history. Defensive:
  // the action never throws to the UI, but we still guard so a transient failure
  // leaves the previous list untouched rather than blanking it.
  const loadHistory = useCallback(
    async (selectedClientId: string) => {
      if (!selectedClientId) {
        setHistory([]);
        return;
      }
      try {
        const rows = await listAdaptationsAction({
          templateId: template.id,
          clientId: selectedClientId,
        });
        setHistory(rows);
      } catch {
        // Non-fatal: keep whatever history we had.
      }
    },
    [template.id],
  );

  // Abort any in-flight stream when the dialog closes; reset on full close.
  function handleOpenChange(next: boolean) {
    if (!next) {
      abortRef.current?.abort();
      abortRef.current = null;
      reset();
      setExtraInstructions("");
      setHistory([]);
      setExpandedId(null);
    }
    setOpen(next);
  }

  function handleClientChange(next: string) {
    setClientId(next);
    reset();
    setExpandedId(null);
    void loadHistory(next);
  }

  async function handleAdapt() {
    if (!clientId) return;
    setPhase("streaming");
    setOutput("");
    setErrorMessage(null);

    const controller = new AbortController();
    abortRef.current = controller;

    const trimmedExtra = extraInstructions.trim();

    let response: Response;
    try {
      response = await fetch("/api/ai/adapt-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: template.id,
          clientId,
          ...(trimmedExtra.length > 0
            ? { extraInstructions: trimmedExtra }
            : {}),
        }),
        signal: controller.signal,
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setPhase("error");
      setErrorMessage("No se pudo conectar. Inténtalo de nuevo.");
      return;
    }

    const result = await consumeAdaptStream(
      response,
      (accumulated) => setOutput(accumulated),
      controller.signal,
    );

    if (result.status === "aborted") return;

    if (result.status === "error") {
      setPhase("error");
      setOutput("");
      setErrorMessage(result.message);
      return;
    }

    setPhase("done");

    // The stream seam persisted the new adaptation in its onFinish; reload the
    // history so it appears at the top without a manual refresh.
    void loadHistory(clientId);

    // Post-stream 80% budget warning (design §7).
    try {
      const warning = await getBudgetWarningAction();
      if (warning) {
        toast.warning("Has superado el 80% del budget mensual de IA.");
      }
    } catch {
      // Non-fatal: the warning toast is best-effort.
    }
  }

  const isStreaming = phase === "streaming";
  const hasClients = clients.length > 0;
  const canCopyOutput = phase === "done" && output.trim().length > 0;
  // The done-state beautify entry needs a persisted row to target; the newest
  // history row (reloaded after the stream) is the just-created adaptation.
  const canBeautify = phase === "done" && history.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Adaptar “{template.name}”</DialogTitle>
            <Badge variant="cobalt">IA</Badge>
          </div>
          <DialogDescription>
            Elige un cliente y genera una versión personalizada de la plantilla.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex items-end gap-3">
            <div className="flex flex-1 flex-col gap-2">
              <Select
                value={clientId}
                onValueChange={handleClientChange}
                disabled={isStreaming || !hasClients}
              >
                <SelectTrigger aria-label="Cliente">
                  <SelectValue
                    placeholder={
                      hasClients
                        ? "Elegir cliente"
                        : "Crea un cliente primero"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              onClick={handleAdapt}
              disabled={isStreaming || !clientId}
            >
              {isStreaming ? (
                <SpinnerGapIcon className="animate-spin" data-icon="inline-start" />
              ) : (
                <SparkleIcon weight="fill" data-icon="inline-start" />
              )}
              {isStreaming ? "Adaptando…" : "Adaptar"}
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="adapt-extra-instructions">
              Instrucciones extra{" "}
              <span className="text-muted-foreground font-normal">
                (opcional)
              </span>
            </Label>
            <Textarea
              id="adapt-extra-instructions"
              value={extraInstructions}
              rows={3}
              maxLength={EXTRA_INSTRUCTIONS_MAX}
              disabled={isStreaming}
              onChange={(e) => setExtraInstructions(e.target.value)}
              placeholder="Ej.: tono más cercano, menciona el plazo de entrega, evita tecnicismos…"
            />
          </div>

          {phase === "error" && errorMessage ? (
            <Alert variant="destructive">
              <AlertTitle>No se pudo adaptar</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}

          {phase === "streaming" || phase === "done" ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Resultado</span>
                {canCopyOutput ? (
                  <CopyButton text={output} label="Copiar resultado" />
                ) : null}
              </div>
              <div className="prose prose-sm dark:prose-invert min-h-48 max-w-none rounded-md border p-4 text-sm break-words">
                {output.trim() ? (
                  <ReactMarkdown>{output}</ReactMarkdown>
                ) : (
                  <p className="text-muted-foreground">Generando…</p>
                )}
              </div>
              {canBeautify ? (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setExpandedId(history[0]!.id)}
                  >
                    <EnvelopeSimpleIcon data-icon="inline-start" />
                    Convertir en email
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {clientId ? (
            <>
              <Separator />
              <AdaptationHistory
                rows={history}
                onChange={setHistory}
                expandedId={expandedId}
                onExpandedChange={setExpandedId}
              />
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Per (template, client) history of persisted adaptations, newest-first. Each
 * row collapses to a one-line snippet + meta and expands to the full markdown,
 * with Copy and Delete. Deletes are optimistic via `onDeleted` (the parent drops
 * the row); a failed delete re-surfaces an error toast (the row stays removed
 * only on success).
 */
function AdaptationHistory({
  rows,
  onChange,
  expandedId,
  onExpandedChange,
}: {
  rows: AdaptationRow[];
  onChange: (rows: AdaptationRow[]) => void;
  /** Controlled expanded-row id (lifted to the dialog so the done-state entry
   * can expand the freshest adaptation). */
  expandedId: string | null;
  onExpandedChange: (id: string | null) => void;
}) {

  // Delete is optimistic-on-success: the pure `applyDeleteResult` decides the
  // new list + which toast to surface, so the policy is testable without a DOM.
  const handleDelete = useCallback(
    async (id: string) => {
      const result = await deleteAdaptationAction({ id });
      const outcome = applyDeleteResult(rows, id, result);
      if (outcome.removed) onChange(outcome.rows);
      if (outcome.toast.kind === "success") toast.success(outcome.toast.message);
      else toast.error(outcome.toast.message);
    },
    [rows, onChange],
  );

  // Patches a row's beautified_* fields in place after a generation so the
  // re-opened panel keeps the latest email (PR-F7C-4b regenerate-in-place).
  const handleBeautified = useCallback(
    (
      id: string,
      email: {
        subject: string;
        preheader: string;
        html: string;
        paletteId: string;
      },
    ) => {
      onChange(
        rows.map((r) =>
          r.id === id
            ? {
                ...r,
                beautifiedHtml: email.html,
                emailSubject: email.subject,
                emailPreheader: email.preheader,
                beautifiedPalette: email.paletteId,
              }
            : r,
        ),
      );
    },
    [rows, onChange],
  );

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Historial</span>
      {rows.length === 0 ? (
        <Empty className="rounded-md border border-dashed py-8">
          <EmptyHeader>
            <EmptyTitle>Sin adaptaciones todavía</EmptyTitle>
            <EmptyDescription>
              Las adaptaciones que generes para este cliente aparecerán aquí.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <AdaptationHistoryRow
              key={row.id}
              row={row}
              expanded={expandedId === row.id}
              onToggle={() =>
                onExpandedChange(expandedId === row.id ? null : row.id)
              }
              onDelete={handleDelete}
              onBeautified={handleBeautified}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AdaptationHistoryRow({
  row,
  expanded,
  onToggle,
  onDelete,
  onBeautified,
}: {
  row: AdaptationRow;
  expanded: boolean;
  onToggle: () => void;
  onDelete: (id: string) => Promise<void>;
  onBeautified: (
    id: string,
    email: {
      subject: string;
      preheader: string;
      html: string;
      paletteId: string;
    },
  ) => void;
}) {
  const [pending, startTransition] = useTransition();
  // The beautify panel mounts on demand; if the row was already beautified we
  // open it pre-populated so the user sees the existing email and can regenerate.
  const [showBeautify, setShowBeautify] = useState(
    Boolean(row.beautifiedHtml),
  );

  function handleDelete() {
    startTransition(() => onDelete(row.id));
  }

  const initialEmail =
    row.beautifiedHtml && row.emailSubject !== null && row.emailPreheader !== null
      ? {
          subject: row.emailSubject,
          preheader: row.emailPreheader,
          html: row.beautifiedHtml,
          paletteId: row.beautifiedPalette ?? "",
        }
      : null;

  return (
    <li className="rounded-md border">
      <div className="flex items-start gap-2 p-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex flex-1 flex-col gap-1 text-left"
        >
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <CaretDownIcon
              className={cn("transition-transform", expanded && "rotate-180")}
            />
            {adaptationTimestamp(row.createdAt)} · {adaptationModelLabel(row)}
          </span>
          {!expanded ? (
            <span className="text-sm break-words">
              {adaptationSnippet(row.resultText)}
            </span>
          ) : null}
        </button>
        <div className="flex items-center gap-1">
          <CopyButton text={row.resultText} label="Copiar adaptación" iconOnly />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Eliminar adaptación"
            disabled={pending}
            onClick={handleDelete}
          >
            {pending ? (
              <SpinnerGapIcon className="animate-spin" />
            ) : (
              <TrashIcon />
            )}
          </Button>
        </div>
      </div>
      {expanded ? (
        <div className="border-t p-3">
          {row.extraInstructions ? (
            <p className="mb-2 text-xs text-muted-foreground break-words">
              Instrucciones extra: {row.extraInstructions}
            </p>
          ) : null}
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm break-words">
            <ReactMarkdown>{row.resultText}</ReactMarkdown>
          </div>

          <Separator className="my-3" />

          {showBeautify ? (
            <BeautifyEmailPanel
              adaptationId={row.id}
              initial={initialEmail}
              onGenerated={(email) => onBeautified(row.id, email)}
            />
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowBeautify(true)}
            >
              <EnvelopeSimpleIcon data-icon="inline-start" />
              Convertir en email
            </Button>
          )}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Copies `text` to the clipboard with transient "copied" feedback. Uses
 * navigator.clipboard (the live UX is verified MANUALLY — clipboard is not
 * exercised in headless tests per the F7 convention).
 */
function CopyButton({
  text,
  label,
  iconOnly = false,
}: {
  text: string;
  label: string;
  iconOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the "copied" reset timer on unmount so it can't fire after the
  // button is gone (no setState-after-unmount).
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar al portapapeles.");
    }
  }

  const Icon = copied ? CheckIcon : CopyIcon;

  if (iconOnly) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={label}
        onClick={handleCopy}
      >
        <Icon />
      </Button>
    );
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
      <Icon data-icon="inline-start" />
      {copied ? "Copiado" : label}
    </Button>
  );
}
