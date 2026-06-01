"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getCalendar, type CalendarBlock } from "@/lib/actions/orders";
import type { DayOverrideRow, OpeningHoursRow, StaffRole } from "@/lib/supabase/types";
import { bratislavaDateKey, getOpenInterval } from "@/lib/settings/availability";
import { buildRows, weekDateKeys, type Interval } from "@/lib/calendar/grid";
import { todayKey } from "@/lib/calendar/today";
import type { CalendarView as ViewMode } from "@/lib/calendar/types";
import { createBrowserRealtimeClient } from "@/lib/realtime/browser";
import { Button } from "@/components/ui/button";
import { CalendarHeader } from "./CalendarHeader";
import { DateNav } from "./DateNav";
import { StatusLegend } from "./StatusLegend";
import { BoxFilter } from "./BoxFilter";
import { DayView } from "./DayView";
import { WeekView } from "./WeekView";

const DEFAULT_INTERVAL: Interval = { open: "08:00", close: "17:00" };

interface CalendarViewProps {
  initialBlocks: CalendarBlock[];
  hours: OpeningHoursRow[];
  overrides: DayOverrideRow[];
  date: string; // "YYYY-MM-DD"
  view: ViewMode;
  realtimeJwt: string;
  staffName: string;
  role: StaffRole;
  unpaidCount: number;
}

/**
 * Calendar orchestrator (spec 14 §2.7): owns the header, the Day/Týždeň toggle,
 * the date/legend/box-filter controls, the Realtime subscription, and the
 * Day/Week grids. Grid + Realtime behavior is unchanged from the original
 * `Calendar`; the header and controls are the §4 redesign.
 */
export function CalendarView({
  initialBlocks,
  hours,
  overrides,
  date,
  view,
  realtimeJwt,
  staffName,
  role,
  unpaidCount,
}: CalendarViewProps) {
  const router = useRouter();
  const [blocks, setBlocks] = useState(initialBlocks);
  const [activeBox, setActiveBox] = useState<1 | 2>(1);
  const [pending, startTransition] = useTransition();

  // Adopt the server's fresh blocks on navigation. Soft navigation keeps this
  // client component mounted (state persists), so when view/date changes we
  // reset `blocks` to the new `initialBlocks` — done during render (React's
  // "reset state when a prop changes" pattern) rather than in an effect.
  // Between navigations the Realtime subscription keeps `blocks` current.
  const navKey = `${view}|${date}`;
  const [syncedKey, setSyncedKey] = useState(navKey);
  if (navKey !== syncedKey) {
    setSyncedKey(navKey);
    setBlocks(initialBlocks);
  }

  // Tracks the view/date the UI is currently showing. A Realtime `refresh()`
  // from a channel that belonged to the *previous* route (still subscribed
  // until its effect cleanup runs after navigation) must not overwrite the new
  // route's blocks — it checks this ref (after its await resolves) before
  // committing. Updated in an effect, not during render.
  const currentKeyRef = useRef(navKey);
  useEffect(() => {
    currentKeyRef.current = navKey;
  }, [navKey]);

  // 7 day-keys for the week containing `date` (Monday first).
  const weekDays = useMemo(() => weekDateKeys(date), [date]);

  // Each day's resolved open interval (override-wins).
  const dayIntervals = useMemo(() => {
    const map = new Map<string, Interval | null>();
    for (const dk of weekDays) {
      const probe = new Date(`${dk}T12:00:00Z`);
      map.set(dk, getOpenInterval(probe, hours, overrides));
    }
    return map;
  }, [weekDays, hours, overrides]);

  // Grid range. Day view: that day's interval (else default). Week view: the
  // union over the week (else default), so every block's slot is visible.
  const interval = useMemo<Interval>(() => {
    if (view === "day") {
      return dayIntervals.get(date) ?? DEFAULT_INTERVAL;
    }
    let minOpen: string | null = null;
    let maxClose: string | null = null;
    for (const v of dayIntervals.values()) {
      if (!v) continue;
      if (minOpen === null || v.open < minOpen) minOpen = v.open;
      if (maxClose === null || v.close > maxClose) maxClose = v.close;
    }
    return { open: minOpen ?? DEFAULT_INTERVAL.open, close: maxClose ?? DEFAULT_INTERVAL.close };
  }, [view, date, dayIntervals]);

  const rows = useMemo(() => buildRows(interval.open, interval.close), [interval]);

  const refresh = useCallback(() => {
    const key = `${view}|${date}`;
    startTransition(async () => {
      const next = await getCalendar({ view, date });
      // Ignore a refetch from a stale (pre-navigation) channel.
      if (currentKeyRef.current === key) setBlocks(next);
    });
  }, [view, date]);

  // Live updates: any orders change re-fetches the current view's blocks. The
  // channel name carries view+date so navigating tears down and re-creates.
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

  const pushTo = useCallback(
    (nextView: ViewMode, nextDate: string) => {
      router.push(`/?view=${nextView}&date=${nextDate}`);
    },
    [router],
  );

  const gotoOffset = useCallback(
    (units: number) => {
      const d = new Date(`${date}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + units * (view === "week" ? 7 : 1));
      const next = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
        d.getUTCDate(),
      ).padStart(2, "0")}`;
      pushTo(view, next);
    },
    [date, view, pushTo],
  );

  const onPrev = useCallback(() => gotoOffset(-1), [gotoOffset]);
  const onNext = useCallback(() => gotoOffset(1), [gotoOffset]);
  const onToday = useCallback(() => pushTo(view, todayKey(new Date())), [pushTo, view]);
  const onPick = useCallback((key: string) => pushTo(view, key), [pushTo, view]);

  const dayBlocks = useMemo(
    () => blocks.filter((b) => bratislavaDateKey(new Date(b.order.starts_at)) === date),
    [blocks, date],
  );

  return (
    <div className="space-y-4">
      <CalendarHeader
        date={date}
        role={role}
        staffName={staffName}
        unpaidCount={unpaidCount}
        realtimeJwt={realtimeJwt}
      />

      <div className="flex justify-center">
        <div className="inline-flex rounded-md border">
          <Button
            size="sm"
            variant={view === "day" ? "default" : "ghost"}
            onClick={() => pushTo("day", date)}
            className="rounded-r-none"
          >
            Deň
          </Button>
          <Button
            size="sm"
            variant={view === "week" ? "default" : "ghost"}
            onClick={() => pushTo("week", date)}
            className="rounded-l-none"
          >
            Týždeň
          </Button>
        </div>
      </div>

      <DateNav
        date={date}
        view={view}
        pending={pending}
        onPrev={onPrev}
        onNext={onNext}
        onToday={onToday}
        onPick={onPick}
      />

      <div className="flex items-center justify-between gap-2">
        <StatusLegend />
        {view === "day" && <BoxFilter activeBox={activeBox} onChange={setActiveBox} />}
      </div>

      {view === "day" ? (
        <DayView activeBox={activeBox} rows={rows} interval={interval} blocks={dayBlocks} />
      ) : (
        <WeekView
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
