import { getCurrentStaff } from "@/lib/auth/session";
import { getIdentity } from "@/lib/auth/identity";
import { requireManager } from "@/lib/auth/require";
import { isForbiddenError, isUnauthenticatedError } from "@/lib/auth/errors";
import { getOutsideHoursOrders } from "@/lib/actions/orders";
import { mintRealtimeToken } from "@/lib/realtime/token";
import { ForbiddenView, UnauthenticatedView } from "@/components/auth/auth-error-views";
import { OutsideHoursList } from "@/components/outside-hours/outside-hours-list";

export default async function OutsideHoursPage() {
  try {
    const actor = await getCurrentStaff();
    requireManager(actor);
  } catch (error) {
    if (isForbiddenError(error)) return <ForbiddenView />;
    if (isUnauthenticatedError(error)) return <UnauthenticatedView />;
    throw error;
  }

  const [initial, identity] = await Promise.all([getOutsideHoursOrders(), getIdentity()]);
  const realtimeJwt = await mintRealtimeToken(identity);

  return (
    <div className="mx-auto max-w-3xl">
      <OutsideHoursList initialOrders={initial} realtimeJwt={realtimeJwt} />
    </div>
  );
}
