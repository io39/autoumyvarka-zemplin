import { getCurrentStaff } from "@/lib/auth/session";
import { getIdentity } from "@/lib/auth/identity";
import { isUnauthenticatedError, isForbiddenError } from "@/lib/auth/errors";
import { mintRealtimeToken } from "@/lib/realtime/token";
import { getUnpaidCount } from "@/lib/actions/orders";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";

/**
 * Persistent app shell (UI-STRUCTURE §1). Server component: resolves the current
 * actor and decides chrome.
 *
 * - Active staff identity → full shell: desktop Sidebar + the single <main> +
 *   mobile BottomNav, with role driving SPRÁVA visibility.
 * - No active identity (Cloudflare-authenticated but not a provisioned active
 *   staff row) → bare passthrough so each page's own full-screen 401/403 view
 *   fills the viewport.
 *
 * The shell owns the only <main> in the app; pages render plain content.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  let staff;
  try {
    staff = await getCurrentStaff();
  } catch (error) {
    if (isUnauthenticatedError(error) || isForbiddenError(error)) {
      // Chrome-less: the page renders its own 401/403 full-screen view.
      return <>{children}</>;
    }
    throw error;
  }

  // The sidebar carries the manager-only overdue-unpaid badge on desktop. Mint a
  // Realtime token + initial count only for managers (getUnpaidCount throws for
  // workers, and the badge is hidden from them — spec 10 §1.4).
  const isManager = staff.role === "manazer";
  let unpaidCount = 0;
  let realtimeJwt = "";
  if (isManager) {
    realtimeJwt = await mintRealtimeToken(await getIdentity());
    unpaidCount = await getUnpaidCount();
  }

  return (
    <>
      <Sidebar
        role={staff.role}
        staffName={staff.display_name}
        unpaidCount={unpaidCount}
        realtimeJwt={realtimeJwt}
      />
      <div className="md:pl-60">
        {/* Full-width main (no max-w cap): pages that should stay narrow set
            their own `mx-auto max-w-*`; the calendar (app/page.tsx) has none, so
            it fills the width. `mx-3.5` is a small side gutter. The bottom inset
            clears the mobile BottomNav across the whole 0–md range (only the
            top/side padding is bumped at sm), so the clearance isn't lost at sm. */}
        <main className="mx-auto md:mx-10 min-w-0 overflow-x-hidden p-3 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-4 sm:pt-4 md:pb-6">
          {children}
        </main>
      </div>
      <BottomNav role={staff.role} />
    </>
  );
}
