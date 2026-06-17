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

/** Shown wherever a plateless car has no brand/model to identify it either. */
export const NO_SPZ_LABEL = "Bez ŠPZ";

/**
 * Headline label for a car: the ŠPZ when present, otherwise the brand/model,
 * falling back to "Bez ŠPZ" only when the car has neither (which the add-car
 * form prevents going forward, but legacy/edge rows may still hit).
 */
export function formatCarPrimary(car: {
  spz?: string | null;
  brand?: string | null;
  model?: string | null;
}): string {
  return car.spz ?? (formatCarLabel(car.brand, car.model) || NO_SPZ_LABEL);
}
