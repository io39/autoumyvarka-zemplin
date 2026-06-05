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
import { resolveSelectionLines, totalDurationMin } from "@/lib/orders/booking";
import { BookingWizard } from "@/components/orders/wizard/BookingWizard";
import type { PickedSlot } from "@/components/orders/wizard/types";

/**
 * "Zmeniť čas" edit surface (spec 16 §2.9, manager-only). Mounts the booking
 * wizard in edit mode: client/car prefilled + locked, opened on the Služby step
 * (manual "Trvanie" override + service edits available) → Termín to pick a new
 * slot. Finishing applies the diff to this order (service add/remove + moveOrder,
 * which also persists the duration override) rather than creating one.
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

  // Prefill the manual "Trvanie" override only when the order's duration differs
  // from the service-derived baseline (i.e. it really was overridden), so saving
  // without touching it keeps the duration as-is rather than reverting to the sum.
  const baselineDuration = totalDurationMin(
    resolveSelectionLines(selections, services, car.pricing_category),
  );
  const overrideMin = order.duration_min !== baselineDuration ? String(order.duration_min) : "";

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
          overrideMin,
          date: currentSlot.dateKey,
          picked: currentSlot,
          note: order.note,
        }}
        edit={{
          orderId: id,
          originalLines,
          currentSlot,
          originalNote: order.note,
          originalDuration: order.duration_min,
        }}
      />
    </div>
  );
}
