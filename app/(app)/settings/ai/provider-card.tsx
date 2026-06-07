"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";
import { CheckCircleIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import { toast } from "sonner";

import { saveProviderKey } from "@/app/actions/ai-settings";
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
      const result = await saveProviderKey({ provider, key });
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
      <CardContent>
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
      </CardContent>
    </Card>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
