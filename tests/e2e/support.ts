import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";
import { bratislavaLocalToISO } from "@/lib/time/bratislava";

/** Edge identities seeded in supabase/seed.sql. */
export const MANAGER_EMAIL = "filicko203@gmail.com";
export const WORKER_EMAIL = "pracovnik@autoumyvaren.local";

/** Cloudflare Access header the app reads to resolve identity. */
export function accessHeaders(email: string): Record<string, string> {
  return { "Cf-Access-Authenticated-User-Email": email };
}

/** A unique email so create-staff tests never collide across runs. */
export function uniqueEmail(prefix = "e2e"): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@test.local`;
}

/** A unique SK mobile number (national form) — normalizes to +4219……. */
export function uniquePhone(): string {
  const eight = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 100)).padStart(2, "0");
  return `09${eight}`; // 10 national digits
}

/** A unique alphanumeric ŠPZ. */
export function uniqueSpz(prefix = "TT"): string {
  return `${prefix}${String(Date.now()).slice(-5)}${Math.floor(Math.random() * 10)}`;
}

/** Create a client through the /clients UI; returns the new client's id (from the URL). */
export async function createClientViaUI(
  page: Page,
  opts: { phone: string; name?: string },
): Promise<string> {
  await page.goto("/clients");
  await page.getByRole("button", { name: "Nový zákazník" }).click();
  await page.getByLabel("Telefón").fill(opts.phone);
  if (opts.name) await page.getByLabel("Meno").fill(opts.name);
  await page.getByRole("button", { name: "Vytvoriť" }).click();
  // Master-detail: a created client opens inline via ?id= (spec 17).
  await page.waitForURL(/\/clients\?id=[0-9a-f-]{36}/);
  const m = page.url().match(/[?&]id=([0-9a-f-]{36})/);
  expect(m).not.toBeNull();
  return m![1];
}

/** Add a car to the currently-open client detail page via the dialog. */
export async function addCarViaUI(page: Page, spz: string): Promise<void> {
  await page.getByRole("button", { name: "Pridať auto" }).click();
  await page.getByLabel("ŠPZ").fill(spz);
  await page.getByRole("button", { name: "Pridať" }).click();
}

/**
 * Service-role Supabase client for test-side DB assertions (e.g. reading
 * audit_log). Bypasses RLS by design — same as the app server.
 */
export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Pick a Bratislava-local YYYY-MM-DD on a Mon–Fri weekday between 7 and ~120
 * days out. Random offset per call so parallel seedOrder()s in different
 * tests don't collide on the (box, starts_at) exclusion constraint. The
 * seeded weekday opening hours (Mon–Fri 08:00–17:00) apply.
 */
export function nextWeekdayDate(offsetDays = 7, spread = 100): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays + Math.floor(Math.random() * spread));
  const dow = d.getDay();
  if (dow === 0) d.setDate(d.getDate() + 1);
  if (dow === 6) d.setDate(d.getDate() + 2);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(d);
}

/**
 * Far-future weekday date for `seedOrder`. Sits well past the date range used
 * by `orders-create-and-conflict.spec.ts` (which uses ~7..120 days out via
 * `nextWeekdayDate`), so spec 06 lifecycle fixtures never collide with the
 * booking-conflict suite's fixed-slot orders even when tests run back-to-back
 * against the same DB.
 */
function seedDate(): string {
  return nextWeekdayDate(800, 1500);
}

type OrderStatusLite = "vytvorena" | "hotova" | "zaplatena" | "nedostavil_sa";

/** Bratislava-local YYYY-MM-DD offset by `days` from today (negative = past). */
export function bratislavaDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(d);
}

/**
 * Seed a fresh client + car + one order on a specific local date (incl. PAST
 * dates for the spec 10 overdue tests, which the future-only seeders can't do)
 * with a single "Interiér Classic" line whose `paid` flag is controllable.
 * Direct DB insert bypasses the action's opening-hours check; retries on the
 * box-overlap exclusion constraint by jittering box + time.
 */
export async function seedDatedOrder(opts: {
  date: string;
  status?: OrderStatusLite;
  linePaid?: boolean;
  name?: string;
}): Promise<{ orderId: string; lineId: string; clientId: string; carId: string; spz: string }> {
  const db = serviceClient();
  const { data: manager } = await db
    .from("staff")
    .select("id")
    .eq("email", MANAGER_EMAIL)
    .single();

  const phone = `+421${uniquePhone().slice(1)}`;
  const { data: client } = await db
    .from("clients")
    .insert({ phone, name: opts.name ?? "Nezaplatený klient" })
    .select("id")
    .single();
  const spz = uniqueSpz("UP");
  const { data: car } = await db
    .from("cars")
    .insert({ spz, pricing_category: "os" })
    .select("id")
    .single();
  await db.from("client_cars").insert({ client_id: client!.id, car_id: car!.id });

  const { data: service } = await db
    .from("services")
    .select("id, name")
    .eq("name", "Interiér Classic")
    .single();
  const { data: price } = await db
    .from("service_prices")
    .select("duration_min, price_cents")
    .eq("service_id", service!.id)
    .eq("pricing_category", "os")
    .single();
  const duration = price!.duration_min ?? 60;

  // Keep seeded starts within 10:00–15:00 local (so even the raw UTC timestamp,
  // CEST −2h, stays in-hours) and the booking ends before the 17:00 close.
  const TIMES = ["10:00", "10:30", "11:00", "13:00", "13:30", "14:00", "14:30", "15:00"];
  let order: { id: string } | null = null;
  for (let attempt = 0; attempt < 25; attempt++) {
    const time = TIMES[Math.floor(Math.random() * TIMES.length)];
    const startsAt = bratislavaLocalToISO(opts.date, time);
    const res = await db
      .from("orders")
      .insert({
        client_id: client!.id,
        car_id: car!.id,
        box: Math.random() < 0.5 ? 1 : 2,
        starts_at: startsAt,
        duration_min: duration,
        ends_at: new Date(new Date(startsAt).getTime() + duration * 60_000).toISOString(),
        status: opts.status ?? "hotova",
        created_by: manager!.id,
      })
      .select("id")
      .single();
    if (res.data) {
      order = res.data;
      break;
    }
    if (res.error && (res.error as { code?: string }).code === "23P01") continue;
    throw new Error(`seedDatedOrder failed: ${res.error?.message ?? "no row returned"}`);
  }
  if (!order) throw new Error("seedDatedOrder: exhausted retries finding a free slot");

  const { data: line } = await db
    .from("order_services")
    .insert({
      order_id: order.id,
      service_id: service!.id,
      name_snapshot: service!.name,
      category_snapshot: "os",
      quantity: 1,
      duration_min_snapshot: duration,
      price_cents_snapshot: price!.price_cents,
      paid: opts.linePaid ?? false,
      added_by: manager!.id,
    })
    .select("id")
    .single();

  return { orderId: order.id, lineId: line!.id, clientId: client!.id, carId: car!.id, spz };
}

/**
 * Insert one order (+ a single service line, optional assigned worker) for an
 * *existing* client+car. Retries on the box-overlap exclusion constraint with a
 * fresh far-future date. For the spec 08 history tests, where we need several
 * orders on the same (possibly shared) car.
 */
export async function seedOrderFor(opts: {
  clientId: string;
  carId: string;
  status?: OrderStatusLite;
  workerName?: string;
}): Promise<{ orderId: string }> {
  const db = serviceClient();

  const { data: manager } = await db
    .from("staff")
    .select("id")
    .eq("email", MANAGER_EMAIL)
    .single();

  const { data: service } = await db
    .from("services")
    .select("id, name")
    .eq("name", "Interiér Classic")
    .single();
  const { data: price } = await db
    .from("service_prices")
    .select("duration_min, price_cents")
    .eq("service_id", service!.id)
    .eq("pricing_category", "os")
    .single();
  const duration = price!.duration_min ?? 60;

  const SAFE_TIMES = ["11:00", "11:30", "12:00", "12:30"];
  let order: { id: string } | null = null;
  for (let attempt = 0; attempt < 25; attempt++) {
    const date = seedDate();
    const time = SAFE_TIMES[Math.floor(Math.random() * SAFE_TIMES.length)];
    const startsAt = bratislavaLocalToISO(date, time);
    const res = await db
      .from("orders")
      .insert({
        client_id: opts.clientId,
        car_id: opts.carId,
        box: Math.random() < 0.5 ? 1 : 2,
        starts_at: startsAt,
        duration_min: duration,
        ends_at: new Date(new Date(startsAt).getTime() + duration * 60_000).toISOString(),
        status: opts.status ?? "vytvorena",
        created_by: manager!.id,
      })
      .select("id")
      .single();
    if (res.data) {
      order = res.data;
      break;
    }
    if (res.error && (res.error as { code?: string }).code === "23P01") continue;
    throw new Error(`seedOrderFor failed: ${res.error?.message ?? "no row returned"}`);
  }
  if (!order) throw new Error("seedOrderFor: exhausted retries finding a free slot");

  await db.from("order_services").insert({
    order_id: order.id,
    service_id: service!.id,
    name_snapshot: service!.name,
    category_snapshot: "os",
    quantity: 1,
    duration_min_snapshot: duration,
    price_cents_snapshot: price!.price_cents,
    added_by: manager!.id,
  });

  if (opts.workerName) {
    const { data: worker } = await db
      .from("workers")
      .select("id")
      .eq("display_name", opts.workerName)
      .single();
    await db.from("order_staff").insert({
      order_id: order.id,
      worker_id: worker!.id,
      assigned_by: manager!.id,
    });
  }

  return { orderId: order.id };
}

interface SeededOrder {
  orderId: string;
  clientId: string;
  carId: string;
  serviceId: string;
  serviceLineId: string;
  date: string;
  startsAt: string;
  endsAt: string;
}

/**
 * Seed a fresh client + car + a single 60-min order at 09:00 in box 1 with one
 * line for "Interiér Classic". Used by spec 06 lifecycle tests where the
 * booking flow itself isn't under test.
 */
export async function seedOrder(opts?: {
  status?: "vytvorena" | "hotova" | "zaplatena" | "nedostavil_sa";
  box?: 1 | 2;
  date?: string;
  time?: string;
}): Promise<SeededOrder> {
  const db = serviceClient();

  const { data: manager } = await db
    .from("staff")
    .select("id")
    .eq("email", MANAGER_EMAIL)
    .single();

  const phone = `+421${uniquePhone().slice(1)}`;
  const { data: client } = await db
    .from("clients")
    .insert({ phone, name: "E2E klient" })
    .select("id")
    .single();
  const { data: car } = await db
    .from("cars")
    .insert({ spz: uniqueSpz("OD"), pricing_category: "os" })
    .select("id")
    .single();
  await db.from("client_cars").insert({ client_id: client!.id, car_id: car!.id });

  const { data: service } = await db
    .from("services")
    .select("id, name")
    .eq("name", "Interiér Classic")
    .single();
  const { data: price } = await db
    .from("service_prices")
    .select("duration_min, price_cents")
    .eq("service_id", service!.id)
    .eq("pricing_category", "os")
    .single();

  const date = opts?.date ?? seedDate();
  // Default time stays inside an 11:00–12:45 window that does NOT overlap
  // the fixed slots used by orders-create-and-conflict.spec (09:00/09:30
  // bookings, 13:00 worker booking). Combined with a wide random date, this
  // keeps the (box, [start, end)) exclusion constraint quiet across suites.
  const SAFE_TIMES = ["11:00", "11:30", "12:00", "12:30"];
  const defaultTime = SAFE_TIMES[Math.floor(Math.random() * SAFE_TIMES.length)];
  const time = opts?.time ?? defaultTime;
  const startsAt = bratislavaLocalToISO(date, time);
  const duration = price!.duration_min ?? 60;

  // Retry the order insert with a fresh random date if the exclusion
  // constraint catches another parallel test on the same (box, time) slot.
  // We refuse to silently succeed with `data: null`.
  let order: { id: string; ends_at: string } | null = null;
  let attemptStart = startsAt;
  let attemptDate = date;
  for (let attempt = 0; attempt < 25; attempt++) {
    const res = await db
      .from("orders")
      .insert({
        client_id: client!.id,
        car_id: car!.id,
        box: opts?.box ?? 1,
        starts_at: attemptStart,
        duration_min: duration,
        ends_at: new Date(new Date(attemptStart).getTime() + duration * 60_000).toISOString(),
        status: opts?.status ?? "vytvorena",
        created_by: manager!.id,
      })
      .select("id, ends_at")
      .single();
    if (res.data) {
      order = res.data;
      break;
    }
    if (res.error && (res.error as { code?: string }).code === "23P01") {
      // Only auto-rotate the date when the caller didn't pin one. If they
      // intentionally targeted a specific date/time/box (e.g. to reproduce a
      // rebooked-slot scenario), surface the conflict.
      if (opts?.date) {
        throw new Error(`seedOrder conflict at ${attemptStart}: ${res.error.message}`);
      }
      attemptDate = seedDate();
      attemptStart = bratislavaLocalToISO(attemptDate, time);
      continue;
    }
    throw new Error(
      `seedOrder failed: ${res.error?.message ?? "no row returned"} (code=${(res.error as { code?: string } | null)?.code})`,
    );
  }
  if (!order) throw new Error("seedOrder: exhausted retries finding a free slot");
  const startsAtFinal = attemptStart;
  const dateFinal = attemptDate;

  const { data: line } = await db
    .from("order_services")
    .insert({
      order_id: order.id,
      service_id: service!.id,
      name_snapshot: service!.name,
      category_snapshot: "os",
      quantity: 1,
      duration_min_snapshot: duration,
      price_cents_snapshot: price!.price_cents,
      added_by: manager!.id,
    })
    .select("id")
    .single();

  return {
    orderId: order.id,
    clientId: client!.id,
    carId: car!.id,
    serviceId: service!.id,
    serviceLineId: line!.id,
    date: dateFinal,
    startsAt: startsAtFinal,
    endsAt: order.ends_at,
  };
}

// ---------------------------------------------------------------------------
// Booking-wizard helpers (spec 16)
// ---------------------------------------------------------------------------

/** Seed a searchable client with one "os" car directly in the DB. */
export async function seedClientWithCar(): Promise<{
  clientId: string;
  carId: string;
  phone: string;
}> {
  const db = serviceClient();
  const phone = `+421${uniquePhone().slice(1)}`;
  const { data: client } = await db
    .from("clients")
    .insert({ phone, name: `Wizard ${Date.now()}` })
    .select("id")
    .single();
  const { data: car } = await db
    .from("cars")
    .insert({ spz: uniqueSpz("WZ"), pricing_category: "os" })
    .select("id")
    .single();
  await db.from("client_cars").insert({ client_id: client!.id, car_id: car!.id });
  return { clientId: client!.id, carId: car!.id, phone };
}

/** Bratislava-local today "YYYY-MM-DD". */
export function bratislavaTodayKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(new Date());
}

function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T12:00:00Z`).getTime();
  const db = new Date(`${b}T12:00:00Z`).getTime();
  return Math.round((db - da) / 86_400_000);
}

/**
 * Step the wizard's date control forward (Deň view) until `target` is shown.
 * Navigates until the day column appears rather than clicking a fixed count, so
 * it can't under-shoot if a re-render lags between clicks.
 */
export async function wizardGoToDate(page: Page, target: string): Promise<void> {
  const dayCol = page.locator(`[data-step="termin"] [data-day="${target}"]`);
  for (let i = 0; i <= daysBetween(bratislavaTodayKey(), target) + 5; i++) {
    await expect(page.getByText("Načítavam voľné termíny…")).toHaveCount(0);
    if ((await dayCol.count()) > 0) return;
    await page.getByRole("button", { name: "Nasledujúci" }).click();
  }
  throw new Error(`wizardGoToDate: could not reach ${target}`);
}

/**
 * On wizard step 4 (interactive grid): click the first not-already-selected
 * "Najbližšie" quick-slot, advancing days until one is found. Returns the slot.
 */
export async function pickAFreeSlot(
  page: Page,
): Promise<{ date: string; box: number; localStart: string }> {
  for (let i = 0; i < 10; i++) {
    await expect(page.getByText("Načítavam voľné termíny…")).toHaveCount(0);
    const slots = page.locator('[data-step="termin"] [data-quick-slot]');
    const n = await slots.count();
    for (let j = 0; j < n; j++) {
      const s = slots.nth(j);
      if ((await s.getAttribute("aria-pressed")) !== "true") {
        const value = (await s.getAttribute("data-quick-slot"))!; // "YYYY-MM-DD-box-HH:MM"
        await s.click();
        const m = value.match(/^(\d{4}-\d{2}-\d{2})-(\d)-(\d{2}:\d{2})$/)!;
        return { date: m[1], box: Number(m[2]), localStart: m[3] };
      }
    }
    await page.getByRole("button", { name: "Nasledujúci" }).click();
  }
  throw new Error("no free quick-slot found within range");
}
