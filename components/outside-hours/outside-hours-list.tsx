"use client";

import { useState, useTransition, useCallback } from "react";
import Link from "next/link";
import { getOutsideHoursOrders, type OutsideHoursOrderRow } from "@/lib/actions/orders";
import { useRealtimeChannel } from "@/lib/realtime/use-realtime";
import { bratislavaDateDisplay, bratislavaHHMM } from "@/lib/settings/availability";
import { formatCarLabel, NO_SPZ_LABEL } from "@/lib/cars/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function hoursLabel(h: OutsideHoursOrderRow["dayHours"]): string {
  return h ? `${h.open}–${h.close}` : "zatvorené";
}

export function OutsideHoursList({
  initialOrders,
  realtimeJwt,
}: {
  initialOrders: OutsideHoursOrderRow[];
  realtimeJwt: string;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => setOrders(await getOutsideHoursOrders()));
  }, []);

  useRealtimeChannel(
    realtimeJwt,
    (client) =>
      client
        .channel("outside-hours")
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => refresh())
        .subscribe(),
    [],
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Objednávky mimo otváracích hodín</h1>
      <p className="text-sm text-muted-foreground">
        Tieto objednávky už nie sú v otváracích hodinách. Presuňte ich na iný termín alebo zrušte.
      </p>

      <div className="hidden overflow-x-auto rounded-lg border sm:block" data-section="outside-hours">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Objednávka</TableHead>
              <TableHead>Klient</TableHead>
              <TableHead>Auto</TableHead>
              <TableHead className="whitespace-nowrap">Otváracie hodiny</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  Žiadne objednávky mimo otváracích hodín
                </TableCell>
              </TableRow>
            ) : (
              orders.map((o) => {
                const at = new Date(o.startsAt);
                return (
                  <TableRow key={o.id} data-order-id={o.id} data-spz={o.spz ?? undefined}>
                    <TableCell className="whitespace-nowrap text-sm">
                      <Link href={`/orders/${o.id}`} className="underline underline-offset-4">
                        {bratislavaDateDisplay(at)} {bratislavaHHMM(at)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{o.clientName ?? "—"}</div>
                      <div className="text-muted-foreground">{o.clientPhone}</div>
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {o.spz || formatCarLabel(o.brand, o.model) || NO_SPZ_LABEL}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {hoursLabel(o.dayHours)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ul className="space-y-2 sm:hidden">
        {orders.length === 0 ? (
          <li className="rounded-lg border py-8 text-center text-sm text-muted-foreground">
            Žiadne objednávky mimo otváracích hodín
          </li>
        ) : (
          orders.map((o) => {
            const at = new Date(o.startsAt);
            return (
              <li key={o.id} className="rounded-lg border p-3 text-sm">
                <Link href={`/orders/${o.id}`} className="block space-y-1">
                  <div className="font-medium">
                    {o.spz || formatCarLabel(o.brand, o.model) || NO_SPZ_LABEL}
                  </div>
                  <div className="text-muted-foreground">
                    {bratislavaDateDisplay(at)} {bratislavaHHMM(at)} · {o.clientName ?? "—"} {o.clientPhone}
                  </div>
                  <div className="text-muted-foreground">Otváracie hodiny: {hoursLabel(o.dayHours)}</div>
                </Link>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
