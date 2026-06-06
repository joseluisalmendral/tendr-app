"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";

import { PlusIcon, SpinnerGapIcon } from "@phosphor-icons/react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { createClient, type CreateClientState } from "./actions";
import type { ClientRow } from "./clients-table";

const INITIAL_STATE: CreateClientState = { status: "idle" };

/**
 * "Nuevo cliente" dialog. The form is driven by `useActionState(createClient)`
 * (progressive-enhancement form action, design §4 convention). On success it
 * hands the created client to `onCreated` (table-level optimistic prepend),
 * closes the dialog and resets the form; on error it renders inline field
 * errors below each input. Loading is shown via the submit button's `disabled`
 * state plus a spinning icon (CSS-only motion, design §7).
 */
export function NewClientDialog({
  onCreated,
}: {
  onCreated: (client: ClientRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    createClient,
    INITIAL_STATE,
  );
  const formRef = useRef<HTMLFormElement>(null);
  // Tracks which result we already consumed so the success effect fires once.
  const consumedClientId = useRef<string | null>(null);

  useEffect(() => {
    if (state.status === "success") {
      if (consumedClientId.current === state.client.id) return;
      consumedClientId.current = state.client.id;
      onCreated({
        id: state.client.id,
        name: state.client.name,
        email: state.client.email,
        company: state.client.company,
        tags: state.client.tags,
        status: state.client.status,
      });
      setOpen(false);
      formRef.current?.reset();
    }
  }, [state, onCreated]);

  const fieldErrors =
    state.status === "error" ? (state.fieldErrors ?? {}) : {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon weight="bold" />
          Nuevo cliente
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
          <DialogDescription>
            Agregá un cliente a tu workspace. Solo el nombre es obligatorio.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              name="name"
              required
              autoComplete="off"
              aria-invalid={Boolean(fieldErrors.name)}
            />
            {fieldErrors.name ? (
              <p className="text-sm text-destructive">{fieldErrors.name}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="off"
              aria-invalid={Boolean(fieldErrors.email)}
            />
            {fieldErrors.email ? (
              <p className="text-sm text-destructive">{fieldErrors.email}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="company">Empresa</Label>
            <Input id="company" name="company" autoComplete="off" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="tags">Etiquetas</Label>
            <Input
              id="tags"
              name="tags"
              placeholder="Separadas por comas: vip, recurrente"
              autoComplete="off"
            />
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
              {pending ? "Creando…" : "Crear cliente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
