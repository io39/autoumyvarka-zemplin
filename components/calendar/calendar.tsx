"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCalendar, type CalendarBlock } from "@/lib/actions/orders";
import type { DayOverrideRow, OpeningHoursRow } from "@/lib/supabase/types";
import { getOpenInterval, bratislavaHHMM } from "@/lib/settings/availability";
import { STATUS_STYLE } from "@/lib/orders/colors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createBrowserRealtimeClient } from "@/lib/realtime/browser";

const SLOT_MIN = 15;
const ROW_PX = 24; // height of one 15-min row

interface CalendarProps {
  initialBlocks: CalendarBlock[];
  hours: OpeningHoursRow[];
  overrides: DayOverrideRow[];
  date: string; // "YYYY-MM-DD"
  realtimeJwt: string;
}

export function Calendar({
  initialBlocks,
  hours,
  overrides,
  date,
  realtimeJwt,
}: CalendarProps) {
  const router = useRouter();
  const [blocks, setBlocks] = useState(initialBlocks);
  const [activeBox, setActiveBox] = useState<1 | 2>(1);
  const [pending, startTransition] = useTransition();

  // Derive the day's open window (else default 08:00–17:00 so the grid renders).
  const interval = useMemo(() => {
    const probe = new Date(`${date}T12:00:00Z`);
    return getOpenInterval(probe, hours, overrides) ?? { open: "08:00", close: "17:00" };
  }, [date, hours, overrides]);

  const rows = useMemo(() => buildRows(interval.open, interval.close), [interval]);

  const refresh = useCallback(() => {
    startTransition(async () => {
      const next = await getCalendar({ view: "day", date });
      setBlocks(next);
    });
  }, [date]);

  // Live updates (data-model §3.1): subscribe to orders changes for this day.
  useEffect(() => {
    const client = createBrowserRealtimeClient(realtimeJwt);
    const channel = client
      .channel(`orders-${date}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => refresh(),
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
      client.removeAllChannels();
    };
  }, [realtimeJwt, date, refresh]);

  function gotoOffset(days: number) {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    const next = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    router.push(`/?date=${next}`);
  }

  function gotoToday() {
    const t = new Date();
    const tz = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(t);
    router.push(`/?date=${tz}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Kalendár</h1>
        <Button asChild>
          <Link href={`/orders/new?date=${date}`}>Nová objednávka</Link>
        </Button>
      </div>

      <nav className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => gotoOffset(-1)}>
          ‹ Predošlý
        </Button>
        <Button size="sm" variant="ghost" onClick={gotoToday}>
          Dnes
        </Button>
        <Button size="sm" variant="ghost" onClick={() => gotoOffset(1)}>
          Nasledujúci ›
        </Button>
        <Input
          type="date"
          value={date}
          lang="sk-SK"
          onChange={(e) => router.push(`/?date=${e.target.value}`)}
          className="w-auto"
        />
        {pending && <span className="text-xs text-muted-foreground">Načítavam…</span>}
      </nav>

      {/* Mobile box switcher — desktop shows both columns. */}
      <div className="flex sm:hidden gap-2">
        <Button
          size="sm"
          variant={activeBox === 1 ? "default" : "ghost"}
          onClick={() => setActiveBox(1)}
        >
          Box 1
        </Button>
        <Button
          size="sm"
          variant={activeBox === 2 ? "default" : "ghost"}
          onClick={() => setActiveBox(2)}
        >
          Box 2
        </Button>
      </div>

      <div className="grid grid-cols-[60px_1fr] sm:grid-cols-[60px_1fr_1fr] gap-1 rounded-lg border p-2">
        <div /> {/* time-axis spacer */}
        <BoxHeader index={1} className={activeBox === 1 ? "" : "hidden sm:block"} />
        <BoxHeader index={2} className={activeBox === 2 ? "" : "hidden sm:block"} />

        <TimeAxis rows={rows} />
        <BoxColumn
          boxIndex={1}
          blocks={blocks.filter((b) => b.order.box === 1)}
          rows={rows}
          intervalOpen={interval.open}
          className={activeBox === 1 ? "" : "hidden sm:block"}
        />
        <BoxColumn
          boxIndex={2}
          blocks={blocks.filter((b) => b.order.box === 2)}
          rows={rows}
          intervalOpen={interval.open}
          className={activeBox === 2 ? "" : "hidden sm:block"}
        />
      </div>

      {blocks.length === 0 && (
        <p className="text-sm text-muted-foreground">Žiadne objednávky.</p>
      )}
    </div>
  );
}

function BoxHeader({ index, className }: { index: number; className?: string }) {
  return (
    <div className={`text-center text-sm font-medium ${className ?? ""}`}>
      Box {index}
    </div>
  );
}

function TimeAxis({ rows }: { rows: string[] }) {
  return (
    <div className="text-xs text-muted-foreground" data-axis>
      {rows.map((t) => (
        <div
          key={t}
          style={{ height: ROW_PX }}
          className="border-t border-dashed first:border-t-0 pr-1 text-right"
        >
          {t.endsWith(":00") || t.endsWith(":30") ? t : ""}
        </div>
      ))}
    </div>
  );
}

function BoxColumn({
  boxIndex,
  blocks,
  rows,
  intervalOpen,
  className,
}: {
  boxIndex: number;
  blocks: CalendarBlock[];
  rows: string[];
  intervalOpen: string;
  className?: string;
}) {
  return (
    <div
      data-box={boxIndex}
      className={`relative rounded border bg-muted/30 ${className ?? ""}`}
      style={{ height: rows.length * ROW_PX }}
    >
      {rows.map((t, i) => (
        <div
          key={t}
          className="absolute left-0 right-0 border-t border-dashed"
          style={{ top: i * ROW_PX, height: ROW_PX }}
        />
      ))}
      {blocks.map((b) => (
        <Block key={b.order.id} block={b} intervalOpen={intervalOpen} />
      ))}
    </div>
  );
}

function Block({
  block,
  intervalOpen,
}: {
  block: CalendarBlock;
  intervalOpen: string;
}) {
  const start = new Date(block.order.starts_at);
  const end = new Date(block.order.ends_at);
  const startHHMM = bratislavaHHMM(start);
  const endHHMM = bratislavaHHMM(end);
  const offsetMin = diffMinutes(intervalOpen, startHHMM);
  const heightMin = Math.max(15, diffMinutes(startHHMM, endHHMM));
  const style = STATUS_STYLE[block.order.status];

  const mainService =
    block.services.find((s) => !s.removed_at)?.name_snapshot ?? "—";

  return (
    <Link
      href={`/orders/${block.order.id}`}
      data-order-id={block.order.id}
      className={`absolute left-1 right-1 rounded border px-2 py-1 text-xs ${style.bg} ${style.text}`}
      style={{
        top: (offsetMin / SLOT_MIN) * ROW_PX,
        height: (heightMin / SLOT_MIN) * ROW_PX - 2,
      }}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-medium truncate">{block.car.spz}</span>
        <Badge variant="secondary" className="text-[10px]">
          {startHHMM}–{endHHMM}
        </Badge>
      </div>
      {block.car.model && (
        <div className="truncate text-[11px] opacity-80">{block.car.model}</div>
      )}
      <div className="truncate text-[11px]">{mainService}</div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function buildRows(open: string, close: string): string[] {
  const o = toMinutes(open);
  const c = toMinutes(close);
  const out: string[] = [];
  for (let m = o; m < c; m += SLOT_MIN) {
    out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  }
  return out;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function diffMinutes(a: string, b: string): number {
  return toMinutes(b) - toMinutes(a);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
