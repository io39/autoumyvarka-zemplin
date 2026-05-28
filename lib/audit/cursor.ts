/**
 * Opaque keyset cursor over (created_at, id) for the audit log (spec 09 §2.2).
 * Base64 so callers don't depend on the shape. `created_at` may contain any
 * character except the "|" separator; `id` is a uuid, so splitting on the LAST
 * "|" is unambiguous even if a timestamp ever contained one.
 */
export function encodeAuditCursor(row: { created_at: string; id: string }): string {
  return Buffer.from(`${row.created_at}|${row.id}`, "utf8").toString("base64");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// ISO 8601 timestamp as Postgres/PostgREST emit it (date, time, optional
// fractional seconds, tz offset or Z). Deliberately strict: the decoded value
// is interpolated into a PostgREST filter string, so anything else is rejected.
const ISO_TS_RE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

export function decodeAuditCursor(
  cursor: string,
): { createdAt: string; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64").toString("utf8");
    const idx = raw.lastIndexOf("|");
    if (idx < 0) return null;
    const createdAt = raw.slice(0, idx);
    const id = raw.slice(idx + 1);
    // Validate shape before the caller interpolates these into a filter: id
    // must be a uuid, created_at an ISO timestamp. A crafted cursor (e.g. an
    // id containing a comma or paren) is rejected rather than altering the query.
    if (!UUID_RE.test(id)) return null;
    if (!ISO_TS_RE.test(createdAt)) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
