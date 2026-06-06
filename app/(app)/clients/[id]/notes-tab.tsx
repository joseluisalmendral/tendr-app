"use client";

import { useActionState, useRef } from "react";

import { NoteIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { createNote, type CreateNoteState } from "./actions";
import type { NoteRow } from "./client-detail-tabs";
import { NOTE_BODY_MAX_LENGTH } from "./create-note";

const INITIAL_STATE: CreateNoteState = { status: "idle" };

/** Formats an ISO timestamp as a localized short date-time. */
function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

/**
 * Notas tab: the client's notes rendered as Markdown (react-markdown with its
 * SAFE defaults — no `rehype-raw` or any raw-HTML plugin, so embedded HTML in a
 * note body is escaped, not executed) plus a Textarea + "Guardar" form.
 *
 * The form mirrors the slice B optimistic-inside-transition pattern: the local
 * `useActionState` action dispatches `addOptimisticNote` SYNCHRONOUSLY at the
 * start (inside the transition React owns) before awaiting the server action.
 * When the transition settles after `revalidatePath`, the optimistic overlay is
 * dropped atomically and the authoritative row renders.
 */
export function NotesTab({
  clientId,
  notes,
  addOptimisticNote,
}: {
  clientId: string;
  notes: NoteRow[];
  addOptimisticNote: (newNote: NoteRow) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, pending] = useActionState(
    async (prevState: CreateNoteState, formData: FormData) => {
      const body = ((formData.get("body") as string | null) ?? "").trim();

      // Only dispatch the optimistic note when the body looks valid; an empty
      // or over-length body will be rejected by the server with a field error.
      if (body.length > 0 && body.length <= NOTE_BODY_MAX_LENGTH) {
        addOptimisticNote({
          id: `optimistic-${crypto.randomUUID()}`,
          body,
          createdAt: new Date().toISOString(),
        });
      }

      const result = await createNote(prevState, formData);

      if (result.status === "success") {
        formRef.current?.reset();
      }
      return result;
    },
    INITIAL_STATE,
  );

  const bodyError =
    state.status === "error" ? state.fieldErrors?.body : undefined;

  return (
    <div className="flex flex-col gap-6">
      <form
        ref={formRef}
        action={formAction}
        className="flex flex-col gap-2 rounded-lg border p-4"
      >
        <input type="hidden" name="clientId" value={clientId} />
        <Label htmlFor="body">Nueva nota</Label>
        <Textarea
          id="body"
          name="body"
          rows={4}
          required
          maxLength={NOTE_BODY_MAX_LENGTH}
          placeholder="Escribe una nota. Soporta Markdown: **negrita**, listas, etc."
          aria-invalid={Boolean(bodyError)}
        />
        {bodyError ? (
          <p className="text-sm text-destructive">{bodyError}</p>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? (
              <SpinnerGapIcon className="animate-spin" />
            ) : (
              <NoteIcon weight="bold" />
            )}
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>

      {notes.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {notes.map((note) => (
            <li key={note.id} className="rounded-lg border p-4">
              <time className="text-xs text-muted-foreground">
                {formatTimestamp(note.createdAt)}
              </time>
              <div className="prose prose-sm dark:prose-invert mt-2 max-w-none text-sm break-words">
                <ReactMarkdown>{note.body}</ReactMarkdown>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty className="rounded-lg border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <NoteIcon />
            </EmptyMedia>
            <EmptyTitle>Todavía no hay notas</EmptyTitle>
            <EmptyDescription>
              Guarda la primera nota para dejar registro de este cliente.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
