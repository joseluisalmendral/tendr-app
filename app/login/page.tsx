"use client";

import { useActionState } from "react";

import { sendMagicLink, type SendMagicLinkState } from "./actions";

const initialState: SendMagicLinkState = { status: "idle" };

/**
 * Login / account-promotion page.
 *
 * Three UX states driven by the `sendMagicLink` Server Action:
 *   - idle:  the email form
 *   - sent:  generic "check your email" confirmation (identical regardless of
 *            whether the email already exists — no user enumeration)
 *   - error: a generic, non-enumerating error message; the form stays usable
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

  if (state.status === "sent") {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-4 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Revisá tu correo</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Si la dirección es válida, te enviamos un enlace para acceder. Abrí el
          correo desde este mismo dispositivo para completar el ingreso.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Ingresá a Tendr</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Te enviamos un enlace de acceso a tu correo. No necesitás contraseña.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Correo electrónico
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={state.status === "error"}
            aria-describedby={state.status === "error" ? "email-error" : undefined}
            className="rounded-md border border-zinc-300 px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus-visible:ring-zinc-100"
          />
          {state.status === "error" ? (
            <p id="email-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
              {state.message}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-3 py-2 text-base font-medium text-zinc-50 transition-colors hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pending ? "Enviando…" : "Enviar enlace de acceso"}
        </button>
      </form>
    </main>
  );
}
