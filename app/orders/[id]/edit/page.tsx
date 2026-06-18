import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentStaff } from "@/lib/auth/session";
import { requireManager } from "@/lib/auth/require";
import { isForbiddenError, isUnauthenticatedError } from "@/lib/auth/errors";
import { ForbiddenView, UnauthenticatedView } from "@/components/auth/auth-error-views";
import { getOrder } from "@/lib/actions/orders";
import { getClientWithCars } from "@/lib/actions/clients";
import { listServices } from "@/lib/actions/services";
import { getOpeningHours } from "@/lib/actions/settings";
import { bratislavaDateKey, bratislavaHHMM } from "@/lib/settings/availability";
import { formatCentsForInput } from "@/lib/services/format";
import { formatCarPrimary } from "@/lib/cars/format";
import { BookingWizard } from "@/components/orders/wizard/BookingWizard";
import type { PickedSlot } from "@/components/orders/wizard/types";

/** Map the `?step=` entry point to the wizard's 0-indexed step. */
const STEP_INDEX: Record<string, number> = { car: 1, services: 2, time: 3 };

/**
 * Order-edit surface (spec 16 §2.9/§2.10, manager-only). Mounts the booking
 * wizard in edit mode with the client locked and the car prefilled. The `?step=`
 * query picks the entry point: `car` → Auto ("Zmeniť"), `services` → Služby
 * ("Pridať služby", default), `time` → Termín ("Zmeniť čas"). The car is
 * switchable only while the order is still `vytvorena` (the re-pricing
 * re-snapshots the lines); then the full car list is loaded for the picker.
 * Finishing applies the diff to this order (changeOrderCar + service add/remove +
 * moveOrder + note/price) rather than creating one.
 */
export default async function EditOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
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
  const { step: stepParam } = await searchParams;
  const [detail, services, hours] = await Promise.all([
    getOrder({ id }),
    listServices({ includeInactive: false }),
    getOpeningHours(),
  ]);
  if (!detail) notFound();

  const { order, client, car } = detail;
  // The car can only be switched while the order is still pending — switching
  // re-prices the lines, which mustn't happen once a wash is done/paid.
  const carEditable = order.status === "vytvorena";
  // The picker needs the client's whole fleet; otherwise just the current car.
  const clientCars = carEditable ? await getClientWithCars(client.id) : null;
  const cars = clientCars?.cars ?? [car];
  const sharedCarIds = clientCars?.sharedCarIds ?? [];
  const initialStep = (stepParam ? STEP_INDEX[stepParam] : undefined) ?? STEP_INDEX.services;
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
          {client.name ?? client.phone} · {formatCarPrimary(car)}
        </p>
      </header>
      <BookingWizard
        mode="edit"
        services={services}
        hours={hours}
        canPriceOverride // edit is manager-only
        canEditCars // edit is manager-only
        lockCar={!carEditable}
        initial={{
          step: initialStep,
          client,
          cars,
          sharedCarIds,
          carId: car.id,
          selections,
          priceOverride:
            order.price_override_cents != null ? formatCentsForInput(order.price_override_cents) : "",
          date: currentSlot.dateKey,
          picked: currentSlot,
          note: order.note,
        }}
        edit={{
          orderId: id,
          originalCarId: car.id,
          originalLines,
          currentSlot,
          originalNote: order.note,
          originalDuration: order.duration_min,
          originalPriceOverrideCents: order.price_override_cents,
        }}
      />
    </div>
  );
}
