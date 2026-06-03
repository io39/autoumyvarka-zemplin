"use client";

import { useId, useState } from "react";
import { CAR_BRANDS } from "@/lib/cars/brands";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Lowercase + strip diacritics so "skod" matches "Škoda". */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Substring match, or fuzzy subsequence as a fallback (both diacritic-insensitive). */
function fuzzyMatch(query: string, target: string): boolean {
  const q = norm(query);
  if (!q) return true;
  const t = norm(target);
  if (t.includes(q)) return true;
  let i = 0;
  for (const ch of t) {
    if (ch === q[i]) i += 1;
    if (i === q.length) return true;
  }
  return false;
}

const MAX_SUGGESTIONS = 8;

/**
 * Optional car brand (značka) input: a free-text box with a fuzzy-filtered
 * suggestion list of known brands. Typing is primary — any value is allowed
 * (so brands not in the list just get typed), suggestions only autocomplete.
 * Uncontrolled — initialised once from `initial`; reports the brand ("" = none)
 * via `onChange` and/or a hidden input named `name` for `<form>`/FormData.
 */
export function BrandField({
  initial = "",
  onChange,
  name,
  id = "car-brand",
}: {
  initial?: string;
  onChange?: (brand: string) => void;
  name?: string;
  id?: string;
}) {
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();

  const matches = open
    ? CAR_BRANDS.filter((b) => fuzzyMatch(value, b)).slice(0, MAX_SUGGESTIONS)
    : [];

  function set(v: string) {
    setValue(v);
    onChange?.(v.trim());
  }
  function pick(brand: string) {
    set(brand);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(matches[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="space-y-1">
      {name && <input type="hidden" name={name} value={value.trim()} />}
      <Label htmlFor={id}>Značka</Label>
      <div className="relative">
        <Input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="Začnite písať…"
          value={value}
          onChange={(e) => {
            set(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          // Delay close so a suggestion's click registers (it also uses
          // onMouseDown preventDefault, but blur can still fire first).
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {matches.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          >
            {matches.map((b, i) => (
              <li
                key={b}
                role="option"
                aria-selected={i === active}
                // preventDefault keeps the input focused so the click lands.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(b);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "cursor-pointer rounded-sm px-2 py-1.5 text-sm",
                  i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                )}
              >
                {b}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
