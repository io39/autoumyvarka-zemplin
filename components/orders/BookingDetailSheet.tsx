"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getOrderDetailBundle, type OrderDetailBundle } from "@/lib/actions/orders";
import type { StaffRole } from "@/lib/supabase/types";
import { bratislavaHHMM } from "@/lib/settings/availability";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderDetailBody } from "./OrderDetailBody";

/**
 * Popup order detail (UI-STRUCTURE §7, spec 15 §2.3): a side sheet on desktop,
 * bottom sheet on mobile, opened from a calendar block. Loads the bundle on
 * open and renders the same `OrderDetailBody` as the full page. Mutations
 * re-fetch the bundle (`onRefresh`); the calendar stays in sync via Realtime.
 */
export function BookingDetailSheet({
  orderId,
  role,
  onOpenChange,
}: {
  orderId: string | null;
  role: StaffRole;
  onOpenChange: (open: boolean) => void;
}) {
  const open = orderId !== null;
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const [bundle, setBundle] = useState<OrderDetailBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Clear the previous order's bundle the moment a different order is opened, so
  // the Sheet shows the skeleton rather than stale data — done during render
  // (guarded), not in an effect. A plain refetch (`onRefresh`, same orderId)
  // leaves the current bundle in place to avoid a flash.
  const [shownOrderId, setShownOrderId] = useState(orderId);
  if (orderId !== shownOrderId) {
    setShownOrderId(orderId);
    setBundle(null);
    setError(null);
  }

  // `loading` is derived (not stored) so `load()` has no synchronous setState —
  // it stays a clean async effect/handler.
  const loading = open && bundle === null && error === null;

  // Guards against a slow fetch for a previously-opened order resolving after a
  // newer one was selected (the Sheet reuses this component across orders).
  const latestRequestRef = useRef<string | null>(orderId);
  const load = useCallback(() => {
    if (!orderId) return;
    latestRequestRef.current = orderId;
    getOrderDetailBundle({ id: orderId })
      .then((b) => {
        if (latestRequestRef.current !== orderId) return; // superseded
        if (b) setBundle(b);
        else setError("Objednávka sa nenašla.");
      })
      .catch(() => {
        if (latestRequestRef.current !== orderId) return;
        setError("Načítanie zlyhalo. Skúste znova.");
      });
  }, [orderId]);

  useEffect(() => {
    if (orderId) load();
  }, [orderId, load]);

  const order = bundle?.detail.order;
  const title = order
    ? `Rezervácia · ${bratislavaHHMM(new Date(order.starts_at))}–${bratislavaHHMM(
        new Date(order.ends_at),
      )} · Box ${order.box}`
    : "Rezervácia";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        data-order-sheet
        className="flex max-h-[90dvh] w-full flex-col gap-0 p-0 sm:max-h-none sm:max-w-lg xl:max-w-xl"
      >
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="text-base">{title}</SheetTitle>
          <SheetDescription className="sr-only">
            Detail rezervácie — stav, klient, auto, služby, pracovníci, poznámka a SMS.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="space-y-3" data-sheet-loading>
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}
          {error && (
            <div className="space-y-3 text-sm" data-sheet-error>
              <p className="text-muted-foreground">{error}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setError(null);
                  load();
                }}
              >
                Skúsiť znova
              </Button>
            </div>
          )}
          {!loading && !error && bundle && (
            <OrderDetailBody
              role={role}
              detail={bundle.detail}
              allWorkers={bundle.allWorkers}
              services={bundle.services}
              sms={bundle.sms}
              onRefresh={load}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
