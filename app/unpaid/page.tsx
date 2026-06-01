import { getCurrentStaff } from "@/lib/auth/session";
import { getIdentity } from "@/lib/auth/identity";
import { requireManager } from "@/lib/auth/require";
import { isForbiddenError, isUnauthenticatedError } from "@/lib/auth/errors";
import { getUnpaidOrders } from "@/lib/actions/orders";
import { mintRealtimeToken } from "@/lib/realtime/token";
import { ForbiddenView, UnauthenticatedView } from "@/components/auth/auth-error-views";
import { UnpaidList } from "@/components/unpaid/unpaid-list";

export default async function UnpaidPage() {
  try {
    const actor = await getCurrentStaff();
    requireManager(actor);
  } catch (error) {
    if (isForbiddenError(error)) return <ForbiddenView />;
    if (isUnauthenticatedError(error)) return <UnauthenticatedView />;
    throw error;
  }

  const [initial, identity] = await Promise.all([getUnpaidOrders(), getIdentity()]);
  const realtimeJwt = await mintRealtimeToken(identity);

  return (
    <div className="mx-auto max-w-3xl">
      <UnpaidList
        initialOrders={initial.orders}
        initialOverdueCount={initial.overdueCount}
        initialTodayCount={initial.todayCount}
        realtimeJwt={realtimeJwt}
      />
    </div>
  );
}
