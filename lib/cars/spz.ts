/**
 * ŠPZ (license plate) normalization (spec 02 §2.2): uppercase, strip spaces and
 * dashes, so `BV 123 AB`, `bv123ab`, and `BV123AB ` collide to one value — which
 * is what triggers the shared-ŠPZ link prompt instead of a duplicate row. Pure +
 * unit-tested (spec 02 §4.3).
 *
 * Returns the normalized plate, or `null` if it cannot be a plausible plate.
 */
export function normalizeSpz(raw: string): string | null {
  if (!raw) return null;
  const s = raw.replace(/[\s\-]/g, "").toUpperCase();
  // Alphanumeric, 3–12 chars (covers SK plates and common foreign ones).
  if (!/^[A-Z0-9]{3,12}$/.test(s)) return null;
  return s;
}
