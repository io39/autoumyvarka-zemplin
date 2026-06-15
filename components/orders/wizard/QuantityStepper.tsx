"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Touch-friendly quantity control for per-unit (/ks) add-ons.
 *
 * Native number-spinner arrows are tiny and mobile browsers hide them entirely,
 * and a hard "empty → 1" coercion makes the field impossible to clear and retype
 * on a phone. This replaces both with large − / + buttons plus a digit-only field
 * that may be transiently empty while editing and only settles to a valid value
 * (≥ 1) on blur.
 */
export function QuantityStepper({
  value,
  min = 1,
  onChange,
  ariaLabel = "Počet ks",
}: {
  value: number;
  min?: number;
  onChange: (qty: number) => void;
  ariaLabel?: string;
}) {
  // Local string state so the field can be cleared while typing on mobile.
  const [raw, setRaw] = useState(String(value));

  // Resync when the committed value changes from outside (e.g. + / − buttons,
  // selecting a different service) — React's "adjust state during render" pattern.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setRaw(String(value));
  }

  const commit = (next: number) => {
    const clamped = Math.max(min, next);
    setRaw(String(clamped));
    onChange(clamped);
  };

  return (
    <div
      className="flex items-center gap-1"
      // Inside a <label>; keep clicks from toggling the service checkbox.
      onClick={(e) => e.preventDefault()}
    >
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9"
        aria-label="Znížiť počet"
        disabled={value <= min}
        onClick={() => commit(value - 1)}
      >
        <Minus />
      </Button>
      <Input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        className="h-9 w-12 text-center"
        value={raw}
        aria-label={ariaLabel}
        onKeyDown={(e) => {
          if (["e", "E", "+", "-", ".", ","].includes(e.key)) e.preventDefault();
        }}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          setRaw(digits); // may be "" while editing
          if (digits !== "") onChange(Math.max(min, parseInt(digits, 10)));
        }}
        onBlur={() => {
          // Empty or below-min field settles back to a valid quantity.
          const parsed = parseInt(raw, 10);
          commit(Number.isNaN(parsed) ? min : parsed);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9"
        aria-label="Zvýšiť počet"
        onClick={() => commit(value + 1)}
      >
        <Plus />
      </Button>
    </div>
  );
}
