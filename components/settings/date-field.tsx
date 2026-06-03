"use client";

import { useState } from "react";
import { sk } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { formatDMY, pad } from "@/lib/calendar/grid";
import { cn } from "@/lib/utils";
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

/**
 * Single-date field using the **same** shadcn `Calendar` popover as the main
 * calendar (`DateNav`) — month + year dropdowns, Slovak locale, Monday start —
 * so all date pickers in the app behave identically. `value`/`onChange` use the
 * `YYYY-MM-DD` key the settings actions expect.
 */
export function DateField({
  id,
  value,
  onChange,
  placeholder = "Vyberte dátum",
}: {
  id?: string;
  value: string;
  onChange: (key: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? keyToDate(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          data-date-trigger
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 size-4" />
          {value ? formatDMY(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          captionLayout="dropdown"
          locale={sk}
          weekStartsOn={1}
          showOutsideDays={false}
          startMonth={new Date(2020, 0)}
          endMonth={new Date(2100, 11)}
          onSelect={(d) => {
            if (!d) return;
            setOpen(false);
            onChange(dateToKey(d));
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
