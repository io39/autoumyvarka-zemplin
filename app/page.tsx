import Link from "next/link";
import { getCurrentStaff } from "@/lib/auth/session";
import { getIdentity } from "@/lib/auth/identity";
import { isUnauthenticatedError } from "@/lib/auth/errors";
import { UnauthenticatedView } from "@/components/auth/auth-error-views";
import { Calendar } from "@/components/calendar/calendar";
import { getCalendar } from "@/lib/actions/orders";
import { getOpeningHours, getDayOverrides } from "@/lib/actions/settings";
import { mintRealtimeToken } from "@/lib/realtime/token";
import { Badge } from "@/components/ui/badge";

const ROLE_LABEL: Record<string, string> = {
  manazer: "Manažér",
  prevadzka: "Prevádzka",
};

function todayBratislava(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(
    new Date(),
  );
}

function normalizeDate(input: string | string[] | undefined): string {
  const v = Array.isArray(input) ? input[0] : input;
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return todayBratislava();
}

function normalizeView(input: string | string[] | undefined): "day" | "week" {
  const v = Array.isArray(input) ? input[0] : input;
  return v === "week" ? "week" : "day";
}

/** Monday-anchored 7-day key range for the week containing `dateKey`. */
function weekRange(dateKey: string): { from: string; to: string } {
  const [y, m, d] = dateKey.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = (probe.getUTCDay() + 6) % 7; // 0=Mon..6=Sun
  const monday = new Date(probe);
  monday.setUTCDate(monday.getUTCDate() - dow);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return { from: fmt(monday), to: fmt(sunday) };
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

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-3 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-medium">{staff.display_name}</h1>
          <p className="text-xs text-muted-foreground">{staff.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={staff.role === "manazer" ? "default" : "secondary"}>
            {ROLE_LABEL[staff.role] ?? staff.role}
          </Badge>
          <Link href="/menu" className="text-sm underline underline-offset-4">
            Menu
          </Link>
        </div>
      </header>

      <Calendar
        initialBlocks={blocks}
        hours={hours}
        overrides={overrides}
        date={date}
        view={view}
        realtimeJwt={realtimeJwt}
      />
    </main>
  );
}
