"use client";

import { useRef, useState, type ReactNode } from "react";

import { SparkleIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { getBudgetWarningAction } from "./actions";
import { consumeAdaptStream } from "./consume-adapt-stream";
import type { ClientOption } from "./templates-island";
import type { TemplateRow } from "./template-crud";

type Phase = "idle" | "streaming" | "done" | "error";

/**
 * "Adaptar para cliente X" dialog (F7 Block C / PR4b). Picks a workspace client,
 * POSTs to /api/ai/adapt-template, and renders the adaptation LIVE chunk by
 * chunk as a markdown preview via the headless `consumeAdaptStream` helper.
 *
 * Error UX (review-pr4a WARNING-1): pre-stream 4xx/429 errors surface the
 * curated taxonomy message; a mid-stream provider failure is DETECTED (the
 * reader rejects) and shown as a curated message — never a silently truncated
 * adaptation. On dialog close mid-stream we abort the fetch (AbortController);
 * the route's onAbort closes the trace cleanly.
 *
 * After a successful stream the dialog re-reads the budget warning flag and
 * toasts at >=80% (design §7 — the byte stream cannot push the flag itself).
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
  const [phase, setPhase] = useState<Phase>("idle");
  const [output, setOutput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function reset() {
    setPhase("idle");
    setOutput("");
    setErrorMessage(null);
  }

  // Abort any in-flight stream when the dialog closes; reset on full close.
  function handleOpenChange(next: boolean) {
    if (!next) {
      abortRef.current?.abort();
      abortRef.current = null;
      reset();
    }
    setOpen(next);
  }

  async function handleAdapt() {
    if (!clientId) return;
    setPhase("streaming");
    setOutput("");
    setErrorMessage(null);

    const controller = new AbortController();
    abortRef.current = controller;

    let response: Response;
    try {
      response = await fetch("/api/ai/adapt-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: template.id, clientId }),
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Adaptar “{template.name}”</DialogTitle>
          <DialogDescription>
            Elige un cliente y genera una versión personalizada de la plantilla.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex items-end gap-3">
            <div className="flex flex-1 flex-col gap-2">
              <Select
                value={clientId}
                onValueChange={setClientId}
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

          {phase === "error" && errorMessage ? (
            <Alert variant="destructive">
              <AlertTitle>No se pudo adaptar</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}

          {phase === "streaming" || phase === "done" ? (
            <div className="prose prose-sm dark:prose-invert min-h-48 max-w-none rounded-md border p-4 text-sm break-words">
              {output.trim() ? (
                <ReactMarkdown>{output}</ReactMarkdown>
              ) : (
                <p className="text-muted-foreground">Generando…</p>
              )}
            </div>
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
