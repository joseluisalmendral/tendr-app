"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  HouseIcon,
  UsersIcon,
  KanbanIcon,
  GearIcon,
  type Icon,
} from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: Icon;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/app", label: "Inicio", icon: HouseIcon },
  { href: "/clients", label: "Clientes", icon: UsersIcon },
  { href: "/kanban", label: "Kanban", icon: KanbanIcon },
  { href: "/settings/ai", label: "Ajustes", icon: GearIcon },
];

/**
 * Sidebar navigation. Marks the active item via usePathname: the dashboard
 * (/app) matches exactly, the rest match on prefix so nested routes
 * (e.g. /clients/[id]) keep their parent link active.
 */
export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, label, icon: NavIcon }) => {
        const isActive =
          href === "/app" ? pathname === "/app" : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent",
              isActive && "bg-sidebar-accent font-medium",
            )}
          >
            <NavIcon className="size-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
