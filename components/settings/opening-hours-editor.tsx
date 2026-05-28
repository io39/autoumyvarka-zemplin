"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { saveOpeningHours } from "@/lib/actions/settings";
import type { OpeningHoursRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// 0 = Pondelok … 6 = Nedeľa (data-model §2.12).
const WEEKDAY_LABEL = [
  "Pondelok",
  "Utorok",
  "Streda",
  "Štvrtok",
  "Piatok",
  "Sobota",
  "Nedeľa",
];

interface Row {
  dayOfWeek: number;
  isClosed: boolean;
  openTime: string;
  closeTime: string;
}

function toEditable(rows: OpeningHoursRow[]): Row[] {
  const byDay = new Map(rows.map((r) => [r.day_of_week, r]));
  return Array.from({ length: 7 }, (_, dow) => {
    const r = byDay.get(dow);
    return {
      dayOfWeek: dow,
      isClosed: r?.is_closed ?? true,
      openTime: hhmm(r?.open_time) ?? "08:00",
      closeTime: hhmm(r?.close_time) ?? "17:00",
    };
  });
}

function hhmm(t: string | null | undefined): string | null {
  if (!t) return null;
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export function OpeningHoursEditor({
  initialHours,
}: {
  initialHours: OpeningHoursRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => toEditable(initialHours));
  const [pending, startTransition] = useTransition();

  function update(dow: number, patch: Partial<Row>) {
    setRows((prev) =>
      prev.map((r) => (r.dayOfWeek === dow ? { ...r, ...patch } : r)),
    );
  }

  function onSubmit() {
    const payload = {
      rows: rows.map((r) => ({
        dayOfWeek: r.dayOfWeek,
        isClosed: r.isClosed,
        openTime: r.isClosed ? undefined : r.openTime,
        closeTime: r.isClosed ? undefined : r.closeTime,
      })),
    };
    startTransition(async () => {
      const result = await saveOpeningHours(payload);
      if (result.ok) {
        toast.success("Otváracie hodiny uložené.");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link href="/" className="text-sm underline underline-offset-4">
          ← Späť
        </Link>
        <h1 className="text-xl font-semibold">Otváracie hodiny</h1>
        <p className="text-sm text-muted-foreground">
          Týždenný rozvrh. Pre konkrétny dátum nastavte výnimku v sekcii „Výnimky“.
        </p>
      </div>

      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.dayOfWeek}
            data-day={r.dayOfWeek}
            className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-[120px_auto_1fr_1fr] sm:items-center"
          >
            <div className="font-medium">{WEEKDAY_LABEL[r.dayOfWeek]}</div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={r.isClosed}
                onChange={(e) => update(r.dayOfWeek, { isClosed: e.target.checked })}
              />
              Zatvorené
            </label>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor={`open-${r.dayOfWeek}`}>
                Otvorenie
              </Label>
              <Input
                id={`open-${r.dayOfWeek}`}
                type="time"
                step={900}
                lang="sk-SK"
                value={r.openTime}
                disabled={r.isClosed}
                onChange={(e) => update(r.dayOfWeek, { openTime: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor={`close-${r.dayOfWeek}`}>
                Zatvorenie
              </Label>
              <Input
                id={`close-${r.dayOfWeek}`}
                type="time"
                step={900}
                lang="sk-SK"
                value={r.closeTime}
                disabled={r.isClosed}
                onChange={(e) => update(r.dayOfWeek, { closeTime: e.target.value })}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={onSubmit} disabled={pending}>
          {pending ? "Ukladám…" : "Uložiť"}
        </Button>
      </div>
    </div>
  );
}
