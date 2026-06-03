/**
 * Combine a car's optional brand (značka) and model into one display label,
 * e.g. "Škoda Octavia". Either side may be missing:
 *   brand + model → "Škoda Octavia"
 *   brand only    → "Škoda"
 *   model only    → "Octavia"
 *   neither       → "" (callers fall back to ŠPZ or "—")
 */
export function formatCarLabel(brand: string | null | undefined, model: string | null | undefined): string {
  return [brand, model]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s))
    .join(" ");
}
