/**
 * Money + duration formatters for the service catalog (Slovak locale).
 * Prices are stored as integer cents; display is `18,90 €` (comma decimal).
 */

const PRICE_FORMATTER = new Intl.NumberFormat("sk-SK", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPriceCents(cents: number, opts?: { from?: boolean }): string {
  const formatted = PRICE_FORMATTER.format(cents / 100);
  return opts?.from ? `od ${formatted}` : formatted;
}

export function formatDurationMin(min: number | null): string {
  if (min === null) return "—";
  return `${min} min`;
}

/**
 * Parse a user-typed euro amount (e.g. `18,90`, `18.90`, `30`) into integer
 * cents. Accepts a comma or dot decimal separator and ignores spaces / a `€`.
 * Returns null for an empty or non-numeric string (so the caller can treat it
 * as "no override"); negative values are rejected.
 */
export function parseEurosToCents(value: string): number | null {
  const cleaned = value.replace(/[\s€]/g, "").replace(",", ".");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const cents = Math.round(parseFloat(cleaned) * 100);
  return Number.isFinite(cents) && cents >= 0 ? cents : null;
}

/** Format cents as a plain euro amount for an editable field (`18,90`, no €). */
export function formatCentsForInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
