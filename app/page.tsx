import { getCurrentStaff } from "@/lib/auth/session";
import { getIdentity } from "@/lib/auth/identity";
import { isUnauthenticatedError } from "@/lib/auth/errors";
import { UnauthenticatedView } from "@/components/auth/auth-error-views";
import { CalendarView } from "@/components/calendar/CalendarView";
import { getCalendar, getUnpaidCount } from "@/lib/actions/orders";
import { getOpeningHours, getDayOverrides } from "@/lib/actions/settings";
import { mintRealtimeToken } from "@/lib/realtime/token";
import { weekRange } from "@/lib/calendar/grid";
import { todayKey } from "@/lib/calendar/today";
import type { CalendarView as ViewMode } from "@/lib/calendar/types";

function normalizeDate(input: string | string[] | undefined): string {
  const v = Array.isArray(input) ? input[0] : input;
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return todayKey(new Date());
}

function normalizeView(input: string | string[] | undefined): ViewMode {
  const v = Array.isArray(input) ? input[0] : input;
  return v === "week" ? "week" : "day";
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let staff;
  try {
    staff = await getCurrentStaff();
  } catch (error) {
    if (isUnauthenticatedError(error)) return <UnauthenticatedView />;
    throw error;
  }

  const params = await searchParams;
  const date = normalizeDate(params.date);
  const view = normalizeView(params.view);
  const range = view === "week" ? weekRange(date) : { from: date, to: date };

  const [blocks, hours, overrides, identity] = await Promise.all([
    getCalendar({ view, date }),
    getOpeningHours(),
    getDayOverrides(range),
    getIdentity(),
  ]);
  const realtimeJwt = await mintRealtimeToken(identity);
  // Overdue badge is manager-only; getUnpaidCount throws for workers, so only
  // call it for managers (workers never see the badge — spec 10 §1.4).
  const unpaidCount = staff.role === "manazer" ? await getUnpaidCount() : 0;

  return (
    <CalendarView
      initialBlocks={blocks}
      hours={hours}
      overrides={overrides}
      date={date}
      view={view}
      realtimeJwt={realtimeJwt}
      staffName={staff.display_name}
      role={staff.role}
      unpaidCount={unpaidCount}
    />
  );
}
