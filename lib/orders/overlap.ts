/**
 * Soft box-overlap detection (replaces the hard DB exclusion constraint dropped
 * in migration 0016). Overlapping reservations are *allowed*; the action layer
 * detects a clash and the UI asks the manager to confirm ("warn but allow").
 *
 * Pure here so the overlap rule is unit-tested in isolation; the actions fetch
 * candidate orders for the box and feed them in.
 */

/** Half-open interval overlap: `[aStart, aEnd) ∩ [bStart, bEnd) ≠ ∅`. */
export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/** One conflicting order, shaped for the confirm dialog. */
export interface OverlapOrder {
  id: string;
  box: number;
  startHHMM: string;
  endHHMM: string;
  /** Brand+model or ŠPZ — whatever identifies the car in the warning. */
  carLabel: string;
}

/** The soft-conflict payload an action returns when an overlap is detected. */
export interface OverlapInfo {
  orders: OverlapOrder[];
}

/** A live order considered as an overlap candidate (already box-scoped). */
export interface OverlapCandidate {
  id: string;
  box: number;
  startMs: number;
  endMs: number;
  deleted: boolean;
  /** `nedostavil_sa` frees the slot, so it never conflicts (data-model §2.7). */
  noShow: boolean;
}

/**
 * Candidates (same box) that overlap `[startMs, endMs)`, excluding the order
 * itself (edit/move), soft-deleted, and no-show orders. Returns the candidate
 * ids — the caller maps them to display rows.
 */
export function selectOverlapping(
  candidates: OverlapCandidate[],
  startMs: number,
  endMs: number,
  excludeOrderId?: string,
): OverlapCandidate[] {
  return candidates.filter(
    (c) =>
      c.id !== excludeOrderId &&
      !c.deleted &&
      !c.noShow &&
      rangesOverlap(startMs, endMs, c.startMs, c.endMs),
  );
}
