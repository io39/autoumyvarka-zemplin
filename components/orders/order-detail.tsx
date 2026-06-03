"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { OrderDetail, RecentVisit } from "@/lib/actions/orders";
import type { ServiceWithPrices } from "@/lib/actions/services";
import type { SmsMessageRow, StaffRole, WorkerRow } from "@/lib/supabase/types";
import { OrderDetailBody } from "./OrderDetailBody";

type WorkerLite = Pick<WorkerRow, "id" | "display_name" | "active">;

interface Props {
  role: StaffRole;
  detail: OrderDetail;
  allWorkers: WorkerLite[];
  services: ServiceWithPrices[];
  sms: SmsMessageRow[];
  recentVisits: RecentVisit[];
}

/**
 * The full-page order detail surface (UI-STRUCTURE §7) — opened from client
 * history. Wraps the shared `OrderDetailBody` with the page title, the
 * back-to-calendar link, and the manager-only audit link. The popup Sheet
 * surface (`BookingDetailSheet`) renders the same body. Mutations refresh the
 * page via `router.refresh()`.
 */
export function OrderDetailView({ role, detail, allWorkers, services, sms, recentVisits }: Props) {
  const router = useRouter();
  const { order } = detail;
  const isManager = role === "manazer";

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Rezervácia</h1>
        {isManager && (
          <Link
            href={`/audit?orderId=${order.id}`}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            História zmien →
          </Link>
        )}
      </header>

      <OrderDetailBody
        role={role}
        detail={detail}
        allWorkers={allWorkers}
        services={services}
        sms={sms}
        recentVisits={recentVisits}
        onRefresh={() => router.refresh()}
      />
    </div>
  );
}
