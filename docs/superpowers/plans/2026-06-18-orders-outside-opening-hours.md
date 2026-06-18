# Orders Outside Opening Hours — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Warn the manager when an opening-hours change would leave existing upcoming orders outside hours, and surface those orders in a persistent manager worklist until rescheduled/cancelled.

**Architecture:** Detection is a pure, *derived* predicate (`isOutsideHours`) — never stored, so orders auto-drop from every warning once resolved. It reuses the spec-04 `isRangeOpen` availability resolver. Two surfaces mirror existing patterns: a warn-but-allow confirm at the settings actions (like `allowOverlap`) and a `/mimo-hodin` page + sidebar badge (like `/unpaid`). A small calendar marker flags a clamped out-of-hours card.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (service-role server client), Vitest (unit), Playwright (e2e), shadcn/ui, Tailwind.

**Design doc:** `docs/superpowers/specs/2026-06-18-orders-outside-opening-hours-design.md`

**Conventions:** All user-facing strings Slovak. Mutating actions are manager-only (`requireManager`) and zod-validated. No migration. Run `corepack pnpm <cmd>`. **e2e runs a prod build (`pnpm build && pnpm start`) — stop any `pnpm dev` on port 3000 first**, and run targeted e2e on a clean `corepack pnpm supabase db reset`.

---

## Task 1: Pure detection helper `isOutsideHours`

**Files:**
- Create: `lib/orders/out-of-hours.ts`
- Test: `tests/unit/orders/out-of-hours.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/orders/out-of-hours.test.ts
import { describe, it, expect } from "vitest";
import { isOutsideHours, type OutsideHoursInput } from "@/lib/orders/out-of-hours";
import type { OpeningHoursRow, DayOverrideRow } from "@/lib/supabase/types";

// Mon–Fri 08:00–17:00, Sat 08:00–12:00, Sun closed (matches seed).
const HOURS: OpeningHoursRow[] = [
  { day_of_week: 0, is_closed: false, open_time: "08:00:00", close_time: "17:00:00" },
  { day_of_week: 1, is_closed: false, open_time: "08:00:00", close_time: "17:00:00" },
  { day_of_week: 2, is_closed: false, open_time: "08:00:00", close_time: "17:00:00" },
  { day_of_week: 3, is_closed: false, open_time: "08:00:00", close_time: "17:00:00" },
  { day_of_week: 4, is_closed: false, open_time: "08:00:00", close_time: "17:00:00" },
  { day_of_week: 5, is_closed: false, open_time: "08:00:00", close_time: "12:00:00" },
  { day_of_week: 6, is_closed: true, open_time: null, close_time: null },
] as OpeningHoursRow[];
const NO_OVERRIDES: DayOverrideRow[] = [];
const TODAY = "2030-01-07"; // a Monday

// 2030-01-09 is a Wednesday (a weekday, open 08:00–17:00, in the future).
function order(start: string, end: string, over: Partial<OutsideHoursInput> = {}): OutsideHoursInput {
  return {
    starts_at: `${start}+01:00`,
    ends_at: `${end}+01:00`,
    status: "vytvorena",
    deleted_at: null,
    ...over,
  };
}

describe("isOutsideHours", () => {
  it("false for an upcoming order that fits the day's hours", () => {
    expect(isOutsideHours(order("2030-01-09T09:00:00", "2030-01-09T10:00:00"), HOURS, NO_OVERRIDES, TODAY)).toBe(false);
  });
  it("true for an upcoming order before open", () => {
    expect(isOutsideHours(order("2030-01-09T06:00:00", "2030-01-09T07:00:00"), HOURS, NO_OVERRIDES, TODAY)).toBe(true);
  });
  it("true for an upcoming order after close", () => {
    expect(isOutsideHours(order("2030-01-09T18:00:00", "2030-01-09T19:00:00"), HOURS, NO_OVERRIDES, TODAY)).toBe(true);
  });
  it("true when the day is closed (Sunday)", () => {
    // 2030-01-13 is a Sunday.
    expect(isOutsideHours(order("2030-01-13T09:00:00", "2030-01-13T10:00:00"), HOURS, NO_OVERRIDES, TODAY)).toBe(true);
  });
  it("true when a day_override closes that date", () => {
    const ov: DayOverrideRow[] = [
      { day: "2030-01-09", is_closed: true, open_time: null, close_time: null, label: null } as DayOverrideRow,
    ];
    expect(isOutsideHours(order("2030-01-09T09:00:00", "2030-01-09T10:00:00"), HOURS, ov, TODAY)).toBe(true);
  });
  it("false for a past order even if outside hours", () => {
    expect(isOutsideHours(order("2030-01-05T06:00:00", "2030-01-05T07:00:00"), HOURS, NO_OVERRIDES, TODAY)).toBe(false);
  });
  it("false for non-vytvorená status", () => {
    expect(isOutsideHours(order("2030-01-09T18:00:00", "2030-01-09T19:00:00", { status: "hotova" }), HOURS, NO_OVERRIDES, TODAY)).toBe(false);
  });
  it("false for a soft-deleted order", () => {
    expect(isOutsideHours(order("2030-01-09T18:00:00", "2030-01-09T19:00:00", { deleted_at: "2030-01-08T00:00:00Z" }), HOURS, NO_OVERRIDES, TODAY)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `corepack pnpm test:unit out-of-hours`
Expected: FAIL — `Cannot find module '@/lib/orders/out-of-hours'`.

- [ ] **Step 3: Implement the helper**

```ts
// lib/orders/out-of-hours.ts
import type { DayOverrideRow, OpeningHoursRow, OrderStatus } from "@/lib/supabase/types";
import { bratislavaDateKey, isRangeOpen } from "@/lib/settings/availability";

/**
 * "Outside opening hours" definition (spec 04/10) — DERIVED, never stored. An
 * order is flagged only when it is still actionable as a future scheduling
 * problem and no longer fits its day's open interval. Reuses `isRangeOpen`, so a
 * change to the hours config (or rescheduling the order) flips this with no
 * stored state to update. Orders are normally born inside hours (createOrder
 * enforces it); this catches the case where a manager narrows/closes hours after
 * the order already exists.
 */
export interface OutsideHoursInput {
  starts_at: string;
  ends_at: string;
  status: OrderStatus;
  deleted_at: string | null;
}

export function isOutsideHours(
  o: OutsideHoursInput,
  hours: OpeningHoursRow[],
  overrides: DayOverrideRow[],
  todayKey: string,
): boolean {
  if (o.deleted_at !== null) return false;
  if (o.status !== "vytvorena") return false; // only upcoming, not-done orders
  // YYYY-MM-DD keys sort lexicographically → a string compare is the date compare.
  if (bratislavaDateKey(new Date(o.starts_at)) < todayKey) return false; // past
  return !isRangeOpen(new Date(o.starts_at), new Date(o.ends_at), hours, overrides);
}
```

- [ ] **Step 4: Run the test; verify it passes**

Run: `corepack pnpm test:unit out-of-hours`
Expected: PASS (8 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
corepack pnpm typecheck
git add lib/orders/out-of-hours.ts tests/unit/orders/out-of-hours.test.ts
git commit -m "feat(orders): pure isOutsideHours detection helper"
```

---

## Task 2: List + count actions

**Files:**
- Modify: `lib/actions/orders.ts` (append new section near the spec-10 unpaid block, ~line 1545)

Note: `lib/actions/orders.ts` already imports `bratislavaDateKey` (from `@/lib/settings/availability`), `bratislavaLocalDayRange` (from `@/lib/time/bratislava`), `getServiceClient`, `getCurrentStaff`, `requireManager`, and the `CarRow`/`ClientRow`/`OrderRow` types.

- [ ] **Step 1: Add the imports the new code needs**

At the top of `lib/actions/orders.ts`, add to the existing `@/lib/settings/availability` import (which currently imports `bratislavaDateKey`, `bratislavaHHMM`) the `getOpenInterval` function, and import the helper:

```ts
import {
  bratislavaDateKey,
  bratislavaHHMM,
  getOpenInterval,
} from "@/lib/settings/availability";
import { isOutsideHours } from "@/lib/orders/out-of-hours";
```

(Keep the existing `import type { OverlapInfo } ...` and other imports as-is.)

- [ ] **Step 2: Append the row type + actions**

Append at the end of `lib/actions/orders.ts`:

```ts
// ---------------------------------------------------------------------------
// Orders outside opening hours (manager-only, read-only/derived — spec 04/10)
// ---------------------------------------------------------------------------

export interface OutsideHoursOrderRow {
  id: string;
  startsAt: string;
  clientName: string | null;
  clientPhone: string;
  spz: string | null;
  brand: string | null;
  model: string | null;
  /** The day's CURRENT open interval, or null when the day is closed. */
  dayHours: { open: string; close: string } | null;
}

interface OutsideHoursCandidate {
  id: string;
  starts_at: string;
  ends_at: string;
  status: OrderRow["status"];
  deleted_at: string | null;
  client: Pick<ClientRow, "name" | "phone"> | null;
  car: Pick<CarRow, "spz" | "brand" | "model"> | null;
}

/**
 * Upcoming vytvorená orders (today onward) that no longer fit the day's current
 * hours. Fetch-and-filter (Phase-1 volume is tiny); the date floor keeps the
 * candidate set small. Reused logic with the at-save check (settings.ts) — both
 * call `isOutsideHours`, differing only in which hours/overrides feed it.
 */
async function fetchOutsideHoursCandidates(): Promise<{
  candidates: OutsideHoursCandidate[];
  hours: OpeningHoursRow[];
  overrides: DayOverrideRow[];
  today: string;
}> {
  const db = getServiceClient();
  const today = bratislavaDateKey(new Date());
  const dayStart = bratislavaLocalDayRange(today).start;
  const [orders, hoursRes, overridesRes] = await Promise.all([
    db
      .from("orders")
      .select(
        "id, starts_at, ends_at, status, deleted_at, client:client_id(name, phone), car:car_id(spz, brand, model)",
      )
      .is("deleted_at", null)
      .eq("status", "vytvorena")
      .gte("starts_at", dayStart.toISOString())
      .order("starts_at"),
    db.from("opening_hours").select("*"),
    db.from("day_overrides").select("*"),
  ]);
  if (orders.error) throw orders.error;
  if (hoursRes.error) throw hoursRes.error;
  if (overridesRes.error) throw overridesRes.error;
  return {
    candidates: (orders.data ?? []) as unknown as OutsideHoursCandidate[],
    hours: (hoursRes.data ?? []) as OpeningHoursRow[],
    overrides: (overridesRes.data ?? []) as DayOverrideRow[],
    today,
  };
}

/** Manager-only list of upcoming orders now outside opening hours. */
export async function getOutsideHoursOrders(): Promise<OutsideHoursOrderRow[]> {
  const actor = await getCurrentStaff();
  requireManager(actor);
  const { candidates, hours, overrides, today } = await fetchOutsideHoursCandidates();

  const rows: OutsideHoursOrderRow[] = [];
  for (const c of candidates) {
    if (!isOutsideHours(c, hours, overrides, today)) continue;
    const interval = getOpenInterval(new Date(c.starts_at), hours, overrides);
    rows.push({
      id: c.id,
      startsAt: c.starts_at,
      clientName: c.client?.name ?? null,
      clientPhone: c.client?.phone ?? "",
      spz: c.car?.spz ?? null,
      brand: c.car?.brand ?? null,
      model: c.car?.model ?? null,
      dayHours: interval ? { open: interval.open, close: interval.close } : null,
    });
  }
  rows.sort((a, b) => a.startsAt.localeCompare(b.startsAt)); // soonest first
  return rows;
}

/** Lightweight count for the sidebar badge (manager-only). */
export async function getOutsideHoursCount(): Promise<number> {
  const actor = await getCurrentStaff();
  requireManager(actor);
  const { candidates, hours, overrides, today } = await fetchOutsideHoursCandidates();
  return candidates.filter((c) => isOutsideHours(c, hours, overrides, today)).length;
}
```

Note on imports: `OpeningHoursRow` / `DayOverrideRow` are needed as types — confirm they're imported at the top of the file; if not, add them to the existing `@/lib/supabase/types` import block.

- [ ] **Step 3: Typecheck**

Run: `corepack pnpm typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add lib/actions/orders.ts
git commit -m "feat(orders): getOutsideHoursOrders + getOutsideHoursCount actions"
```

---

## Task 3: `/mimo-hodin` page + list component

**Files:**
- Create: `app/mimo-hodin/page.tsx`
- Create: `components/outside-hours/outside-hours-list.tsx`
- Test: `tests/e2e/outside-hours.spec.ts` (created here, extended in later tasks)

- [ ] **Step 1: Create the list component**

```tsx
// components/outside-hours/outside-hours-list.tsx
"use client";

import { useState, useTransition, useCallback } from "react";
import Link from "next/link";
import { getOutsideHoursOrders, type OutsideHoursOrderRow } from "@/lib/actions/orders";
import { useRealtimeChannel } from "@/lib/realtime/use-realtime";
import { bratislavaDateDisplay, bratislavaHHMM } from "@/lib/settings/availability";
import { formatCarLabel, NO_SPZ_LABEL } from "@/lib/cars/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function hoursLabel(h: OutsideHoursOrderRow["dayHours"]): string {
  return h ? `${h.open}–${h.close}` : "zatvorené";
}

export function OutsideHoursList({
  initialOrders,
  realtimeJwt,
}: {
  initialOrders: OutsideHoursOrderRow[];
  realtimeJwt: string;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => setOrders(await getOutsideHoursOrders()));
  }, []);

  // Live: rescheduling/cancelling an order (orders) or changing hours
  // (opening_hours / day_overrides) re-derives the list with no reload.
  useRealtimeChannel(
    realtimeJwt,
    (client) =>
      client
        .channel("outside-hours")
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "opening_hours" }, () => refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "day_overrides" }, () => refresh())
        .subscribe(),
    [],
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Objednávky mimo otváracích hodín</h1>
      <p className="text-sm text-muted-foreground">
        Tieto objednávky už nie sú v otváracích hodinách. Presuňte ich na iný termín alebo zrušte.
      </p>

      {/* Desktop table (≥sm); test hooks + the row link live here only. */}
      <div className="hidden overflow-x-auto rounded-lg border sm:block" data-section="outside-hours">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Objednávka</TableHead>
              <TableHead>Klient</TableHead>
              <TableHead>Auto</TableHead>
              <TableHead className="whitespace-nowrap">Otváracie hodiny</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  Žiadne objednávky mimo otváracích hodín
                </TableCell>
              </TableRow>
            ) : (
              orders.map((o) => {
                const at = new Date(o.startsAt);
                return (
                  <TableRow key={o.id} data-order-id={o.id} data-spz={o.spz ?? undefined}>
                    <TableCell className="whitespace-nowrap text-sm">
                      <Link href={`/orders/${o.id}`} className="underline underline-offset-4">
                        {bratislavaDateDisplay(at)} {bratislavaHHMM(at)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{o.clientName ?? "—"}</div>
                      <div className="text-muted-foreground">{o.clientPhone}</div>
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {o.spz || formatCarLabel(o.brand, o.model) || NO_SPZ_LABEL}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {hoursLabel(o.dayHours)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile stacked cards (<sm). */}
      <ul className="space-y-2 sm:hidden">
        {orders.length === 0 ? (
          <li className="rounded-lg border py-8 text-center text-sm text-muted-foreground">
            Žiadne objednávky mimo otváracích hodín
          </li>
        ) : (
          orders.map((o) => {
            const at = new Date(o.startsAt);
            return (
              <li key={o.id} className="rounded-lg border p-3 text-sm">
                <Link href={`/orders/${o.id}`} className="block space-y-1">
                  <div className="font-medium">
                    {o.spz || formatCarLabel(o.brand, o.model) || NO_SPZ_LABEL}
                  </div>
                  <div className="text-muted-foreground">
                    {bratislavaDateDisplay(at)} {bratislavaHHMM(at)} · {o.clientName ?? "—"} {o.clientPhone}
                  </div>
                  <div className="text-muted-foreground">Otváracie hodiny: {hoursLabel(o.dayHours)}</div>
                </Link>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Create the page (manager-only, mirrors `app/unpaid/page.tsx`)**

```tsx
// app/mimo-hodin/page.tsx
import { getCurrentStaff } from "@/lib/auth/session";
import { getIdentity } from "@/lib/auth/identity";
import { requireManager } from "@/lib/auth/require";
import { isForbiddenError, isUnauthenticatedError } from "@/lib/auth/errors";
import { getOutsideHoursOrders } from "@/lib/actions/orders";
import { mintRealtimeToken } from "@/lib/realtime/token";
import { ForbiddenView, UnauthenticatedView } from "@/components/auth/auth-error-views";
import { OutsideHoursList } from "@/components/outside-hours/outside-hours-list";

export default async function OutsideHoursPage() {
  try {
    const actor = await getCurrentStaff();
    requireManager(actor);
  } catch (error) {
    if (isForbiddenError(error)) return <ForbiddenView />;
    if (isUnauthenticatedError(error)) return <UnauthenticatedView />;
    throw error;
  }

  const [initial, identity] = await Promise.all([getOutsideHoursOrders(), getIdentity()]);
  const realtimeJwt = await mintRealtimeToken(identity);

  return (
    <div className="mx-auto max-w-3xl">
      <OutsideHoursList initialOrders={initial} realtimeJwt={realtimeJwt} />
    </div>
  );
}
```

- [ ] **Step 3: Create the e2e spec (page + worker gating)**

```ts
// tests/e2e/outside-hours.spec.ts
import { test, expect } from "@playwright/test";
import { accessHeaders, MANAGER_EMAIL, WORKER_EMAIL, seedOrder } from "./support";

test.describe("outside-hours worklist (manager)", () => {
  test.use({ extraHTTPHeaders: accessHeaders(MANAGER_EMAIL) });

  test("an upcoming order whose time is outside hours appears on /mimo-hodin", async ({ page }) => {
    // 2031-03-14 at 18:00 — after the 17:00 close; seedOrder inserts directly.
    const o = await seedOrder({ date: "2031-03-14", time: "18:00" });
    await page.goto("/mimo-hodin");
    const row = page.locator(`[data-section="outside-hours"] [data-order-id="${o.orderId}"]`);
    await expect(row).toBeVisible();
    await expect(row.getByRole("link")).toHaveAttribute("href", `/orders/${o.orderId}`);
  });
});

test.describe("outside-hours worklist — worker gating", () => {
  test.use({ extraHTTPHeaders: accessHeaders(WORKER_EMAIL) });

  test("prevádzka gets the 403 view on /mimo-hodin", async ({ page }) => {
    await page.goto("/mimo-hodin");
    await expect(page.getByText("Nemáte oprávnenie")).toBeVisible();
  });
});
```

Also add, inside the manager `describe`, a live-drop test (resolving an order removes it without reload — mirrors the unpaid-alerts live test by changing the DB directly). Update the import line to include `serviceClient`:

```ts
// import line:
import { accessHeaders, MANAGER_EMAIL, WORKER_EMAIL, seedOrder, serviceClient } from "./support";

  test("rescheduling an order into open hours drops it from the list live", async ({ page }) => {
    const o = await seedOrder({ date: "2031-03-14", time: "18:00" }); // after close
    await page.goto("/mimo-hodin");
    const row = page.locator(`[data-section="outside-hours"] [data-order-id="${o.orderId}"]`);
    await expect(row).toBeVisible();

    // Move it into open hours (09:00) directly → Realtime re-derives → row drops.
    const db = serviceClient();
    const startsAt = new Date("2031-03-14T08:00:00Z"); // 09:00 Bratislava (CET, +01:00)
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
    const { error } = await db
      .from("orders")
      .update({ starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() })
      .eq("id", o.orderId);
    expect(error).toBeNull();

    await expect(row).toHaveCount(0);
  });
```

- [ ] **Step 4: Build, run the spec on a clean DB**

```bash
corepack pnpm build
corepack pnpm supabase db reset
corepack pnpm test:e2e outside-hours
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add app/mimo-hodin/page.tsx components/outside-hours/outside-hours-list.tsx tests/e2e/outside-hours.spec.ts
git commit -m "feat(orders): /mimo-hodin manager worklist for orders outside hours"
```

---

## Task 4: Sidebar badge

**Files:**
- Create: `components/outside-hours/outside-hours-badge.tsx`
- Modify: `components/navigation/AppShell.tsx`, `components/navigation/SidebarShell.tsx`, `components/navigation/Sidebar.tsx`
- Test: `tests/e2e/outside-hours.spec.ts` (extend)

- [ ] **Step 1: Create the badge (mirrors `UnpaidBadge`)**

```tsx
// components/outside-hours/outside-hours-badge.tsx
"use client";

import { useState, useCallback, useTransition } from "react";
import Link from "next/link";
import { getOutsideHoursCount } from "@/lib/actions/orders";
import { useRealtimeChannel } from "@/lib/realtime/use-realtime";
import { Badge } from "@/components/ui/badge";

/**
 * Sidebar alert badge for orders now outside opening hours (manager-only — the
 * sidebar renders it only for managers, and getOutsideHoursCount re-checks the
 * role). Live: re-counts on orders / opening_hours / day_overrides changes.
 */
export function OutsideHoursBadge({
  initialCount,
  realtimeJwt,
}: {
  initialCount: number;
  realtimeJwt: string;
}) {
  const [count, setCount] = useState(initialCount);
  const [, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => setCount(await getOutsideHoursCount()));
  }, []);

  useRealtimeChannel(
    realtimeJwt,
    (client) =>
      client
        .channel("outside-hours-badge")
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "opening_hours" }, () => refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "day_overrides" }, () => refresh())
        .subscribe(),
    [],
  );

  if (count <= 0) return null;

  return (
    <Link href="/mimo-hodin" data-outside-hours-badge data-count={count}>
      <Badge className="border bg-amber-100 text-amber-900 hover:bg-amber-200">
        Mimo hodín: {count}
      </Badge>
    </Link>
  );
}
```

- [ ] **Step 2: Mint the count in `AppShell`**

In `components/navigation/AppShell.tsx`, add the import and the count, and pass it through. Change the imports + the manager block + the `<SidebarShell>` props:

```tsx
import { getUnpaidCount, getOutsideHoursCount } from "@/lib/actions/orders";
```

```tsx
  const isManager = staff.role === "manazer";
  let unpaidCount = 0;
  let outsideHoursCount = 0;
  let realtimeJwt = "";
  if (isManager) {
    realtimeJwt = await mintRealtimeToken(await getIdentity());
    unpaidCount = await getUnpaidCount();
    outsideHoursCount = await getOutsideHoursCount();
  }
```

```tsx
      <SidebarShell
        role={staff.role}
        staffName={staff.display_name}
        unpaidCount={unpaidCount}
        outsideHoursCount={outsideHoursCount}
        realtimeJwt={realtimeJwt}
      >
        {children}
      </SidebarShell>
```

- [ ] **Step 3: Thread the prop through `SidebarShell`**

In `components/navigation/SidebarShell.tsx`, add `outsideHoursCount: number;` to `SidebarShellProps`, accept it in the destructure, and pass it to `<Sidebar … outsideHoursCount={outsideHoursCount} … />`:

```tsx
interface SidebarShellProps {
  role: StaffRole;
  staffName: string;
  unpaidCount: number;
  outsideHoursCount: number;
  realtimeJwt: string;
  children: React.ReactNode;
}
```

```tsx
export function SidebarShell({
  role,
  staffName,
  unpaidCount,
  outsideHoursCount,
  realtimeJwt,
  children,
}: SidebarShellProps) {
```

```tsx
      <Sidebar
        role={role}
        staffName={staffName}
        unpaidCount={unpaidCount}
        outsideHoursCount={outsideHoursCount}
        realtimeJwt={realtimeJwt}
        expanded={expanded}
        onCollapse={() => setExpanded(false)}
      />
```

- [ ] **Step 4: Render the badge in `Sidebar`**

In `components/navigation/Sidebar.tsx`: add the import, add `outsideHoursCount: number;` to `SidebarProps`, accept it, and render the badge beside `UnpaidBadge` in the footer block.

```tsx
import { OutsideHoursBadge } from "@/components/outside-hours/outside-hours-badge";
```

Add to `SidebarProps` (after `unpaidCount: number;`): `outsideHoursCount: number;`
Add to the destructure (after `unpaidCount,`): `outsideHoursCount,`

Replace the existing badge block:

```tsx
        {isManager && realtimeJwt && (
          <div className="mb-2 space-y-2 px-3">
            <UnpaidBadge initialCount={unpaidCount} realtimeJwt={realtimeJwt} />
            <OutsideHoursBadge initialCount={outsideHoursCount} realtimeJwt={realtimeJwt} />
          </div>
        )}
```

- [ ] **Step 5: Typecheck + build**

Run: `corepack pnpm typecheck && corepack pnpm build`
Expected: exit 0.

- [ ] **Step 6: Extend the e2e — badge shows for the manager**

Add to the manager `describe` in `tests/e2e/outside-hours.spec.ts` (it needs `expandSidebar`; update the import line to include it):

```ts
// import line:
import { accessHeaders, expandSidebar, MANAGER_EMAIL, WORKER_EMAIL, seedOrder } from "./support";

  test("the sidebar badge shows the count and links to /mimo-hodin", async ({ page }) => {
    await seedOrder({ date: "2031-03-14", time: "18:00" });
    await page.goto("/");
    await expandSidebar(page); // desktop sidebar is collapsed by default
    const badge = page.locator("[data-outside-hours-badge]");
    await expect(badge).toBeVisible();
    expect(Number(await badge.getAttribute("data-count"))).toBeGreaterThanOrEqual(1);
    await badge.click();
    await page.waitForURL(/\/mimo-hodin$/);
  });
```

- [ ] **Step 7: Run on a clean DB + commit**

```bash
corepack pnpm supabase db reset
corepack pnpm test:e2e outside-hours
git add components/outside-hours/outside-hours-badge.tsx components/navigation/AppShell.tsx components/navigation/SidebarShell.tsx components/navigation/Sidebar.tsx tests/e2e/outside-hours.spec.ts
git commit -m "feat(nav): sidebar badge for orders outside opening hours"
```

Expected: 3 passed.

---

## Task 5: Warn-but-allow at the hours change

**Files:**
- Modify: `lib/actions/result.ts`, `lib/validation/settings.ts`, `lib/actions/settings.ts`
- Create: `components/settings/OutsideHoursConfirmDialog.tsx`
- Modify: `components/settings/opening-hours-editor.tsx`, `components/settings/day-overrides-editor.tsx`
- Test: `tests/e2e/outside-hours.spec.ts` (extend)

- [ ] **Step 1: Add the warning type to `ActionResult`**

In `lib/actions/result.ts`, add the type and the optional field on the failure branch:

```ts
/** A few affected orders to name in the "this leaves orders outside hours" confirm. */
export interface OutsideHoursWarning {
  count: number;
  sample: { id: string; label: string }[];
}
```

```ts
export type ActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true } & T)
  | {
      ok: false;
      message: string;
      conflict?: OverlapInfo;
      outsideHoursWarning?: OutsideHoursWarning;
    };
```

- [ ] **Step 2: Add `allowOutsideHours` to the settings schemas**

In `lib/validation/settings.ts`:
- Add `allowOutsideHours: z.boolean().optional()` to the `saveOpeningHoursSchema` object (alongside `rows`).
- Add `allowOutsideHours: z.boolean().optional()` to the `upsertDayOverrideSchema` object (before the `.refine`s).
- Change `removeDayOverrideSchema` to `z.object({ day: daySchema, allowOutsideHours: z.boolean().optional() })`.

```ts
export const saveOpeningHoursSchema = z.object({
  rows: z
    .array(hoursRowSchema)
    .length(7, "Očakáva sa 7 riadkov (Po–Ne).")
    .refine(
      (rows) => new Set(rows.map((r) => r.dayOfWeek)).size === 7,
      { message: "Každý deň v týždni musí byť uvedený práve raz.", path: ["rows"] },
    ),
  allowOutsideHours: z.boolean().optional(),
});
```

(For `upsertDayOverrideSchema`, add `allowOutsideHours: z.boolean().optional(),` as a field inside the `.object({ … })` before the two `.refine(...)` calls.)

```ts
export const removeDayOverrideSchema = z.object({
  day: daySchema,
  allowOutsideHours: z.boolean().optional(),
});
```

- [ ] **Step 3: Add the orphan pre-check helper + wire the three actions**

In `lib/actions/settings.ts`, add imports:

```ts
import { bratislavaDateKey } from "@/lib/settings/availability";
import { bratislavaLocalDayRange } from "@/lib/time/bratislava";
import { isOutsideHours } from "@/lib/orders/out-of-hours";
import { formatCarLabel, NO_SPZ_LABEL } from "@/lib/cars/format";
import { bratislavaDateDisplay, bratislavaHHMM } from "@/lib/settings/availability";
import type { OutsideHoursWarning } from "./result";
```

(Combine the two `@/lib/settings/availability` imports into one line:
`import { bratislavaDateKey, bratislavaDateDisplay, bratislavaHHMM } from "@/lib/settings/availability";`)

Add a constant + the helper near the top (after `NOT_FOUND_MESSAGE`):

```ts
const OUTSIDE_HOURS_MESSAGE =
  "Táto zmena ponechá objednávky mimo otváracích hodín.";

/**
 * Future vytvorená orders (today onward, optionally just one date) that would
 * fall OUTSIDE the PROPOSED hours config. Returns an `OutsideHoursWarning`
 * (count + up to 5 samples) or null when none. Reuses `isOutsideHours`.
 */
async function checkOutsideHours(
  db: ReturnType<typeof getServiceClient>,
  proposedHours: OpeningHoursRow[],
  proposedOverrides: DayOverrideRow[],
  dayFilter?: string,
): Promise<OutsideHoursWarning | null> {
  const today = bratislavaDateKey(new Date());
  let q = db
    .from("orders")
    .select("id, starts_at, ends_at, status, deleted_at, car:car_id(spz, brand, model)")
    .is("deleted_at", null)
    .eq("status", "vytvorena")
    .gte("starts_at", bratislavaLocalDayRange(today).start.toISOString())
    .order("starts_at");
  if (dayFilter) {
    const range = bratislavaLocalDayRange(dayFilter);
    q = q.lt("starts_at", range.end.toISOString());
    // (lower bound is already today; for a single past-or-today override day the
    // today floor still applies — only upcoming orders are actionable.)
  }
  const { data, error } = await q;
  if (error) throw error;

  const affected = (data ?? []).filter((o) =>
    isOutsideHours(
      o as unknown as { starts_at: string; ends_at: string; status: OrderStatus; deleted_at: string | null },
      proposedHours,
      proposedOverrides,
      today,
    ),
  );
  if (affected.length === 0) return null;
  return {
    count: affected.length,
    sample: affected.slice(0, 5).map((o) => {
      const car = (o as { car: { spz: string | null; brand: string | null; model: string | null } | null }).car;
      const at = new Date((o as { starts_at: string }).starts_at);
      const label = `${car?.spz || formatCarLabel(car?.brand ?? null, car?.model ?? null) || NO_SPZ_LABEL} · ${bratislavaDateDisplay(at)} ${bratislavaHHMM(at)}`;
      return { id: (o as { id: string }).id, label };
    }),
  };
}
```

Add `OrderStatus` to the `@/lib/supabase/types` import in this file.

In `saveOpeningHours`, after building `payload` and BEFORE the `upsert`:

```ts
    if (!data.allowOutsideHours) {
      const { data: overrides } = await db.from("day_overrides").select("*");
      const warning = await checkOutsideHours(
        db,
        payload as OpeningHoursRow[],
        (overrides ?? []) as DayOverrideRow[],
      );
      if (warning) return { ok: false, message: OUTSIDE_HOURS_MESSAGE, outsideHoursWarning: warning };
    }
```

In `upsertDayOverride`, after building `payload` and BEFORE the `upsert`:

```ts
    if (!data.allowOutsideHours) {
      const [{ data: hours }, { data: existing }] = await Promise.all([
        db.from("opening_hours").select("*"),
        db.from("day_overrides").select("*"),
      ]);
      const proposedOverrides = [
        ...((existing ?? []) as DayOverrideRow[]).filter((o) => o.day !== data.day),
        payload as DayOverrideRow,
      ];
      const warning = await checkOutsideHours(
        db,
        (hours ?? []) as OpeningHoursRow[],
        proposedOverrides,
        data.day,
      );
      if (warning) return { ok: false, message: OUTSIDE_HOURS_MESSAGE, outsideHoursWarning: warning };
    }
```

In `removeDayOverride`, after `requireManager` and BEFORE the delete (the proposed config drops the override for that day, reverting to weekly hours):

```ts
    if (!data.allowOutsideHours) {
      const [{ data: hours }, { data: existing }] = await Promise.all([
        db.from("opening_hours").select("*"),
        db.from("day_overrides").select("*"),
      ]);
      const proposedOverrides = ((existing ?? []) as DayOverrideRow[]).filter((o) => o.day !== data.day);
      const warning = await checkOutsideHours(
        db,
        (hours ?? []) as OpeningHoursRow[],
        proposedOverrides,
        data.day,
      );
      if (warning) return { ok: false, message: OUTSIDE_HOURS_MESSAGE, outsideHoursWarning: warning };
    }
```

- [ ] **Step 4: Create the confirm dialog**

```tsx
// components/settings/OutsideHoursConfirmDialog.tsx
"use client";

import type { OutsideHoursWarning } from "@/lib/actions/result";
import { skPlural } from "@/lib/intl/sk";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * "Warn but allow" confirm shown when a hours change would leave existing
 * upcoming orders outside opening hours. Confirming retries the settings action
 * with `allowOutsideHours: true`.
 */
export function OutsideHoursConfirmDialog({
  warning,
  pending,
  onConfirm,
  onCancel,
}: {
  warning: OutsideHoursWarning | null;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const n = warning?.count ?? 0;
  return (
    <Dialog open={warning !== null} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Objednávky mimo otváracích hodín</DialogTitle>
          <DialogDescription>
            Táto zmena ponechá {n}{" "}
            {skPlural(n, {
              one: "objednávku",
              few: "objednávky",
              many: "objednávok",
            })}{" "}
            mimo otváracích hodín. Nájdete ich v sekcii „Mimo otváracích hodín“. Napriek tomu uložiť?
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-1 text-sm" data-outside-hours-list>
          {warning?.sample.map((s) => (
            <li key={s.id} className="rounded border bg-muted/40 px-2 py-1.5">{s.label}</li>
          ))}
        </ul>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Zrušiť
          </Button>
          <Button data-outside-hours-confirm onClick={onConfirm} disabled={pending}>
            Napriek tomu uložiť
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Wire `opening-hours-editor.tsx`**

In `components/settings/opening-hours-editor.tsx`: import the dialog + `OutsideHoursWarning` type; add state `const [warn, setWarn] = useState<OutsideHoursWarning | null>(null);`. Find where it calls `saveOpeningHours(...)` and capture the result. The save currently runs inside a transition and toasts on `!ok`. Replace its result handling so that an `outsideHoursWarning` result opens the dialog instead of toasting, and a confirm re-calls with `allowOutsideHours: true`.

Read the current call site first:

Run: `grep -n "saveOpeningHours" components/settings/opening-hours-editor.tsx`

Refactor the submit into a parameterised function and add the dialog render. Concretely:

```tsx
import { OutsideHoursConfirmDialog } from "./OutsideHoursConfirmDialog";
import type { OutsideHoursWarning } from "@/lib/actions/result";
```

```tsx
  const [warn, setWarn] = useState<OutsideHoursWarning | null>(null);

  function save(allowOutsideHours = false) {
    startTransition(async () => {
      const res = await saveOpeningHours({ rows: <existing rows payload>, allowOutsideHours });
      if (!res.ok) {
        if (res.outsideHoursWarning) {
          setWarn(res.outsideHoursWarning);
          return;
        }
        toast.error(res.message);
        return;
      }
      setWarn(null);
      toast.success("Otváracie hodiny uložené.");
      router.refresh();
    });
  }
```

(Use the editor's existing rows-payload expression in place of `<existing rows payload>`, and its existing success toast text if different.) Point the form's submit handler at `save()`. Render at the end of the component:

```tsx
      <OutsideHoursConfirmDialog
        warning={warn}
        pending={pending}
        onConfirm={() => { setWarn(null); save(true); }}
        onCancel={() => setWarn(null)}
      />
```

- [ ] **Step 6: Wire `day-overrides-editor.tsx` the same way**

Mirror Step 5 for the `upsertDayOverride(...)` call (and, if the editor has a remove button, the `removeDayOverride(...)` call — give each its own retry that passes `allowOutsideHours: true`). Read the call sites first:

Run: `grep -n "upsertDayOverride\|removeDayOverride" components/settings/day-overrides-editor.tsx`

Add the same `warn` state + `<OutsideHoursConfirmDialog>` render; on an `outsideHoursWarning` result open the dialog, and confirm re-calls the same action with `allowOutsideHours: true`.

- [ ] **Step 7: Typecheck + build**

Run: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build`
Expected: exit 0.

- [ ] **Step 8: Extend the e2e — confirm-at-save flow**

Add to the manager `describe` in `tests/e2e/outside-hours.spec.ts`. This seeds an order on a **specific upcoming weekday**, then closes that weekday via the hours editor and asserts the confirm dialog. Use a helper to pick the next occurrence of a weekday:

```ts
  test("narrowing a day's hours warns about an existing order, then allows on confirm", async ({ page }) => {
    // Seed an 09:00 order on the next Wednesday (a normally-open weekday).
    const date = nextWeekdayDate(3); // 3 = Wednesday (0=Mon … 6=Sun)
    const o = await seedOrder({ date, time: "09:00" });

    // Close Wednesday in the weekly hours editor.
    await page.goto("/settings/hours");
    const wed = page.locator('[data-day="2"]'); // opening_hours day_of_week: 0=Mon → Wed=2
    const closed = wed.getByRole("checkbox");
    if (!(await closed.isChecked())) await closed.check();
    await page.getByRole("button", { name: "Uložiť", exact: true }).first().click();

    // Confirm dialog names the order; the hours are NOT saved yet.
    await expect(page.getByRole("heading", { name: "Objednávky mimo otváracích hodín" })).toBeVisible();
    await page.locator("[data-outside-hours-confirm]").click();
    await expect(page.getByText("Otváracie hodiny uložené.")).toBeVisible();

    // The order now shows on /mimo-hodin.
    await page.goto("/mimo-hodin");
    await expect(page.locator(`[data-section="outside-hours"] [data-order-id="${o.orderId}"]`)).toBeVisible();
  });
```

Add this helper at the top of the spec file (after the imports):

```ts
/** The date (YYYY-MM-DD, Bratislava) of the next occurrence of `dow` (0=Mon…6=Sun), ≥ 8 days out to stay clear of today. */
function nextWeekdayDate(dow: number): string {
  for (let d = 8; d <= 21; d++) {
    const t = new Date(Date.now() + d * 86_400_000);
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(t);
    const [y, m, dd] = key.split("-").map(Number);
    const js = new Date(Date.UTC(y, m - 1, dd)).getUTCDay(); // 0=Sun…6=Sat
    if ((js + 6) % 7 === dow) return key;
  }
  throw new Error("no matching weekday found");
}
```

Note: after this test runs it leaves Wednesday closed in the shared DB; the test resets opening hours at the end to avoid polluting other suites:

```ts
    // Restore Wednesday to open so other suites aren't affected.
    await page.goto("/settings/hours");
    const wed2 = page.locator('[data-day="2"]');
    const c2 = wed2.getByRole("checkbox");
    if (await c2.isChecked()) await c2.uncheck();
    await wed2.locator('input[type="time"]').first().fill("08:00");
    await wed2.locator('input[type="time"]').last().fill("17:00");
    await page.getByRole("button", { name: "Uložiť", exact: true }).first().click();
    await expect(page.getByText("Otváracie hodiny uložené.")).toBeVisible();
```

(If saving the restore re-triggers the warning because the order is still outside — it won't here, since reopening Wednesday 08–17 puts the 09:00 order back inside hours.)

- [ ] **Step 9: Run on a clean DB + commit**

```bash
corepack pnpm supabase db reset
corepack pnpm test:e2e outside-hours settings-permissions settings-audit
git add lib/actions/result.ts lib/validation/settings.ts lib/actions/settings.ts components/settings/OutsideHoursConfirmDialog.tsx components/settings/opening-hours-editor.tsx components/settings/day-overrides-editor.tsx tests/e2e/outside-hours.spec.ts
git commit -m "feat(settings): warn-but-allow when hours change orphans existing orders"
```

Expected: all pass (the existing settings suites must stay green — the confirm only fires when orders are actually orphaned).

---

## Task 6: Calendar "mimo hodín" marker

**Files:**
- Modify: `components/calendar/BookingCard.tsx`, `components/calendar/DayView.tsx`, `components/calendar/WeekView.tsx`
- Test: `tests/e2e/outside-hours.spec.ts` (extend)

- [ ] **Step 1: Add an `outsideHours` prop to `BookingCard`**

In `components/calendar/BookingCard.tsx`, add `outsideHours?: boolean` to the `BookingCard` props and, when true, add a warning ring + a `data-outside-hours` hook + a `title`. Modify the `BookingCard` function:

```tsx
export function BookingCard({
  block,
  density,
  className,
  style,
  outsideHours,
}: {
  block: CalendarBlock;
  density: "rich" | "compact" | "line";
  className?: string;
  style?: CSSProperties;
  outsideHours?: boolean;
}) {
  const openOrder = useOpenOrderSheet();
  const c = STATE_COLOR[block.order.status];
  const classes = cn(
    "block overflow-hidden rounded border px-1 py-0.5 text-left transition-opacity hover:opacity-90",
    c.bg,
    c.border,
    c.text,
    outsideHours && "ring-2 ring-amber-500 ring-offset-1",
    className,
  );
  const title = outsideHours ? "Mimo otváracích hodín" : undefined;

  if (openOrder) {
    return (
      <button
        type="button"
        data-order-id={block.order.id}
        data-outside-hours={outsideHours ? "" : undefined}
        title={title}
        className={classes}
        style={style}
        onClick={() => openOrder(block.order.id)}
      >
        <BookingCardContent block={block} density={density} />
      </button>
    );
  }

  return (
    <Link
      href={`/orders/${block.order.id}`}
      data-order-id={block.order.id}
      data-outside-hours={outsideHours ? "" : undefined}
      title={title}
      className={classes}
      style={style}
    >
      <BookingCardContent block={block} density={density} />
    </Link>
  );
}
```

- [ ] **Step 2: Compute & pass it in `DayView`**

In `components/calendar/DayView.tsx`, the booking layer maps `placed`. The day's interval is the `interval` prop. A card is out-of-hours when its window doesn't fit the day interval. Add a helper near the top of the component:

```tsx
import { isRangeOpen } from "@/lib/settings/availability";
```

The grid only has the open interval, but DayView doesn't receive `hours`/`overrides`. Instead compute against the rendered grid interval directly: a card is outside hours when `p.startMin < 0` OR `p.endMin > n * SLOT_MIN` (its window extends past the open grid). Inside the `placed.map((p) => { … })` add:

```tsx
                const outsideHours = p.startMin < 0 || p.endMin > n * SLOT_MIN;
```

and pass `outsideHours={outsideHours}` to `<BookingCard … />`.

(Remove the unused `isRangeOpen` import if not used — the offset check is sufficient and matches how the card is already clamped.)

- [ ] **Step 3: Compute & pass it in `WeekView`**

In `components/calendar/WeekView.tsx`, the `DayCell` places cards with `top: (p.startMin / SLOT_MIN) * ROW_PX`. The grid spans `interval` (the week union). A card is outside that day's own interval when its time is outside `dayInterval`. In `DayCell`, where it maps `placedFor(box)`, compute against the cell's `dayInterval` (already a prop):

```tsx
            const dayStartMin = dayInterval
              ? diffMinutes(gridInterval.open, dayInterval.open)
              : 0;
            const dayEndMin = dayInterval
              ? diffMinutes(gridInterval.open, dayInterval.close)
              : 0;
            const outsideHours = !dayInterval || p.startMin < dayStartMin || p.endMin > dayEndMin;
```

and pass `outsideHours={outsideHours}` to the `<BookingCard … />` in the week cell. (`diffMinutes` is already imported in WeekView.)

- [ ] **Step 4: Typecheck + build**

Run: `corepack pnpm typecheck && corepack pnpm build`
Expected: exit 0.

- [ ] **Step 5: Extend the e2e — the calendar card carries the marker**

Add to the manager `describe` in `tests/e2e/outside-hours.spec.ts`:

```ts
  test("an out-of-hours order's calendar card carries the mimo-hodín marker", async ({ page }) => {
    const o = await seedOrder({ date: "2031-03-14", time: "18:00" }); // after 17:00 close
    await page.goto("/?view=day&date=2031-03-14");
    const card = page.locator(`[data-order-id="${o.orderId}"]`);
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-outside-hours", "");
  });
```

- [ ] **Step 6: Run on a clean DB + commit**

```bash
corepack pnpm supabase db reset
corepack pnpm test:e2e outside-hours calendar-header calendar-week-view
git add components/calendar/BookingCard.tsx components/calendar/DayView.tsx components/calendar/WeekView.tsx tests/e2e/outside-hours.spec.ts
git commit -m "feat(calendar): mark out-of-hours order cards (mimo hodín)"
```

Expected: all pass.

---

## Task 7: Spec updates + full verification

**Files:**
- Modify: `docs/specs/04-opening-hours-and-day-overrides.md` (exact name: check `docs/specs/` — it's the spec-04 file)
- Modify: `docs/specs/10-unpaid-order-alerts.md` (exact name: check `docs/specs/` — it's the spec-10 file)

- [ ] **Step 1: Fold the behaviour into spec 04**

In the spec-04 file, add a subsection under Design describing: changing weekly hours or a day override (and removing an override) runs a pre-check for upcoming `vytvorená` orders that would fall outside the proposed hours; if any, the action returns a soft `outsideHoursWarning` and does not save until re-called with `allowOutsideHours: true` (mirrors the box-overlap `allowOverlap`). Add an acceptance bullet: "Closing/narrowing a day with an existing upcoming order prompts a confirm naming it; confirming saves and the order appears on /mimo-hodin."

- [ ] **Step 2: Fold the worklist into spec 10**

In the spec-10 file, add a subsection: a manager-only `/mimo-hodin` worklist + sidebar badge (mirrors /unpaid), derived via `isOutsideHours` (upcoming `vytvorená` orders not fitting the day's current hours), resolved by rescheduling (Zmeniť čas) or cancelling — auto-drops, no stored state. Note the calendar "mimo hodín" marker. Acceptance bullets: worker → 403 on `/mimo-hodin`, no badge; manager sees the list + live badge; rescheduling into hours drops the row.

- [ ] **Step 3: Full verification on a clean DB**

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test:unit
corepack pnpm supabase db reset
corepack pnpm build
corepack pnpm test:e2e outside-hours navigation calendar-header settings-permissions settings-audit unpaid-alerts
```

Expected: typecheck/lint exit 0; unit all pass (incl. the 8 new); the listed e2e suites all pass.

- [ ] **Step 4: Code review**

Dispatch the `code-reviewer` subagent over the branch diff against CLAUDE.md + the design doc + specs 04/10. Apply blockers/should-fix.

- [ ] **Step 5: Commit the spec updates**

```bash
git add docs/specs/
git commit -m "docs: fold orders-outside-opening-hours into specs 04 + 10"
```

---

## Notes for the implementer

- **No migration** — everything is derived from existing tables.
- **Manager-only** — `getOutsideHoursOrders` / `getOutsideHoursCount` and all three settings actions call `requireManager`; the badge/page render for managers only.
- **Realtime** — the list + badge subscribe to `orders`, `opening_hours`, `day_overrides`, so resolving an order or re-widening hours updates them live.
- **e2e gotcha** — stop any `pnpm dev` on port 3000 first (its HMR websocket blocks hydration under the sandbox), and run targeted e2e on a clean `corepack pnpm supabase db reset`. Some seeded out-of-hours dates are far-future (2031) to stay clear of other suites; the at-save test restores Wednesday's hours at the end.
- **Resolve = existing controls** — no inline actions on the list; the manager opens the order and uses Zmeniť čas / Zrušiť (the row auto-drops).
