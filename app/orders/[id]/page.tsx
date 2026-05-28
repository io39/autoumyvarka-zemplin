import { notFound } from "next/navigation";
import { getCurrentStaff } from "@/lib/auth/session";
import { isUnauthenticatedError } from "@/lib/auth/errors";
import { UnauthenticatedView } from "@/components/auth/auth-error-views";
import { getOrder } from "@/lib/actions/orders";
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
  const [{ data: staffList, error: staffErr }, services, sms] = await Promise.all([
    db.from("staff").select("id, display_name, role, active").eq("active", true).order("display_name"),
    listServices({ includeInactive: false }),
    getOrderSms({ orderId: id }),
  ]);
  if (staffErr) throw staffErr;

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-3 sm:p-6">
      <OrderDetailView
        role={staff.role}
        detail={detail}
        allStaff={staffList ?? []}
        services={services}
        sms={sms}
      />
    </main>
  );
}
