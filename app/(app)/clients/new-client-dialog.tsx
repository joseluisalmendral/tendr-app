"use client";

import { useActionState, useRef, useState } from "react";

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
 * "Nuevo cliente" dialog. The form is driven by `useActionState` (design §4
 * progressive-enhancement convention) wrapping a local action that dispatches
 * the optimistic insert INSIDE the action's transition, BEFORE awaiting the
 * server. This is the canonical React 19 pairing of `useActionState` +
 * `useOptimistic`:
 *
 *   1. The action runs inside the transition `useActionState` owns.
 *   2. `addOptimisticClient(...)` is dispatched synchronously at the start, so
 *      it is a legal optimistic update (inside a transition — no warning).
 *   3. We then `await createClient(...)`. The transition stays pending until
 *      the server action returns AND its `revalidatePath('/clients')` re-pulls
 *      the RSC list, so the base state (`initialClients`) only updates once the
 *      authoritative row is present.
 *   4. When the transition settles, React DISCARDS every optimistic entry and
 *      re-renders from the new base state. The optimistic temp row and the real
 *      row never coexist in a committed frame → no duplicate-row flash.
 *   5. On error the transition settles with the base state unchanged, so the
 *      optimistic row auto-reverts and inline field errors render.
 *
 * Loading is shown via the submit button's `disabled` state plus a spinning
 * icon (CSS-only motion, design §7).
 */
export function NewClientDialog({
  addOptimisticClient,
}: {
  addOptimisticClient: (client: ClientRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, pending] = useActionState(
    async (prevState: CreateClientState, formData: FormData) => {
      // Dispatch the optimistic row INSIDE the action transition, before the
      // server round-trip. Built from the raw form values; the temp id is only
      // ever used as a React key and is discarded when the transition settles.
      const tagsRaw = (formData.get("tags") as string | null) ?? "";
      const optimisticRow: ClientRow = {
        id: `optimistic-${crypto.randomUUID()}`,
        name: ((formData.get("name") as string | null) ?? "").trim(),
        email: ((formData.get("email") as string | null) ?? "").trim() || null,
        company:
          ((formData.get("company") as string | null) ?? "").trim() || null,
        tags: tagsRaw
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
        status: "active",
      };
      addOptimisticClient(optimisticRow);

      const result = await createClient(prevState, formData);

      // Close + reset only on success; the optimistic overlay is reconciled
      // automatically when the revalidated base state arrives.
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
            Agrega un cliente a tu workspace. Solo el nombre es obligatorio.
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
