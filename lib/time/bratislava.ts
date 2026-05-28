/**
 * Bratislava-local ↔ UTC conversions. Centralised so the booking form,
 * suggested-slot generator, and e2e tests use the exact same DST-aware
 * conversion (was duplicated 3× before this module existed).
 *
 * Strategy: probe ±2h of plausible offsets (CET = +01, CEST = +02) and
 * pick the one whose rendering in Europe/Bratislava round-trips back to
 * the desired local clock. No timezone library required.
 */

const TZ = "Europe/Bratislava";

/** "YYYY-MM-DD" + "HH:MM" local → UTC `Date`. */
export function bratislavaLocalToUTC(dateKey: string, hhmm: string): Date {
  const [y, mo, d] = dateKey.split("-").map(Number);
  const [h, m] = hhmm.split(":").map(Number);
  for (const offsetMin of [-60, -120, 0, 60, 120]) {
    const utcMs = Date.UTC(y, mo - 1, d, h, m) - offsetMin * 60 * 1000;
    const cand = new Date(utcMs);
    if (renderLocalDateKey(cand) === dateKey && renderLocalHHMM(cand) === hhmm) {
      return cand;
    }
  }
  // Fallback (should be unreachable for valid SK dates).
  return new Date(Date.UTC(y, mo - 1, d, h, m));
}

/** Same as `bratislavaLocalToUTC` but returns an ISO 8601 string. */
export function bratislavaLocalToISO(dateKey: string, hhmm: string): string {
  return bratislavaLocalToUTC(dateKey, hhmm).toISOString();
}

/**
 * UTC start (inclusive) and end (exclusive) of a Bratislava-local date,
 * as `Date`s. Useful as a query range when filtering `timestamptz` columns
 * by local calendar day.
 */
export function bratislavaLocalDayRange(dateKey: string): { start: Date; end: Date } {
  const start = bratislavaLocalToUTC(dateKey, "00:00");
  const [y, mo, d] = dateKey.split("-").map(Number);
  // Compute the next local date the same way (handles month/year rollovers).
  const next = new Date(Date.UTC(y, mo - 1, d + 1));
  const nextKey = `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
  const end = bratislavaLocalToUTC(nextKey, "00:00");
  return { start, end };
}

// ---------------------------------------------------------------------------
// internal: local renderers (kept here to avoid a circular dep with
// lib/settings/availability — the resolver imports its own copies).
// ---------------------------------------------------------------------------

function renderLocalDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

function renderLocalHHMM(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
