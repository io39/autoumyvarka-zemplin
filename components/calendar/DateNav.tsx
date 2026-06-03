"use client";

import { useState } from "react";
import { sk } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CalendarView } from "@/lib/calendar/types";
import { pad, weekDateKeys } from "@/lib/calendar/grid";
import { viewCoversToday } from "@/lib/calendar/today";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function keyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dateToKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const fmtFull = new Intl.DateTimeFormat("sk-SK", { day: "numeric", month: "long", year: "numeric" });
const fmtDayMonth = new Intl.DateTimeFormat("sk-SK", { day: "numeric", month: "long" });
const fmtDay = new Intl.DateTimeFormat("sk-SK", { day: "numeric" });

function formatLabel(view: CalendarView, dateKey: string): string {
  if (view !== "week") return fmtFull.format(keyToDate(dateKey));

  const keys = weekDateKeys(dateKey);
  const mon = keyToDate(keys[0]);
  const sun = keyToDate(keys[6]);
  // Keep the Monday's month/year when the week spans a boundary, so e.g.
  // "26. januára – 1. februára 2026" instead of dropping January.
  if (mon.getFullYear() !== sun.getFullYear()) {
    return `${fmtFull.format(mon)} – ${fmtFull.format(sun)}`;
  }
  if (mon.getMonth() !== sun.getMonth()) {
    return `${fmtDayMonth.format(mon)} – ${fmtFull.format(sun)}`;
  }
  return `${fmtDay.format(mon)}. – ${fmtFull.format(sun)}`;
}

/**
 * Date control (spec 14 §2.2–2.3): a large centered date label that opens a
 * shadcn `Calendar` popover (month + year dropdowns), flanked by ◀ ▶ that step
 * one day (Day) / one week (Week); below it the today state — a `DNES` pill when
 * the view covers today, else a `Späť na dnes` button.
 */
export function DateNav({
  date,
  view,
  pending,
  onPrev,
  onNext,
  onToday,
  onPick,
}: {
  date: string;
  view: CalendarView;
  pending: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onPick: (dateKey: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const coversToday = viewCoversToday(view, date, new Date());

  return (
    <div className="flex items-center justify-between gap-10 md:flex-col md:justify-center md:gap-1">
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          onClick={onPrev}
          aria-label={view === "week" ? "Predošlý týždeň" : "Predošlý deň"}
        >
          <ChevronLeft className="size-4" />
        </Button>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" className="px-2 text-sm font-semibold md:text-base" data-date-trigger>
              {formatLabel(view, date)}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="center">
            <Calendar
              mode="single"
              selected={keyToDate(date)}
              defaultMonth={keyToDate(date)}
              captionLayout="dropdown"
              locale={sk}
              weekStartsOn={1}
              startMonth={new Date(2020, 0)}
              endMonth={new Date(2035, 11)}
              onSelect={(d) => {
                if (!d) return;
                setOpen(false);
                onPick(dateToKey(d));
              }}
            />
          </PopoverContent>
        </Popover>

        <Button
          size="icon"
          variant="ghost"
          onClick={onNext}
          aria-label={view === "week" ? "Nasledujúci týždeň" : "Nasledujúci deň"}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <div className="flex items-center w-28 justify-center">
        <div className="flex h-7 items-center gap-2">
          {coversToday ? (
            <span className="text-xs font-medium text-muted-foreground" data-today-pill>
              DNES
            </span>
          ) : (
            <Button size="sm" variant="outline" onClick={onToday} data-today-button>
              Späť na dnes
            </Button>
          )}
          {pending && <span className="text-xs text-muted-foreground">Načítavam…</span>}
        </div>
      </div>
    </div>
  );
}
