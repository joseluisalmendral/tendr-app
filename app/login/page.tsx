"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { sendMagicLink, type SendMagicLinkState } from "./actions";

const initialState: SendMagicLinkState = { status: "idle" };

/**
 * Login / account-promotion page.
 *
 * Four UX states driven by the `sendMagicLink` Server Action:
 *   - idle:     the email form
 *   - sent:     generic "check your email" confirmation (identical regardless
 *               of whether the email already exists — no user enumeration)
 *   - promoted: only when Supabase email confirmations are disabled and the
 *               anonymous session was linked in-place (no email was sent)
 *   - error:    a generic, non-enumerating error message; the form stays usable
 *
 * Anonymous visitors are allowed here (the proxy permits /login). Submitting an
 * email attaches it to their current anonymous user so auth.uid() is preserved
 * after confirmation.
 */
export default function LoginPage() {
  const [state, formAction, pending] = useActionState(
    sendMagicLink,
    initialState,
  );

  if (state.status === "promoted") {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-4 px-6 py-16">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Cuenta vinculada
        </h1>
        <p className="text-muted-foreground">
          Asociamos tu correo a esta sesión. Ya puedes seguir usando tu cuenta
          con normalidad.
        </p>
      </main>
    );
  }

  if (state.status === "sent") {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-4 px-6 py-16">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Revisa tu correo</h1>
        <p className="text-muted-foreground">
          Si la dirección es válida, te enviamos un enlace para acceder. Abre el
          correo desde este mismo dispositivo para completar el ingreso.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Accede a Tendr</h1>
        <p className="text-muted-foreground">
          Te enviamos un enlace de acceso a tu correo. No necesitas contraseña.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Correo electrónico</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={state.status === "error"}
            aria-describedby={state.status === "error" ? "email-error" : undefined}
          />
          {state.status === "error" ? (
            <p id="email-error" role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          ) : null}
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? "Enviando…" : "Enviar enlace de acceso"}
        </Button>
      </form>
    </main>
  );
}
