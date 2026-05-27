/**
 * Phone normalization to E.164 (spec 02 §2.2). Slovak default region for bare
 * national numbers, so `0905…`, `+421905…`, and `00421 905…` all converge to one
 * value — both on insert and on lookup. Pure + unit-tested (spec 02 §4.3).
 *
 * Returns the normalized `+<digits>` string, or `null` if the input cannot be a
 * plausible phone number (the caller turns null into a friendly Slovak error).
 */
const SK_COUNTRY_CODE = "421";

export function normalizePhone(raw: string): string | null {
  if (!raw) return null;

  // Strip everything that's formatting noise.
  let s = raw.replace(/[\s\-().]/g, "");
  if (s === "") return null;

  if (s.startsWith("00")) {
    s = "+" + s.slice(2); // international prefix → E.164 plus
  } else if (s.startsWith("+")) {
    // already E.164-shaped
  } else if (s.startsWith("0")) {
    s = `+${SK_COUNTRY_CODE}${s.slice(1)}`; // national trunk 0 → +421
  } else if (/^\d+$/.test(s)) {
    s = `+${SK_COUNTRY_CODE}${s}`; // bare national subscriber number
  }

  // E.164: a leading + followed by 8–15 digits.
  if (!/^\+\d{8,15}$/.test(s)) return null;
  return s;
}

/** Digits only (no leading +), for trigram/partial matching against the stored phone. */
export function phoneDigits(normalized: string): string {
  return normalized.replace(/\D/g, "");
}
