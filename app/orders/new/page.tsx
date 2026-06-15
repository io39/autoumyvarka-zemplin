import { getCurrentStaff } from "@/lib/auth/session";
import { isUnauthenticatedError } from "@/lib/auth/errors";
import { UnauthenticatedView } from "@/components/auth/auth-error-views";
import { listServices } from "@/lib/actions/services";
import { getClientWithCars } from "@/lib/actions/clients";
import { getOpeningHours } from "@/lib/actions/settings";
import { todayKey } from "@/lib/calendar/today";
import { BookingWizard } from "@/components/orders/wizard/BookingWizard";
import type { CarRow, ClientRow } from "@/lib/supabase/types";

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; carId?: string }>;
}) {
  let canPriceOverride = false;
  try {
    const actor = await getCurrentStaff(); // both roles may create
    canPriceOverride = actor.role === "manazer"; // only managers may set the price
  } catch (error) {
    if (isUnauthenticatedError(error)) return <UnauthenticatedView />;
    throw error;
  }

  const params = await searchParams;
  const [services, hours] = await Promise.all([
    listServices({ includeInactive: false }),
    getOpeningHours(),
  ]);

  // Optional client prefill (from a client detail page) → start at step 2 (Auto).
  let client: ClientRow | null = null;
  let cars: CarRow[] = [];
  let sharedCarIds: string[] = [];
  let carId: string | null = null;
  let step = 0;
  if (params.clientId) {
    const data = await getClientWithCars(params.clientId);
    if (data) {
      client = data.client;
      cars = data.cars;
      sharedCarIds = data.sharedCarIds;
      // Honor an explicit ?carId=, else pre-select when the client has one car.
      carId =
        params.carId && data.cars.some((c) => c.id === params.carId)
          ? params.carId
          : data.cars.length === 1
            ? data.cars[0].id
            : null;
      step = 1;
    }
  }

  return (
    <div className="space-y-4">
      <header className="mx-auto max-w-4xl">
        <h1 className="text-xl font-semibold">Nová rezervácia</h1>
      </header>
      <BookingWizard
        mode="create"
        services={services}
        hours={hours}
        canPriceOverride={canPriceOverride}
        initial={{
          step,
          client,
          cars,
          sharedCarIds,
          carId,
          selections: [],
          date: todayKey(new Date()),
          picked: null,
        }}
      />
    </div>
  );
}
