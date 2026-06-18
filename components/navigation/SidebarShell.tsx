"use client";

import { useState } from "react";
import { PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StaffRole } from "@/lib/supabase/types";
import { Sidebar } from "./Sidebar";

interface SidebarShellProps {
  role: StaffRole;
  staffName: string;
  unpaidCount: number;
  realtimeJwt: string;
  children: React.ReactNode;
}

/**
 * Desktop shell wrapper (client) owning the collapsible sidebar state. The
 * sidebar is **collapsed by default**; a floating toggle in the top-left corner
 * (md:+ only) expands it to the full `w-60` Sidebar, and a collapse button in the
 * sidebar header closes it again. While collapsed the main content reclaims the
 * full width (`md:pl-0`).
 *
 * Mobile is unaffected: the Sidebar is always hidden below `md` and the toggle is
 * `md`-only — navigation there stays the BottomNav. State persists across soft
 * navigations (this lives in the root layout) and resets to collapsed on a full
 * reload. The shell owns the app's single `<main>`.
 */
export function SidebarShell({
  role,
  staffName,
  unpaidCount,
  realtimeJwt,
  children,
}: SidebarShellProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      {!expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Zobraziť menu"
          aria-controls="desktop-sidebar"
          aria-expanded={false}
          title="Zobraziť menu"
          className="fixed left-3 top-3 z-40 hidden size-10 items-center justify-center rounded-lg border bg-background text-foreground shadow-md transition-colors hover:bg-accent hover:text-accent-foreground md:inline-flex"
        >
          <PanelLeftOpen className="size-6" aria-hidden />
        </button>
      )}

      <Sidebar
        role={role}
        staffName={staffName}
        unpaidCount={unpaidCount}
        realtimeJwt={realtimeJwt}
        expanded={expanded}
        onCollapse={() => setExpanded(false)}
      />

      <div className={cn(expanded ? "md:pl-60" : "md:pl-0")}>
        {/* Full-width main (no max-w cap): pages that should stay narrow set their
            own `mx-auto max-w-*`. The bottom inset clears the mobile BottomNav
            across the whole 0–md range. */}
        <main className="mx-auto min-w-0 overflow-x-hidden p-3 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-4 sm:pt-4 md:mx-10 md:pb-6">
          {children}
        </main>
      </div>
    </>
  );
}
