/**
 * Side-by-side lane assignment for overlapping bookings (overlapping-reservations
 * redesign). Orders connected by overlap form a "cluster"; the cluster is split
 * into equal-width lanes, one per order (2 orders → halves, 3 → thirds, …). Each
 * order keeps its own lane (no reuse) so the count matches the client's mental
 * model. Non-overlapping orders are their own cluster (one full-width lane).
 *
 * Pure + unit-tested; the Day/Week views and the Step-4 picker share it.
 */

export interface LaneItem {
  /** Local minutes-from-midnight (or any consistent unit). */
  startMin: number;
  endMin: number;
}

export interface LanePlacement {
  /** 0-based column index within the cluster. */
  lane: number;
  /** Total lanes in this order's cluster (the divisor for the width). */
  lanes: number;
}

/**
 * Assign each item a `{ lane, lanes }`. Items are grouped into clusters where a
 * new item joins the current cluster if it starts before the cluster's running
 * max end (transitive overlap); the cluster's lane count is its size and each
 * member gets a distinct lane in start order. Returns placements in the SAME
 * order as the input.
 */
export function assignLanes<T extends LaneItem>(items: T[]): Array<T & LanePlacement> {
  const order = items.map((_, i) => i).sort((a, b) => {
    const d = items[a].startMin - items[b].startMin;
    return d !== 0 ? d : items[a].endMin - items[b].endMin;
  });

  const placement = new Array<LanePlacement>(items.length);
  let cluster: number[] = []; // original indices, in start order
  let clusterEnd = -Infinity;

  const flush = () => {
    const lanes = cluster.length;
    cluster.forEach((origIdx, lane) => {
      placement[origIdx] = { lane, lanes };
    });
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const idx of order) {
    const it = items[idx];
    if (cluster.length > 0 && it.startMin >= clusterEnd) flush();
    cluster.push(idx);
    clusterEnd = Math.max(clusterEnd, it.endMin);
  }
  if (cluster.length > 0) flush();

  return items.map((it, i) => ({ ...it, ...placement[i] }));
}
