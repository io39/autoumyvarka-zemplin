"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  addOrderService,
  addOrderWorker,
  deleteOrder,
  removeOrderService,
  removeOrderWorker,
  setNote,
  setOrderServicePaid,
  setStatus,
  type OrderDetail,
  type RecentVisit,
} from "@/lib/actions/orders";
import type { ClientFlags } from "@/lib/orders/unpaid";
import { effectiveTotalCents } from "@/lib/orders/booking";
import { resendSms } from "@/lib/actions/sms";
import type { ServiceWithPrices } from "@/lib/actions/services";
import { bratislavaDateDisplay, bratislavaHHMM } from "@/lib/settings/availability";
import type { OrderStatus, SmsMessageRow, StaffRole, WorkerRow } from "@/lib/supabase/types";
import { STATE_LABEL } from "@/types";
import { Button } from "@/components/ui/button";
import { BookingStatusBadge } from "./sections/BookingStatusBadge";
import { BookingStatusActions } from "./sections/BookingStatusActions";
import { BookingClientCard } from "./sections/BookingClientCard";
import { BookingCarCard } from "./sections/BookingCarCard";
import { BookingCarHistoryCard } from "./sections/BookingCarHistoryCard";
import { BookingServicesList } from "./sections/BookingServicesList";
import { BookingWorkerCard } from "./sections/BookingWorkerCard";
import { BookingNotes } from "./sections/BookingNotes";
import { SmsStatusCard } from "./sections/SmsStatusCard";
import { DeleteOrderDialog } from "./sections/DeleteOrderDialog";

type WorkerLite = Pick<WorkerRow, "id" | "display_name" | "active">;

interface OrderDetailBodyProps {
  role: StaffRole;
  detail: OrderDetail;
  allWorkers: WorkerLite[];
  services: ServiceWithPrices[];
  sms: SmsMessageRow[];
  recentVisits: RecentVisit[];
  clientFlags: ClientFlags;
  /** Re-pull the data after a mutation: router.refresh() (page) or refetch (Sheet). */
  onRefresh: () => void;
}

/**
 * The shared order-detail body (UI-STRUCTURE §7, spec 15 §2.2): renders the
 * section cards in §7 order and owns the mutation flow (toast + `onRefresh`).
 * Rendered by both surfaces — the `/orders/[id]` page (`OrderDetailView`) and
 * the calendar popup (`BookingDetailSheet`). All actions/authz are unchanged.
 */
export function OrderDetailBody({
  role,
  detail,
  allWorkers,
  services,
  sms,
  recentVisits,
  clientFlags,
  onRefresh,
}: OrderDetailBodyProps) {
  const [pending, startTransition] = useTransition();
  const { order, client, car } = detail;
  const isManager = role === "manazer";

  const activeServices = detail.services.filter((s) => !s.removed_at);
  const lineSumCents = activeServices.reduce((a, l) => a + l.price_cents_snapshot, 0);
  const totalCents = effectiveTotalCents(lineSumCents, order.price_override_cents);
  const priceOverridden = order.price_override_cents != null;
  const startHHMM = bratislavaHHMM(new Date(order.starts_at));
  const endHHMM = bratislavaHHMM(new Date(order.ends_at));
  const dateDisplay = bratislavaDateDisplay(new Date(order.starts_at));
  const assignableWorkers = allWorkers.filter(
    (w0) => !detail.workers.some((w) => w.worker_id === w0.id),
  );

  function call<T extends { ok: boolean; message?: string }>(label: string, fn: () => Promise<T>) {
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(label);
        onRefresh();
      } else {
        toast.error(r.message ?? "Operácia zlyhala.");
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* §7 #2 Stav + meta */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BookingStatusBadge status={order.status} />
        <span className="text-sm text-muted-foreground">
          Box {order.box} · {startHHMM}–{endHHMM} ({order.duration_min} min) · {dateDisplay}
        </span>
      </div>

      {/* §7 #3 Akcie (manager): Zmeniť čas (left) / Zmazať (right). Zmeniť čas
          opens the wizard edit flow (spec 16 §2.9). */}
      {isManager && (
        <section className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-4">
          <Button asChild variant="outline" size="sm">
            <Link href={`/orders/${order.id}/edit`}>Zmeniť čas</Link>
          </Button>
          <DeleteOrderDialog
            disabled={order.status === "zaplatena" || pending}
            pending={pending}
            onConfirm={() =>
              call("Objednávka zrušená.", () => deleteOrder({ id: order.id }))
            }
          />
        </section>
      )}

      {/* Klient + Auto, side by side on every width (incl. the mobile sheet) */}
      <div className="grid grid-cols-2 gap-3">
        <BookingClientCard client={client} flags={clientFlags} />
        <BookingCarCard car={car} />
      </div>

      {/* História auta — the car's last few visits, each links to its order */}
      <BookingCarHistoryCard clientId={client.id} visits={recentVisits} />

      {/* Poznámka — prominent (PRD §7); workers read-only */}
      <BookingNotes
        note={order.note}
        canEdit={isManager}
        onSave={(value) =>
          call("Poznámka uložená.", () => setNote({ id: order.id, note: value }))
        }
      />

      {/* Pracovníci */}
      <BookingWorkerCard
        workers={detail.workers}
        assignable={assignableWorkers}
        pending={pending}
        onAdd={(workerId) =>
          call("Zamestnanec pridaný.", () => addOrderWorker({ id: order.id, workerId }))
        }
        onRemove={(workerId) =>
          call("Zamestnanec odobraný.", () => removeOrderWorker({ id: order.id, workerId }))
        }
      />

      {/* Služby */}
      <BookingServicesList
        lines={detail.services}
        canEdit={isManager}
        canRemove={order.status === "vytvorena"}
        pending={pending}
        services={services}
        existingServiceIds={new Set(activeServices.map((l) => l.service_id))}
        onAdd={(serviceId, quantity) =>
          call("Služba pridaná.", () => addOrderService({ id: order.id, serviceId, quantity }))
        }
        onRemove={(orderServiceId) =>
          call("Služba odstránená.", () => removeOrderService({ orderServiceId }))
        }
        onPaid={(orderServiceId, paid) =>
          call("Platba zmenená.", () => setOrderServicePaid({ orderServiceId, paid }))
        }
        totalCents={totalCents}
        priceOverridden={priceOverridden}
      />

      {/* SMS */}
      <SmsStatusCard
        sms={sms}
        canResend={isManager}
        pending={pending}
        onResend={(smsId) => call("SMS znovu odoslaná.", () => resendSms({ smsId }))}
      />

      {/* §7 #10 Bottom status actions */}
      <BookingStatusActions
        status={order.status}
        role={role}
        pending={pending}
        onAdvance={(next: OrderStatus) =>
          call(`Stav: ${STATE_LABEL[next]}.`, () => setStatus({ id: order.id, next }))
        }
      />
    </div>
  );
}
