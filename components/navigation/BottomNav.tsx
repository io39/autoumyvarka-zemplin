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

interface BottomNavProps {
  role: StaffRole;
}

/**
 * Mobile bottom nav (md:hidden), fixed to the bottom with a safe-area inset.
 * The three PREVÁDZKA items always; manager also gets a fourth SPRÁVA burger
 * whose dropdown opens upward (side="top"). prevadzka sees only the three.
 */
export function BottomNav({ role }: BottomNavProps) {
  const pathname = usePathname();
  const isManager = role === "manazer";

  const itemClass = (active: boolean) =>
    cn(
      "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors",
      active ? "text-foreground" : "text-muted-foreground",
    );

  return (
    <nav
      aria-label="Spodná navigácia"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {prevadzkaItems.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={itemClass(active)}
          >
            <Icon className="size-5 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}

      {isManager && (
        <DropdownMenu>
          <DropdownMenuTrigger className={itemClass(false)}>
            <Settings className="size-5 shrink-0" aria-hidden />
            Správa
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="w-56">
            {spravaItems.map((item) => (
              <DropdownMenuItem key={item.href} asChild>
                <Link href={item.href}>{item.label}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </nav>
  );
}
