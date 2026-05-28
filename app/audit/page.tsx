import { getCurrentStaff } from "@/lib/auth/session";
import { requireManager } from "@/lib/auth/require";
import { isForbiddenError, isUnauthenticatedError } from "@/lib/auth/errors";
import { getAuditLog } from "@/lib/actions/audit";
import { ForbiddenView, UnauthenticatedView } from "@/components/auth/auth-error-views";
import { AuditView } from "@/components/audit/audit-view";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  try {
    // The page checks the role to render the 403 view; getAuditLog re-checks
    // it as defense-in-depth (the action is the real gate).
    const actor = await getCurrentStaff();
    requireManager(actor);
  } catch (error) {
    if (isForbiddenError(error)) return <ForbiddenView />;
    if (isUnauthenticatedError(error)) return <UnauthenticatedView />;
    throw error;
  }

  // Ignore a malformed orderId deep-link rather than letting the action's zod
  // throw an uncaught error: an invalid filter simply shows the unfiltered log.
  const { orderId: rawOrderId } = await searchParams;
  const orderId = rawOrderId && UUID_RE.test(rawOrderId) ? rawOrderId : null;
  const initial = await getAuditLog(orderId ? { orderId } : {});

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6">
      <AuditView
        initialEntries={initial.entries}
        initialCursor={initial.nextCursor}
        orderId={orderId}
      />
    </main>
  );
}
