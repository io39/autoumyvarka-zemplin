"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import type { StaffRole } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { prevadzkaItems, spravaItems, isActive } from "./navItems";

const ROLE_LABEL: Record<StaffRole, string> = {
  manazer: "Manažér",
  prevadzka: "Prevádzka",
};

interface SidebarProps {
  role: StaffRole;
  staffName: string;
}

/**
 * Desktop sidebar (md:+). Renders the PREVÁDZKA items, and — manager only — a
 * SPRÁVA burger (gear) opening a dropdown of the admin sections. Bottom-anchors
 * the logged-in staff name + role. Active state via usePathname.
 */
export function Sidebar({ role, staffName }: SidebarProps) {
  const pathname = usePathname();
  const isManager = role === "manazer";

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-background md:flex">
      <div className="px-4 py-5">
        <span className="text-sm font-semibold">Autoumyváreň Zemplín</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Bočná navigácia">
        {prevadzkaItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t p-3">
        {isManager && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="mb-2 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Settings className="size-4 shrink-0" aria-hidden />
              Správa
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              {spravaItems.map((item) => (
                <DropdownMenuItem key={item.href} asChild>
                  <Link href={item.href}>{item.label}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="px-3">
          <p className="truncate text-sm font-medium">{staffName}</p>
          <p className="text-xs text-muted-foreground">{ROLE_LABEL[role] ?? role}</p>
        </div>
      </div>
    </aside>
  );
}
