"use client";

import { useState } from "react";
import { CAR_BRANDS } from "@/lib/cars/brands";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Select needs non-empty item values, so the "none" and "other" choices use
// sentinels rather than "".
const NONE = "__none__";
const OTHER = "__other__";

/**
 * Optional car brand (značka) picker: a curated dropdown plus an "Iné…" option
 * that reveals a free-text box. Uncontrolled — initialised once from `initial`
 * and reports the effective brand string ("" = none) via `onChange`.
 */
export function BrandField({
  initial = "",
  onChange,
  name,
  id = "car-brand",
}: {
  initial?: string;
  /** Notified with the effective brand ("" = none). For state-driven forms. */
  onChange?: (brand: string) => void;
  /** When set, also emits a hidden input so `<form>`/FormData picks up the brand. */
  name?: string;
  id?: string;
}) {
  const known = (CAR_BRANDS as readonly string[]).includes(initial);
  const [mode, setMode] = useState<string>(initial === "" ? NONE : known ? initial : OTHER);
  const [custom, setCustom] = useState(known || initial === "" ? "" : initial);

  const effective = mode === NONE ? "" : mode === OTHER ? custom.trim() : mode;

  function onSelect(v: string) {
    setMode(v);
    onChange?.(v === NONE ? "" : v === OTHER ? custom.trim() : v);
  }
  function onCustom(v: string) {
    setCustom(v);
    onChange?.(v.trim());
  }

  return (
    <div className="space-y-1">
      {name && <input type="hidden" name={name} value={effective} />}
      <Label htmlFor={id}>Značka</Label>
      <Select value={mode} onValueChange={onSelect}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Vyberte značku" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>—</SelectItem>
          {CAR_BRANDS.map((b) => (
            <SelectItem key={b} value={b}>
              {b}
            </SelectItem>
          ))}
          <SelectItem value={OTHER}>Iné…</SelectItem>
        </SelectContent>
      </Select>
      {mode === OTHER && (
        <Input
          aria-label="Iná značka"
          data-brand-other
          placeholder="Zadajte značku"
          value={custom}
          onChange={(e) => onCustom(e.target.value)}
        />
      )}
    </div>
  );
}
