---
name: order-duration-conflict
description: Use when working on orders — the booking flow, duration calculation from services, box/time conflict checks, status transitions, or adding/removing services on an order. Encodes the core domain rules that are not obvious from the schema alone.
---

# Order duration, booking flow & conflict rules

The order (objednávka) is the central entity: one car, one of two boxes, one time
slot, a status lifecycle. These domain rules are project-specific (PRD §4–§6, §9).

## Booking flow (phone-call order creation, PRD §4)

Strict step order — the UI walks the manager through it, mobile-first:

1. **Client** — enter phone (the client key). Match ⇒ load client + their cars; no
   match ⇒ optional name, create client.
2. **Car** — pick an existing linked car, or add one (ŠPZ + optional model +
   `pricing_category`: `os | suv | van | dod | motorka | stavba`). On a new ŠPZ that already
   exists under another client, **prompt to link** (shared-ŠPZ) rather than duplicate.
3. **Services** — pick from the active catalog. Duration/price come from the
   `service_prices` row for **(service × the car's pricing_category)**.
4. **Time** — app suggests nearest free slots in both boxes (respecting opening
   hours/holidays); manager may pick manually. Conflicts are rejected (see below).

## Duration calculation

- Order `duration_min` = **Σ of the per-(service × category) line durations** of the
  selected services (per-unit add-ons multiply by quantity; some add-ons have a NULL
  duration and contribute 0).
- It is an **estimate the manager may manually override** (PRD §4 step 3) — store the
  computed value as the default but let it be edited; `ends_at` is generated from
  `starts_at + duration_min`.
- There is **no multiplier**: durations are an explicit per-category table
  (`docs/services.md` ratios are irregular). Look up the row, don't compute a factor.

## Conflict rule (PRD §4, acceptance §15.3)

Two orders may not occupy the same **box** with overlapping `[starts_at, ends_at)`.
Enforced at the **database level** by the `orders_no_box_overlap` exclusion constraint
— do not rely on app-side checks alone. The constraint **excludes** `deleted_at IS NOT
NULL` and `status = 'nedostavil_sa'` orders, because those **free the slot**. Surface
the DB conflict error as a friendly Slovak message; never swallow it.

## Status lifecycle (PRD §6) — enforce role + transition rules

```
vytvorena ──(any role)──► hotova ──(manager only)──► zaplatena
    │                        ▲ fires the "ready" SMS
    └──(manager only)──► nedostavil_sa   (frees the slot)
```

- No transition returns to `vytvorena`.
- Delete/cancel allowed only **before** `zaplatena` (manager only), via soft-delete.
- `vytvorena → hotova` triggers the "auto je pripravené" SMS (spec 07).
- Every transition writes `audit_log`.

## Services on an existing order (PRD §9.3)

- Manager may **add** a service in any state (vytvorena/hotova/zaplatena).
- Each line has its own `paid` flag; originally-paid lines stay paid, new lines start
  unpaid until the manager marks them paid.
- A service may be **removed only if not yet performed** (soft `removed_at`).
- Add/remove/mark-paid each write `audit_log`. Adding a service may change
  `duration_min` — recompute the default but respect a manual override.

## Don't

- Don't let workers move/delete orders or mark `nedostavil_sa` (manager-only, PRD §3).
- Don't compute durations with a per-type multiplier.
- Don't check conflicts only in app code — keep the DB exclusion constraint.
