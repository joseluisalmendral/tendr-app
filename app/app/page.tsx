import Link from "next/link";

import { ensureAnonymousWorkspace, logout } from "@/app/(auth)/actions";
import { getCurrentWorkspace } from "@/lib/auth/get-current-workspace";

/**
 * Minimal authenticated landing.
 *
 * Resolves the current workspace; if the user has none yet (a fresh anonymous
 * visitor), provisions one via ensureAnonymousWorkspace. Renders distinct
 * anonymous vs permanent-account states and always exposes a logout button.
 *
 * The proxy guarantees a session before this RSC runs, so getCurrentWorkspace
 * never returns null here in practice — we still handle it defensively.
 */
export default async function AppPage() {
  let current = await getCurrentWorkspace();

  if (current && current.workspaceId === null) {
    // No workspace yet: provision one, then re-read so render reflects it.
    await ensureAnonymousWorkspace();
    current = await getCurrentWorkspace();
  }

  if (!current) {
    // Defensive: should be unreachable because the proxy mints a session.
    return (
      <main className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center gap-4 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">No hay sesión</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Volvé a{" "}
          <Link href="/login" className="underline">
            iniciar sesión
          </Link>
          .
        </p>
      </main>
    );
  }

  const { isAnonymous } = current;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Tu workspace</h1>
        {isAnonymous ? (
          <p className="text-zinc-600 dark:text-zinc-400">
            Estás usando Tendr de forma anónima. Tus datos se guardan en este
            navegador. Vinculá un correo para no perderlos y acceder desde otros
            dispositivos.
          </p>
        ) : (
          <p className="text-zinc-600 dark:text-zinc-400">
            Tu cuenta está activa y vinculada a tu correo.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {isAnonymous ? (
          <Link
            href="/login"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Vincular un correo
          </Link>
        ) : null}

        <form action={logout}>
          <button
            type="submit"
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </main>
  );
}
