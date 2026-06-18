"use client";

import { useState, useCallback, useTransition } from "react";
import Link from "next/link";
import { getOutsideHoursCount } from "@/lib/actions/orders";
import { useRealtimeChannel } from "@/lib/realtime/use-realtime";
import { Badge } from "@/components/ui/badge";

/**
 * Sidebar alert badge for orders now outside opening hours (manager-only — the
 * sidebar renders it only for managers, and getOutsideHoursCount re-checks the
 * role). Live: re-counts on order changes (reschedule/cancel). Hours changes
 * re-mint the count via the shell re-render, so the orders-only subscription is
 * enough — and `opening_hours`/`day_overrides` aren't in the realtime
 * publication anyway (subscribing to them would poison the channel).
 */
export function OutsideHoursBadge({
  initialCount,
  realtimeJwt,
}: {
  initialCount: number;
  realtimeJwt: string;
}) {
  const [count, setCount] = useState(initialCount);
  const [, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => setCount(await getOutsideHoursCount()));
  }, []);

  useRealtimeChannel(
    realtimeJwt,
    (client, channelName) =>
      client
        .channel(channelName)
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => refresh())
        .subscribe(),
    [],
  );

  if (count <= 0) return null;

  return (
    <Link href="/mimo-hodin" data-outside-hours-badge data-count={count}>
      <Badge className="border bg-amber-100 text-amber-900 hover:bg-amber-200">
        Mimo hodín: {count}
      </Badge>
    </Link>
  );
}
