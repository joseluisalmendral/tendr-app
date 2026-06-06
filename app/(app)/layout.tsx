import type { ReactNode } from "react";

import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { requireSession } from "@/lib/auth/require-session";

/**
 * Single auth boundary for every (app) route. Verifies a real session
 * server-side via requireSession(); when there is none, redirects to /login
 * and no protected content is sent. Mounts the global <Toaster /> here so all
 * authenticated pages can fire sonner toasts (kanban rollback, etc.).
 */
export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <>
      <AppShell
        workspaceName={session.workspaceName}
        email={session.user.email ?? null}
        avatarUrl={
          (session.user.user_metadata?.avatar_url as string | undefined) ??
          null
        }
      >
        {children}
      </AppShell>
      <Toaster />
    </>
  );
}
