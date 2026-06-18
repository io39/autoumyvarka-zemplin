"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { upsertDayOverride, removeDayOverride } from "@/lib/actions/settings";
import type { DayOverrideRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DateField } from "./date-field";
import { OutsideHoursConfirmDialog } from "./OutsideHoursConfirmDialog";
import type { OutsideHoursWarning } from "@/lib/actions/result";

function hhmm(t: string | null): string {
  if (!t) return "";
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export function DayOverridesEditor({
  initialOverrides,
}: {
  initialOverrides: DayOverrideRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [warn, setWarn] = useState<{ warning: OutsideHoursWarning; confirm: () => void } | null>(null);

  // Form state for the "add/edit" row.
  const [day, setDay] = useState("");
  const [isClosed, setIsClosed] = useState(true);
  const [openTime, setOpenTime] = useState("08:00");
  const [closeTime, setCloseTime] = useState("12:00");
  const [label, setLabel] = useState("");

  function loadIntoForm(o: DayOverrideRow) {
    setDay(o.day);
    setIsClosed(o.is_closed);
    setOpenTime(hhmm(o.open_time) || "08:00");
    setCloseTime(hhmm(o.close_time) || "12:00");
    setLabel(o.label ?? "");
  }

  function reset() {
    setDay("");
    setIsClosed(true);
    setOpenTime("08:00");
    setCloseTime("12:00");
    setLabel("");
  }

  function save(allowOutsideHours = false) {
    if (!day) {
      toast.error("Vyberte dátum.");
      return;
    }
    startTransition(async () => {
      const result = await upsertDayOverride({
        day,
        isClosed,
        openTime: isClosed ? undefined : openTime,
        closeTime: isClosed ? undefined : closeTime,
        label: label || undefined,
        allowOutsideHours,
      });
      if (!result.ok) {
        if (result.outsideHoursWarning) {
          setWarn({ warning: result.outsideHoursWarning, confirm: () => { setWarn(null); save(true); } });
          return;
        }
        toast.error(result.message);
        return;
      }
      setWarn(null);
      toast.success("Výnimka uložená.");
      reset();
      router.refresh();
    });
  }

  function remove(d: string, allowOutsideHours = false) {
    startTransition(async () => {
      const result = await removeDayOverride({ day: d, allowOutsideHours });
      if (!result.ok) {
        if (result.outsideHoursWarning) {
          setWarn({ warning: result.outsideHoursWarning, confirm: () => { setWarn(null); remove(d, true); } });
          return;
        }
        toast.error(result.message);
        return;
      }
      toast.success("Výnimka odstránená.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        {/* h2: this editor only renders below OpeningHoursEditor on the merged
            /settings/hours page (spec 18), which owns the single page <h1>. */}
        <h2 className="text-xl font-semibold">Výnimky pre konkrétne dni</h2>
        <p className="text-sm text-muted-foreground">
          Dátum sviatku alebo skrátený deň — vyhrá nad týždenným rozvrhom.
        </p>
      </div>

      <section className="space-y-3 rounded-lg border p-4" data-form="override">
        <h2 className="text-sm font-medium">Pridať / upraviť výnimku</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="day">Dátum</Label>
            <DateField id="day" value={day} onChange={setDay} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="label">Popis (voliteľný)</Label>
            <Input
              id="label"
              placeholder="Štátny sviatok"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
        </div>

        <label htmlFor="override-closed" className="flex items-center gap-2 text-sm">
          <Checkbox
            id="override-closed"
            checked={isClosed}
            onCheckedChange={(v) => setIsClosed(v === true)}
          />
          Zatvorené celý deň
        </label>

        {!isClosed && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="open">Otvorenie</Label>
              <Input
                id="open"
                type="time"
                step={900}
                lang="sk-SK"
                value={openTime}
                onChange={(e) => setOpenTime(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="close">Zatvorenie</Label>
              <Input
                id="close"
                type="time"
                step={900}
                lang="sk-SK"
                value={closeTime}
                onChange={(e) => setCloseTime(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={reset} type="button">
            Vyčistiť
          </Button>
          <Button onClick={() => save()} disabled={pending} type="button">
            {pending ? "Ukladám…" : "Uložiť výnimku"}
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Existujúce výnimky</h2>
        {initialOverrides.length === 0 && (
          <p className="text-sm text-muted-foreground">Žiadne výnimky.</p>
        )}
        {initialOverrides.map((o) => (
          <article
            key={o.day}
            data-override={o.day}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
          >
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{o.day}</span>
                <Badge variant={o.is_closed ? "destructive" : "outline"}>
                  {o.is_closed
                    ? "Zatvorené"
                    : `${hhmm(o.open_time)}–${hhmm(o.close_time)}`}
                </Badge>
              </div>
              {o.label && (
                <div className="text-sm text-muted-foreground">{o.label}</div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => loadIntoForm(o)}
                disabled={pending}
              >
                Upraviť
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => remove(o.day)}
                disabled={pending}
              >
                Odstrániť
              </Button>
            </div>
          </article>
        ))}
      </section>

      <OutsideHoursConfirmDialog
        warning={warn?.warning ?? null}
        pending={pending}
        onConfirm={() => warn?.confirm()}
        onCancel={() => setWarn(null)}
      />
    </div>
  );
}
