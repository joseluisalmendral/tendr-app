import type { ReactNode } from "react";

import { SidebarNav } from "@/components/app-shell/sidebar-nav";
import { UserMenu } from "@/components/app-shell/user-menu";

type AppShellProps = {
  workspaceName: string | null;
  email: string | null;
  avatarUrl: string | null;
  children: ReactNode;
};

/**
 * Authenticated application shell: fixed-left sidebar (w-60) + topbar
 * (workspace name left, user menu right) + scrollable content area.
 *
 * Structural only — interactive concerns live in the client children
 * (SidebarNav active marking, UserMenu dropdown). No collapse in v1.
 */
export function AppShell({
  workspaceName,
  email,
  avatarUrl,
  children,
}: AppShellProps) {
  return (
    <div className="flex min-h-svh bg-background">
      <aside className="flex w-60 shrink-0 flex-col gap-6 border-r bg-sidebar p-4">
        <div className="px-3 py-2">
          <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
            {workspaceName ?? "Tendr"}
          </span>
        </div>
        <SidebarNav />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-6">
          <span className="truncate text-sm font-medium text-muted-foreground">
            {workspaceName ?? "Tu workspace"}
          </span>
          <UserMenu email={email} avatarUrl={avatarUrl} />
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
