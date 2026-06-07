"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";
import {
  CheckCircleIcon,
  SpinnerGapIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import { deleteProviderKey, saveProviderKey } from "@/app/actions/ai-settings";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ProviderId =
  | "openai"
  | "anthropic"
  | "google"
  | "deepseek"
  | "moonshot";

/**
 * Provider card client island. Shows the configured/not-configured state and a
 * Dialog with a password Input that calls the `saveProviderKey` Server Action.
 *
 * SECRETS HARD-STOP: the key only lives in the controlled input + the single
 * action call. On success the input is cleared, the dialog closes, and the view
 * refreshes (router.refresh) so the new "Configurado" badge + timestamps come
 * straight from the authoritative server read — the key is never echoed back.
 *
 * DEV-LOGGER HARDENING: the key is submitted as a `FormData` field, not as a
 * plain Server Action object argument. Next.js 16's `next dev` action logger
 * prints positional arguments to stdout; a `FormData` instance logs as an opaque
 * object, so the plaintext key never reaches that dev logger (dev only — prod
 * `next start` does not log action args at all).
 */
export function ProviderCard({
  provider,
  label,
  configured,
  keyValidatedAt,
  lastUsedAt,
}: {
  provider: ProviderId;
  label: string;
  configured: boolean;
  keyValidatedAt: string | null;
  lastUsedAt: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      // Submit via FormData so the plaintext key never becomes a plain Server
      // Action argument (Next.js 16 dev logger echoes positional args; FormData
      // logs as an opaque object).
      const formData = new FormData();
      formData.set("provider", provider);
      formData.set("key", key);
      const result = await saveProviderKey(formData);
      if (result.ok) {
        setKey("");
        setOpen(false);
        toast.success("Key validada y cifrada");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">{label}</CardTitle>
            {configured ? (
              <CardDescription>
                {keyValidatedAt
                  ? `Validada ${formatDate(keyValidatedAt)}`
                  : "Validada"}
                {lastUsedAt ? ` · Último uso ${formatDate(lastUsedAt)}` : ""}
              </CardDescription>
            ) : (
              <CardDescription>Sin key configurada.</CardDescription>
            )}
          </div>
          {configured ? (
            <Badge variant="default">
              <CheckCircleIcon weight="fill" data-icon="inline-start" />
              Configurado
            </Badge>
          ) : (
            <Badge variant="secondary">No configurado</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              {configured ? "Cambiar key" : "Configurar key"}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Configurar key de {label}</DialogTitle>
              <DialogDescription>
                Tu key se cifra con AES-256-GCM antes de guardarse. Nunca la
                mandamos a logs ni a Langfuse. Puedes revocarla cuando quieras.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`key-${provider}`}>API key</Label>
                <Input
                  id={`key-${provider}`}
                  type="password"
                  autoComplete="off"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  aria-invalid={Boolean(error)}
                  required
                />
                {error ? (
                  <p className="text-sm text-destructive">{error}</p>
                ) : null}
              </div>
              <DialogFooter>
                <Button type="submit" disabled={pending || key.length === 0}>
                  {pending ? (
                    <SpinnerGapIcon
                      className="animate-spin"
                      data-icon="inline-start"
                    />
                  ) : null}
                  {pending ? "Validando…" : "Guardar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        {configured ? (
          <RevokeKeyButton provider={provider} label={label} />
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Revoke (delete) the configured key for a provider. A destructive confirm
 * dialog gates the call (same Dialog-as-confirmation pattern as the document
 * delete button — the project has no AlertDialog primitive). NO secret is sent:
 * `deleteProviderKey` takes only the provider id. On success the card returns to
 * "No configurado" via router.refresh().
 */
function RevokeKeyButton({
  provider,
  label,
}: {
  provider: ProviderId;
  label: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteProviderKey({ provider });
      if (result.ok) {
        setOpen(false);
        toast.success("Key revocada");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
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
        <Button variant="ghost" size="sm" className="text-destructive">
          <TrashIcon data-icon="inline-start" />
          Revocar key
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Revocar key de {label}</DialogTitle>
          <DialogDescription>
            Vas a eliminar la key cifrada de {label}. Las features que usen este
            provider dejarán de funcionar hasta que configures una nueva key.
            Esta acción no se puede deshacer.
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
              <SpinnerGapIcon className="animate-spin" data-icon="inline-start" />
            ) : (
              <TrashIcon weight="bold" data-icon="inline-start" />
            )}
            {pending ? "Revocando…" : "Revocar key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
