"use client";

import { useEffect, useState } from "react";
import { sk } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { suggestSlots } from "@/lib/actions/orders";
import type { SlotProposal } from "@/lib/orders/slots";
import { addDays, pad } from "@/lib/calendar/grid";
import { isToday, todayKey } from "@/lib/calendar/today";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PickedSlot } from "./types";

type SlotView = "day" | "3day";

function keyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function dateToKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function longLabel(dateKey: string): string {
  return new Intl.DateTimeFormat("sk-SK", {
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(keyToDate(dateKey));
}

/**
 * Step 4 — Termín (UI-STRUCTURE §8). Header mirrors §4 (Deň / 3 dni, Calendar
 * popover date control + ◀▶, Dnes / Späť na dnes). Quick slots (nearest free per
 * box) + a full per-day×box picker; past starts show a MINULOSŤ treatment. Box
 * is implicit in the picked slot. Free slots come from `suggestSlots` (which
 * already enforces open hours + no box overlap).
 */
export function Step4TimeSlot({
  durationMin,
  view,
  date,
  picked,
  currentSlot,
  onViewChange,
  onDateChange,
  onPick,
}: {
  durationMin: number;
  view: SlotView;
  date: string;
  picked: PickedSlot | null;
  /** Edit mode: the order's existing slot, always offered (excluded from its own conflict). */
  currentSlot?: PickedSlot | null;
  onViewChange: (v: SlotView) => void;
  onDateChange: (dateKey: string) => void;
  onPick: (slot: PickedSlot) => void;
}) {
  const [data, setData] = useState<{ key: string; byDay: Record<string, SlotProposal[]> }>({
    key: "",
    byDay: {},
  });

  const wantKey = `${view}|${date}|${durationMin}`;

  useEffect(() => {
    if (durationMin <= 0) return;
    const days = view === "day" ? [date] : [date, addDays(date, 1), addDays(date, 2)];
    const key = `${view}|${date}|${durationMin}`;
    let cancelled = false;
    Promise.all(
      days.map((d) => suggestSlots({ date: d, durationMin, limit: 48 }).then((s) => [d, s] as const)),
    )
      .then((entries) => {
        if (!cancelled) setData({ key, byDay: Object.fromEntries(entries) });
      })
      .catch(() => {
        // Don't hang the loader if a fetch rejects — show empty (no slots).
        if (!cancelled) setData({ key, byDay: {} });
      });
    return () => {
      cancelled = true;
    };
  }, [view, date, durationMin]);

  const loading = data.key !== wantKey;
  const days = view === "day" ? [date] : [date, addDays(date, 1), addDays(date, 2)];
  const now = new Date();

  return (
    <section className="space-y-4" data-step="termin">
      <DateControl
        view={view}
        date={date}
        onViewChange={onViewChange}
        onDateChange={onDateChange}
      />

      {durationMin <= 0 ? (
        <p className="text-sm text-muted-foreground">
          Najprv vyberte služby s trvaním v kroku Služby.
        </p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Načítavam voľné termíny…</p>
      ) : (
        <div className="space-y-4">
          {days.map((day) => {
            const slots = mergeCurrent(data.byDay[day] ?? [], day, currentSlot);
            return (
              <div key={day} className="space-y-2" data-day={day}>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="capitalize">{longLabel(day)}</span>
                  {isToday(day, now) && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      Dnes
                    </span>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([1, 2] as const).map((box) => (
                    <BoxSlots
                      key={box}
                      box={box}
                      day={day}
                      slots={slots.filter((s) => s.box === box)}
                      picked={picked}
                      currentSlot={currentSlot}
                      now={now}
                      onPick={onPick}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Inject the edit-mode current slot so it's always offered, even though it
 *  reads as "busy" (occupied by the order being edited). */
function mergeCurrent(
  slots: SlotProposal[],
  day: string,
  currentSlot?: PickedSlot | null,
): Array<SlotProposal & { isCurrent?: boolean }> {
  if (!currentSlot || currentSlot.dateKey !== day) return slots;
  if (slots.some((s) => s.box === currentSlot.box && s.localStart === currentSlot.localStart)) {
    return slots;
  }
  const [h, m] = currentSlot.localStart.split(":").map(Number);
  const startsAt = keyToDate(day);
  startsAt.setHours(h, m, 0, 0);
  return [...slots, { startsAt, localStart: currentSlot.localStart, box: currentSlot.box, isCurrent: true }];
}

function BoxSlots({
  box,
  day,
  slots,
  picked,
  currentSlot,
  now,
  onPick,
}: {
  box: 1 | 2;
  day: string;
  slots: Array<SlotProposal & { isCurrent?: boolean }>;
  picked: PickedSlot | null;
  currentSlot?: PickedSlot | null;
  now: Date;
  onPick: (slot: PickedSlot) => void;
}) {
  const sorted = [...slots].sort((a, b) => a.localStart.localeCompare(b.localStart));
  return (
    <div className="rounded-md border p-2" data-box={box}>
      <div className="mb-1 text-xs font-medium text-muted-foreground">Box {box}</div>
      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground">Žiadne voľné termíny.</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {sorted.map((s) => {
            const isCurrent =
              !!currentSlot &&
              currentSlot.dateKey === day &&
              currentSlot.box === box &&
              currentSlot.localStart === s.localStart;
            const past = !isCurrent && s.startsAt.getTime() < now.getTime();
            const selected =
              !!picked &&
              picked.dateKey === day &&
              picked.box === box &&
              picked.localStart === s.localStart;
            return (
              <button
                key={s.localStart}
                type="button"
                disabled={past}
                data-free-slot={`${day}-${box}-${s.localStart}`}
                data-past={past || undefined}
                aria-pressed={selected}
                title={past ? "Minulosť" : undefined}
                onClick={() => onPick({ dateKey: day, box, localStart: s.localStart })}
                className={cn(
                  "rounded border px-2 py-1 text-xs transition-colors",
                  selected && "border-primary bg-primary text-primary-foreground",
                  !selected && !past && "hover:bg-accent",
                  past && "cursor-not-allowed text-muted-foreground/50 line-through",
                )}
              >
                {s.localStart}
                {isCurrent && !selected && " ·"}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DateControl({
  view,
  date,
  onViewChange,
  onDateChange,
}: {
  view: SlotView;
  date: string;
  onViewChange: (v: SlotView) => void;
  onDateChange: (dateKey: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const tk = todayKey(new Date());
  const coversToday =
    view === "day" ? date === tk : [date, addDays(date, 1), addDays(date, 2)].includes(tk);
  const step = view === "day" ? 1 : 3;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="inline-flex rounded-md border">
        <Button
          size="sm"
          variant={view === "day" ? "default" : "ghost"}
          className="rounded-r-none"
          onClick={() => onViewChange("day")}
        >
          Deň
        </Button>
        <Button
          size="sm"
          variant={view === "3day" ? "default" : "ghost"}
          className="rounded-l-none"
          onClick={() => onViewChange("3day")}
        >
          3 dni
        </Button>
      </div>

      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" aria-label="Predošlý" onClick={() => onDateChange(addDays(date, -step))}>
          <ChevronLeft className="size-4" />
        </Button>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" className="font-semibold" data-date-trigger>
              {new Intl.DateTimeFormat("sk-SK", { day: "numeric", month: "long", year: "numeric" }).format(
                keyToDate(date),
              )}
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
                onDateChange(dateToKey(d));
              }}
            />
          </PopoverContent>
        </Popover>
        <Button size="icon" variant="ghost" aria-label="Nasledujúci" onClick={() => onDateChange(addDays(date, step))}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="h-7">
        {coversToday ? (
          <span className="text-xs font-medium text-muted-foreground">DNES</span>
        ) : (
          <Button size="sm" variant="outline" onClick={() => onDateChange(todayKey(new Date()))}>
            Späť na dnes
          </Button>
        )}
      </div>
    </div>
  );
}
