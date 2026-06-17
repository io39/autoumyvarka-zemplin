"use client";

import { useState, useTransition, useCallback } from "react";
import Link from "next/link";
import { getUnpaidOrders, type UnpaidOrderRow } from "@/lib/actions/orders";
import { useRealtimeChannel } from "@/lib/realtime/use-realtime";
import { bratislavaDateDisplay, bratislavaHHMM } from "@/lib/settings/availability";
import { formatPriceCents } from "@/lib/services/format";
import { formatCarLabel, NO_SPZ_LABEL } from "@/lib/cars/format";
import { skPlural } from "@/lib/intl/sk";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function UnpaidList({
  initialOrders,
  initialOverdueCount,
  initialTodayCount,
  realtimeJwt,
}: {
  initialOrders: UnpaidOrderRow[];
  initialOverdueCount: number;
  initialTodayCount: number;
  realtimeJwt: string;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [overdueCount, setOverdueCount] = useState(initialOverdueCount);
  const [todayCount, setTodayCount] = useState(initialTodayCount);
  const [, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => {
      const res = await getUnpaidOrders();
      setOrders(res.orders);
      setOverdueCount(res.overdueCount);
      setTodayCount(res.todayCount);
    });
  }, []);

  // Live updates: an order paid (status → zaplatena) or a line marked paid drops
  // it from the list. Subscribe to both tables (data-model §3.1) — no new plumbing.
  useRealtimeChannel(
    realtimeJwt,
    (client) =>
      client
        .channel("unpaid-alerts")
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => refresh())
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "order_services" },
          () => refresh(),
        )
        .subscribe(),
    [],
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Nezaplatené objednávky</h1>

      {overdueCount > 0 && (
        <div
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
          data-banner="overdue"
        >
          Pozor: {overdueCount}{" "}
          {skPlural(overdueCount, {
            one: "nezaplatená objednávka",
            few: "nezaplatené objednávky",
            many: "nezaplatených objednávok",
          })}{" "}
          z minulých dní.
        </div>
      )}

      <p className="text-sm text-muted-foreground" data-counts>
        Po termíne: <span data-overdue-count>{overdueCount}</span> · Dnes: {todayCount}
      </p>

      {/* Desktop: table (≥sm). Test hooks (data-*) + the row link live here only. */}
      <div className="hidden overflow-x-auto rounded-lg border sm:block" data-section="unpaid">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Dátum</TableHead>
              <TableHead>Klient</TableHead>
              <TableHead>Auto</TableHead>
              <TableHead>Služby</TableHead>
              <TableHead className="whitespace-nowrap text-right">Suma</TableHead>
              <TableHead>Stav</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Žiadne nezaplatené objednávky
                </TableCell>
              </TableRow>
            ) : (
              orders.map((o) => {
                const at = new Date(o.startsAt);
                return (
                  <TableRow key={o.id} data-order-id={o.id} data-spz={o.spz}>
                    <TableCell className="whitespace-nowrap text-sm">
                      <Link
                        href={`/orders/${o.id}`}
                        className="underline underline-offset-4"
                      >
                        {bratislavaDateDisplay(at)} {bratislavaHHMM(at)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{o.clientName ?? "—"}</div>
                      <div className="text-muted-foreground">{o.clientPhone}</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="font-medium">
                        {o.spz || formatCarLabel(o.brand, o.model) || NO_SPZ_LABEL}
                      </span>
                      {o.spz && formatCarLabel(o.brand, o.model) && (
                        <span className="ml-1 text-muted-foreground">
                          {formatCarLabel(o.brand, o.model)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {o.serviceNames.join(", ")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm">
                      {formatPriceCents(o.unpaidAmountCents)}
                    </TableCell>
                    <TableCell>
                      {o.overdue ? (
                        <Badge className="border bg-red-100 text-red-900">Po termíne</Badge>
                      ) : (
                        <Badge variant="secondary">Dnes</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: stacked cards (<sm) for 360px readability (spec §2.1/§4.5). */}
      <ul className="space-y-2 sm:hidden">
        {orders.length === 0 ? (
          <li className="rounded-lg border py-8 text-center text-sm text-muted-foreground">
            Žiadne nezaplatené objednávky
          </li>
        ) : (
          orders.map((o) => {
            const at = new Date(o.startsAt);
            return (
              <li key={o.id} className="rounded-lg border p-3 text-sm">
                <Link href={`/orders/${o.id}`} className="block space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {o.spz || formatCarLabel(o.brand, o.model) || NO_SPZ_LABEL}
                    </span>
                    {o.overdue ? (
                      <Badge className="border bg-red-100 text-red-900">Po termíne</Badge>
                    ) : (
                      <Badge variant="secondary">Dnes</Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground">
                    {bratislavaDateDisplay(at)} {bratislavaHHMM(at)} · {o.clientName ?? "—"}{" "}
                    {o.clientPhone}
                  </div>
                  {o.serviceNames.length > 0 && (
                    <div className="text-muted-foreground">{o.serviceNames.join(", ")}</div>
                  )}
                  <div className="font-medium">{formatPriceCents(o.unpaidAmountCents)}</div>
                </Link>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
