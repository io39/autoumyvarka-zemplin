import type { CalendarBlock } from "@/lib/actions/orders";
import { bratislavaHHMM } from "@/lib/settings/availability";
import { diffMinutes } from "@/lib/calendar/grid";
import { assignLanes, type LanePlacement } from "@/lib/calendar/lanes";

export interface PlacedBlock extends LanePlacement {
  block: CalendarBlock;
  /** Minutes from the grid's open time. */
  startMin: number;
  endMin: number;
}

/**
 * Lane-place the blocks of one box for the calendar (overlapping-reservations
 * redesign): minute offsets from `openHHMM`, then `assignLanes`. Returns the
 * placed blocks and the box's lane count (max lanes across its clusters) used to
 * size the column. Shared by the Day and Week views.
 */
export function placeBoxLanes(
  blocks: CalendarBlock[],
  box: 1 | 2,
  openHHMM: string,
): { placed: PlacedBlock[]; lanes: number } {
  const items = blocks
    .filter((b) => b.order.box === box)
    .map((b) => ({
      block: b,
      startMin: diffMinutes(openHHMM, bratislavaHHMM(new Date(b.order.starts_at))),
      endMin: diffMinutes(openHHMM, bratislavaHHMM(new Date(b.order.ends_at))),
    }));
  const placed = assignLanes(items);
  const lanes = placed.reduce((m, p) => Math.max(m, p.lanes), 1);
  return { placed, lanes };
}
