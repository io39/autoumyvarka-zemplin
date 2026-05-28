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
