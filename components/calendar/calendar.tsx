"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCalendar, type CalendarBlock } from "@/lib/actions/orders";
import type { DayOverrideRow, OpeningHoursRow } from "@/lib/supabase/types";
import {
  bratislavaDateKey,
  bratislavaHHMM,
  getOpenInterval,
} from "@/lib/settings/availability";
import { STATE_COLOR } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createBrowserRealtimeClient } from "@/lib/realtime/browser";

const SLOT_MIN = 15;
const ROW_PX = 24; // height of one 15-min row

export type CalendarView = "day" | "week";

interface CalendarProps {
  initialBlocks: CalendarBlock[];
  hours: OpeningHoursRow[];
  overrides: DayOverrideRow[];
  date: string; // "YYYY-MM-DD"
  view: CalendarView;
  realtimeJwt: string;
}

const WEEKDAY_SHORT = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];

export function Calendar({
  initialBlocks,
  hours,
  overrides,
  date,
  view,
  realtimeJwt,
}: CalendarProps) {
  const router = useRouter();
  const [blocks, setBlocks] = useState(initialBlocks);
  const [activeBox, setActiveBox] = useState<1 | 2>(1);
  const [pending, startTransition] = useTransition();

  // 7 day-keys for the week containing `date` (Monday first).
  const weekDays = useMemo(() => weekDateKeys(date), [date]);

  // Each day's resolved open interval (override-wins). For grid rendering
  // we'll union the union-of-opens to determine the visible time range.
  const dayIntervals = useMemo(() => {
    const map = new Map<string, { open: string; close: string } | null>();
    for (const dk of weekDays) {
      const probe = new Date(`${dk}T12:00:00Z`);
      map.set(dk, getOpenInterval(probe, hours, overrides));
    }
    return map;
  }, [weekDays, hours, overrides]);

  // The grid range. Day view: just that day's interval (else default). Week
  // view: the union over the week (else default), so every block's slot is
  // visible somewhere on the axis.
  const interval = useMemo(() => {
    if (view === "day") {
      return dayIntervals.get(date) ?? { open: "08:00", close: "17:00" };
    }
    let minOpen: string | null = null;
    let maxClose: string | null = null;
    for (const v of dayIntervals.values()) {
      if (!v) continue;
      if (minOpen === null || v.open < minOpen) minOpen = v.open;
      if (maxClose === null || v.close > maxClose) maxClose = v.close;
    }
    return { open: minOpen ?? "08:00", close: maxClose ?? "17:00" };
  }, [view, date, dayIntervals]);

  const rows = useMemo(() => buildRows(interval.open, interval.close), [interval]);

  const refresh = useCallback(() => {
    startTransition(async () => {
      const next = await getCalendar({ view, date });
      setBlocks(next);
    });
  }, [view, date]);

  // Live updates: subscribe to any orders change; the action returns the
  // current view's blocks. The channel name carries the date so navigating
  // tears down and re-creates.
  useEffect(() => {
    const client = createBrowserRealtimeClient(realtimeJwt);
    const channel = client
      .channel(`orders-${view}-${date}`)
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
  }, [realtimeJwt, view, date, refresh]);

  function setView(next: CalendarView) {
    router.push(`/?view=${next}&date=${date}`);
  }

  function gotoOffset(units: number) {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + units * (view === "week" ? 7 : 1));
    const next = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    router.push(`/?view=${view}&date=${next}`);
  }

  function gotoToday() {
    const tz = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(
      new Date(),
    );
    router.push(`/?view=${view}&date=${tz}`);
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
        <div className="flex rounded-md border">
          <Button
            size="sm"
            variant={view === "day" ? "default" : "ghost"}
            onClick={() => setView("day")}
            className="rounded-r-none"
          >
            Deň
          </Button>
          <Button
            size="sm"
            variant={view === "week" ? "default" : "ghost"}
            onClick={() => setView("week")}
            className="rounded-l-none"
          >
            Týždeň
          </Button>
        </div>
        <Button size="sm" variant="ghost" onClick={() => gotoOffset(-1)}>
          ‹ {view === "week" ? "Predošlý týždeň" : "Predošlý deň"}
        </Button>
        <Button size="sm" variant="ghost" onClick={gotoToday}>
          Dnes
        </Button>
        <Button size="sm" variant="ghost" onClick={() => gotoOffset(1)}>
          {view === "week" ? "Nasledujúci týždeň" : "Nasledujúci deň"} ›
        </Button>
        <Input
          type="date"
          value={date}
          lang="sk-SK"
          onChange={(e) => router.push(`/?view=${view}&date=${e.target.value}`)}
          className="w-auto"
        />
        {pending && <span className="text-xs text-muted-foreground">Načítavam…</span>}
      </nav>

      {view === "day" ? (
        <DayGrid
          activeBox={activeBox}
          setActiveBox={setActiveBox}
          rows={rows}
          interval={interval}
          blocks={blocks.filter((b) => bratislavaDateKey(new Date(b.order.starts_at)) === date)}
        />
      ) : (
        <WeekGrid
          weekDays={weekDays}
          rows={rows}
          interval={interval}
          dayIntervals={dayIntervals}
          blocks={blocks}
        />
      )}

      {blocks.length === 0 && (
        <p className="text-sm text-muted-foreground">Žiadne objednávky.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day view
// ---------------------------------------------------------------------------

function DayGrid({
  activeBox,
  setActiveBox,
  rows,
  interval,
  blocks,
}: {
  activeBox: 1 | 2;
  setActiveBox: (n: 1 | 2) => void;
  rows: string[];
  interval: { open: string; close: string };
  blocks: CalendarBlock[];
}) {
  return (
    <>
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
        <div />
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
    </>
  );
}

// ---------------------------------------------------------------------------
// Week view — 7 days × 2 boxes, shared time axis, horizontally scrollable.
// ---------------------------------------------------------------------------

function WeekGrid({
  weekDays,
  rows,
  interval,
  dayIntervals,
  blocks,
}: {
  weekDays: string[];
  rows: string[];
  interval: { open: string; close: string };
  dayIntervals: Map<string, { open: string; close: string } | null>;
  blocks: CalendarBlock[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <div
        className="grid gap-1 p-2 min-w-[800px]"
        style={{
          gridTemplateColumns: `60px repeat(${weekDays.length}, minmax(120px, 1fr))`,
        }}
      >
        <div />
        {weekDays.map((dk) => (
          <DayHeader key={`h-${dk}`} dateKey={dk} closed={dayIntervals.get(dk) === null} />
        ))}

        <TimeAxis rows={rows} />
        {weekDays.map((dk) => (
          <DayCell
            key={`c-${dk}`}
            dateKey={dk}
            rows={rows}
            gridInterval={interval}
            dayInterval={dayIntervals.get(dk) ?? null}
            blocks={blocks.filter(
              (b) => bratislavaDateKey(new Date(b.order.starts_at)) === dk,
            )}
          />
        ))}
      </div>
    </div>
  );
}

function DayHeader({ dateKey, closed }: { dateKey: string; closed: boolean }) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = (probe.getUTCDay() + 6) % 7;
  const label = `${WEEKDAY_SHORT[dow]} ${pad(d)}.${pad(m)}.`;
  return (
    <Link
      href={`/?view=day&date=${dateKey}`}
      className="text-center text-xs font-medium hover:underline"
    >
      <div>{label}</div>
      <div className="text-[10px] text-muted-foreground">Box 1 · Box 2</div>
      {closed && <div className="text-[10px] text-muted-foreground">zatvorené</div>}
    </Link>
  );
}

function DayCell({
  dateKey,
  rows,
  gridInterval,
  dayInterval,
  blocks,
}: {
  dateKey: string;
  rows: string[];
  gridInterval: { open: string; close: string };
  dayInterval: { open: string; close: string } | null;
  blocks: CalendarBlock[];
}) {
  const heightPx = rows.length * ROW_PX;
  // Mask the portion of the cell that lies outside this day's open interval.
  const closedTop = dayInterval
    ? Math.max(0, (diffMinutes(gridInterval.open, dayInterval.open) / SLOT_MIN) * ROW_PX)
    : heightPx;
  const closedBottomStart = dayInterval
    ? (diffMinutes(gridInterval.open, dayInterval.close) / SLOT_MIN) * ROW_PX
    : 0;

  return (
    <div className="grid grid-cols-2 gap-0.5" data-day={dateKey} style={{ height: heightPx }}>
      {[1, 2].map((box) => (
        <div key={box} className="relative rounded border bg-muted/30" data-box={box}>
          {rows.map((t, i) => (
            <div
              key={t}
              className="absolute left-0 right-0 border-t border-dashed"
              style={{ top: i * ROW_PX, height: ROW_PX }}
            />
          ))}
          {/* Greyed-out closed zones (top + bottom). */}
          {closedTop > 0 && (
            <div
              className="absolute left-0 right-0 bg-zinc-200/70"
              style={{ top: 0, height: closedTop }}
            />
          )}
          {dayInterval && closedBottomStart < heightPx && (
            <div
              className="absolute left-0 right-0 bg-zinc-200/70"
              style={{ top: closedBottomStart, bottom: 0 }}
            />
          )}
          {!dayInterval && (
            <div
              className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground"
            >
              zatvorené
            </div>
          )}
          {blocks
            .filter((b) => b.order.box === box)
            .map((b) => (
              <Block
                key={b.order.id}
                block={b}
                intervalOpen={gridInterval.open}
                compact
              />
            ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

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
  compact,
}: {
  block: CalendarBlock;
  intervalOpen: string;
  compact?: boolean;
}) {
  const start = new Date(block.order.starts_at);
  const end = new Date(block.order.ends_at);
  const startHHMM = bratislavaHHMM(start);
  const endHHMM = bratislavaHHMM(end);
  const offsetMin = diffMinutes(intervalOpen, startHHMM);
  const heightMin = Math.max(15, diffMinutes(startHHMM, endHHMM));
  const style = STATE_COLOR[block.order.status];

  const mainService =
    block.services.find((s) => !s.removed_at)?.name_snapshot ?? "—";

  return (
    <Link
      href={`/orders/${block.order.id}`}
      data-order-id={block.order.id}
      className={`absolute left-1 right-1 rounded border px-1 py-0.5 text-xs transition-opacity hover:opacity-90 ${style.bg} ${style.border} ${style.text}`}
      style={{
        top: (offsetMin / SLOT_MIN) * ROW_PX,
        height: (heightMin / SLOT_MIN) * ROW_PX - 2,
      }}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-medium truncate">{block.car.spz}</span>
        {!compact && (
          <Badge variant="secondary" className="text-[10px]">
            {startHHMM}–{endHHMM}
          </Badge>
        )}
      </div>
      {compact ? (
        <div className="truncate text-[10px] opacity-80">
          {startHHMM}–{endHHMM}
        </div>
      ) : (
        <>
          {block.car.model && (
            <div className="truncate text-[11px] opacity-80">{block.car.model}</div>
          )}
          <div className="truncate text-[11px]">{mainService}</div>
        </>
      )}
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

/** 7 Bratislava-local date keys for the week containing `dateKey`, Monday first. */
function weekDateKeys(dateKey: string): string[] {
  const [y, m, d] = dateKey.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = (probe.getUTCDay() + 6) % 7; // 0=Mon..6=Sun
  const monday = new Date(probe);
  monday.setUTCDate(monday.getUTCDate() - dow);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d2 = new Date(monday);
    d2.setUTCDate(monday.getUTCDate() + i);
    out.push(
      `${d2.getUTCFullYear()}-${pad(d2.getUTCMonth() + 1)}-${pad(d2.getUTCDate())}`,
    );
  }
  return out;
}
