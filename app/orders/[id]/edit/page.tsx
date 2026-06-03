import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentStaff } from "@/lib/auth/session";
import { requireManager } from "@/lib/auth/require";
import { isForbiddenError, isUnauthenticatedError } from "@/lib/auth/errors";
import { ForbiddenView, UnauthenticatedView } from "@/components/auth/auth-error-views";
import { getOrder } from "@/lib/actions/orders";
import { listServices } from "@/lib/actions/services";
import { getOpeningHours } from "@/lib/actions/settings";
import { bratislavaDateKey, bratislavaHHMM } from "@/lib/settings/availability";
import { BookingWizard } from "@/components/orders/wizard/BookingWizard";
import type { PickedSlot } from "@/components/orders/wizard/types";

/**
 * "Zmeniť čas" edit surface (spec 16 §2.9, manager-only). Mounts the booking
 * wizard in edit mode: client/car prefilled + locked, opened on step 3 (Služby)
 * so the manager can adjust services and pick a new slot; finishing applies the
 * diff to this order (service add/remove + moveOrder) rather than creating one.
 */
export default async function EditOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    const actor = await getCurrentStaff();
    requireManager(actor);
  } catch (error) {
    if (isForbiddenError(error)) return <ForbiddenView />;
    if (isUnauthenticatedError(error)) return <UnauthenticatedView />;
    throw error;
  }

  const { id } = await params;
  const [detail, services, hours] = await Promise.all([
    getOrder({ id }),
    listServices({ includeInactive: false }),
    getOpeningHours(),
  ]);
  if (!detail) notFound();

  const { order, client, car } = detail;
  const active = detail.services.filter((s) => !s.removed_at);
  const selections = active.map((l) => ({ serviceId: l.service_id, quantity: l.quantity }));
  const originalLines = active.map((l) => ({
    orderServiceId: l.id,
    serviceId: l.service_id,
    quantity: l.quantity,
  }));
  const start = new Date(order.starts_at);
  const currentSlot: PickedSlot = {
    dateKey: bratislavaDateKey(start),
    box: order.box as 1 | 2,
    localStart: bratislavaHHMM(start),
  };

  return (
    <div className="space-y-4">
      <header className="mx-auto max-w-4xl space-y-1">
        <Link href={`/orders/${id}`} className="text-sm underline underline-offset-4">
          ← Späť na rezerváciu
        </Link>
        <h1 className="text-xl font-semibold">Zmeniť rezerváciu</h1>
        <p className="text-sm text-muted-foreground">
          {client.name ?? client.phone} · {car.spz}
        </p>
      </header>
      <BookingWizard
        mode="edit"
        services={services}
        hours={hours}
        initial={{
          step: 2,
          client,
          cars: [car],
          sharedCarIds: [],
          carId: car.id,
          selections,
          date: currentSlot.dateKey,
          picked: currentSlot,
          note: order.note,
        }}
        edit={{ orderId: id, originalLines, currentSlot, originalNote: order.note }}
      />
    </div>
  );
}
