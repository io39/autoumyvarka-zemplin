import { notFound } from "next/navigation";
import { getCurrentStaff } from "@/lib/auth/session";
import { isUnauthenticatedError } from "@/lib/auth/errors";
import { UnauthenticatedView } from "@/components/auth/auth-error-views";
import { getOrder, getRecentClientVisits, getClientFlags } from "@/lib/actions/orders";
import { getOrderSms } from "@/lib/actions/sms";
import { listServices } from "@/lib/actions/services";
import { getServiceClient } from "@/lib/supabase/server";
import { OrderDetailView } from "@/components/orders/order-detail";

export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let staff;
  try {
    staff = await getCurrentStaff();
  } catch (error) {
    if (isUnauthenticatedError(error)) return <UnauthenticatedView />;
    throw error;
  }

  const { id } = await params;
  const detail = await getOrder({ id });
  if (!detail) notFound();

  const db = getServiceClient();
  const [{ data: workerList, error: workerErr }, services, sms, recentVisits, clientFlags] =
    await Promise.all([
      db.from("workers").select("id, display_name, active").eq("active", true).order("display_name"),
      listServices({ includeInactive: false }),
      getOrderSms({ orderId: id }),
      getRecentClientVisits({ clientId: detail.client.id, excludeOrderId: id, limit: 3 }),
      getClientFlags({ clientId: detail.client.id }),
    ]);
  if (workerErr) throw workerErr;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <OrderDetailView
        role={staff.role}
        detail={detail}
        allWorkers={workerList ?? []}
        services={services}
        sms={sms}
        recentVisits={recentVisits}
        clientFlags={clientFlags}
      />
    </div>
  );
}
