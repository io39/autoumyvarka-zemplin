import { getCurrentStaff } from "@/lib/auth/session";
import { getIdentity } from "@/lib/auth/identity";
import { isUnauthenticatedError, isForbiddenError } from "@/lib/auth/errors";
import { mintRealtimeToken } from "@/lib/realtime/token";
import { getUnpaidCount, getOutsideHoursCount } from "@/lib/actions/orders";
import { SidebarShell } from "./SidebarShell";
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
  let outsideHoursCount = 0;
  let realtimeJwt = "";
  if (isManager) {
    // Independent reads — run them concurrently (the token mint + both badge counts).
    [realtimeJwt, unpaidCount, outsideHoursCount] = await Promise.all([
      mintRealtimeToken(await getIdentity()),
      getUnpaidCount(),
      getOutsideHoursCount(),
    ]);
  }

  return (
    <>
      <SidebarShell
        role={staff.role}
        staffName={staff.display_name}
        unpaidCount={unpaidCount}
        outsideHoursCount={outsideHoursCount}
        realtimeJwt={realtimeJwt}
      >
        {children}
      </SidebarShell>
      <BottomNav role={staff.role} />
    </>
  );
}
