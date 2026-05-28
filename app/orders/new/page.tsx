import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/auth/session";
import { isUnauthenticatedError } from "@/lib/auth/errors";
import { UnauthenticatedView } from "@/components/auth/auth-error-views";
import { listServices } from "@/lib/actions/services";
import { getClientWithCars } from "@/lib/actions/clients";
import { BookingForm } from "@/components/orders/booking-form";

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; carId?: string; date?: string }>;
}) {
  try {
    await getCurrentStaff();
  } catch (error) {
    if (isUnauthenticatedError(error)) return <UnauthenticatedView />;
    throw error;
  }

  const params = await searchParams;
  // Without a client preselected, send the user to the clients page to
  // find/create one. Reusing the spec-02 flow avoids duplicating the
  // unified phone/name/ŠPZ search here.
  if (!params.clientId) {
    redirect("/clients?return=/orders/new");
  }

  const [clientData, services] = await Promise.all([
    getClientWithCars(params.clientId),
    listServices({ includeInactive: false }),
  ]);
  if (!clientData) {
    redirect("/clients?return=/orders/new");
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-3 sm:p-6">
      <BookingForm
        client={clientData.client}
        cars={clientData.cars}
        services={services}
        preselectedCarId={params.carId}
        date={params.date}
      />
    </main>
  );
}
