/**
 * Pure window calculator used by the reminder Route Handler. The cron job
 * fires every minute; each invocation looks for orders whose start is ~30 min
 * out. The ±WINDOW_MIN slack catches an order exactly once even with cron
 * jitter; the second guard against doubles is `orders.reminded_at` (spec §2.4).
 */
export const WINDOW_MIN = 2;

export interface ReminderWindow {
  from: Date;
  to: Date;
}

export function reminderWindow(now: Date, windowMin: number = WINDOW_MIN): ReminderWindow {
  const target = new Date(now.getTime() + 30 * 60_000);
  const from = new Date(target.getTime() - windowMin * 60_000);
  const to = new Date(target.getTime() + windowMin * 60_000);
  return { from, to };
}

export function shouldRemind(now: Date, startsAt: Date, windowMin: number = WINDOW_MIN): boolean {
  const { from, to } = reminderWindow(now, windowMin);
  return startsAt.getTime() >= from.getTime() && startsAt.getTime() < to.getTime();
}
