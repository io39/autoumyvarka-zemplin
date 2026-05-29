"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
import Link from "next/link";
import { getUnpaidCount } from "@/lib/actions/orders";
import { createBrowserRealtimeClient } from "@/lib/realtime/browser";
import { Badge } from "@/components/ui/badge";

/**
 * Header alert badge for overdue unpaid orders (spec 10). Manager-only — the
 * page renders it only for managers, and getUnpaidCount re-checks the role.
 * Live: subscribes to orders/order_services so paying an order decrements it.
 */
export function UnpaidBadge({
  initialCount,
  realtimeJwt,
}: {
  initialCount: number;
  realtimeJwt: string;
}) {
  const [count, setCount] = useState(initialCount);
  const [, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => {
      setCount(await getUnpaidCount());
    });
  }, []);

  useEffect(() => {
    const client = createBrowserRealtimeClient(realtimeJwt);
    const channel = client
      .channel("unpaid-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => refresh())
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_services" },
        () => refresh(),
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
      client.removeAllChannels();
    };
  }, [realtimeJwt, refresh]);

  if (count <= 0) return null;

  return (
    <Link href="/unpaid" data-unpaid-badge data-count={count}>
      <Badge className="border bg-red-100 text-red-900 hover:bg-red-200">
        Po termíne: {count}
      </Badge>
    </Link>
  );
}
