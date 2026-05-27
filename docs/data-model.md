# Data model — Autoumyváreň Zemplín

Complete schema for every PRD entity plus supporting tables. Postgres (Supabase
Cloud EU). All migrations are checked in (`CLAUDE.md`). Money is stored as integer
**cents** (EUR). Timestamps are `timestamptz` (UTC); the app renders in
Europe/Bratislava.

Conventions:
- Primary keys: `uuid` (`gen_random_uuid()`), except low-cardinality lookup rows.
- Soft-delete: domain history is deactivated, never hard-deleted (`CLAUDE.md`,
  PRD §9.1/§10). Tables that carry history use `deleted_at` / `active`.
- Every state change writes `audit_log` (PRD §11) — enforced in Server Actions,
  not triggers (so the actor identity from the edge is recorded).

---

## 1. Enums

```sql
create type pricing_category as enum ('os', 'suv', 'van', 'dod', 'motorka', 'stavba');
create type staff_role       as enum ('manazer', 'prevadzka');
create type order_status      as enum ('vytvorena', 'hotova', 'zaplatena', 'nedostavil_sa');
create type service_kind      as enum ('main', 'addon');
create type sms_type          as enum ('reminder', 'ready');
create type sms_status        as enum ('pending', 'sent', 'delivered', 'failed');
```

- `pricing_category` is sourced **only** from `docs/services.md` (os = osobné,
  suv, van, dod = dodávka, motorka, stavba = stavebné auto / construction work
  vehicle, typically very dirty). The PRD §4 descriptive list (sedan/hatchback/
  pickup/…) is illustrative and **not** modeled — a car's category *is* its pricing
  category (confirmed in planning).

---

## 2. Tables

### 2.1 `staff`

Maps an edge-authenticated identity to a role (PRD §3). The app reads
`Cf-Access-Authenticated-User-Email`, looks it up here, and gets the role.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `email` | text **unique not null** | matches the Cloudflare Access identity |
| `display_name` | text not null | shown on orders / assignment |
| `role` | `staff_role` not null | `manazer` \| `prevadzka` |
| `active` | boolean not null default true | soft-disable; inactive ≠ deleted (history integrity) |
| `created_at` | timestamptz not null default now() | |

**Index:** unique on `email` (hit on every authorization query — the hot path).
A disabled (`active=false`) staff member retains their FK references in order
history and audit log.

### 2.2 `clients`

Identified by phone number (PRD §4).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `phone` | text **unique not null** | the client key; normalized (E.164) before insert |
| `name` | text null | optional (PRD §4 step 1) |
| `note` | text null | optional free note (PRD §10) |
| `created_at` | timestamptz not null default now() | |

**Index:** unique on `phone` (search + identity).

### 2.3 `cars`

A car is identified by its plate and is **shared across clients** (PRD §13 #1,
confirmed). It carries the pricing category that drives durations/prices.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `spz` | text **unique not null** | license plate; the shared key |
| `model` | text null | optional descriptive model |
| `pricing_category` | `pricing_category` not null | drives service duration + price |
| `created_at` | timestamptz not null default now() | |

**Index:** unique on `spz`. A car is never duplicated per owner; ownership is the
M:N link below.

### 2.4 `client_cars` (M:N)

The same plate brought by client A (dad) and client B (son) links to one `cars`
row; both clients see the car's full visit history (dad's 5 + son's 1 = 6, per the
confirmed requirement). History attaches to the **order** (which references the
car), and a client's history view = all orders whose car is linked to them.

| Column | Type | Notes |
| --- | --- | --- |
| `client_id` | uuid fk → clients | |
| `car_id` | uuid fk → cars | |
| `created_at` | timestamptz not null default now() | |
| **pk** | (`client_id`, `car_id`) | |

**Indexes:** `(client_id)`, `(car_id)`.

**Booking-flow UX (deferred to the booking spec):** when adding a car under a phone
number, if the entered ŠPZ already exists under another client, prompt *"toto ŠPZ
už existuje u iného klienta — prepojiť aj s týmto klientom?"* and link rather than
duplicate. Without this, the shared-history promise silently breaks.

### 2.5 `services`

Catalog (PRD §9). Static-seeded by the dev team from `docs/services.md`. Soft
active/inactive, never hard-deleted (PRD §9.1).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `name` | text not null | e.g. "Interiér Classic", "Tepovanie kufra" |
| `kind` | `service_kind` not null | `main` \| `addon` (doplnková) |
| `is_per_unit` | boolean not null default false | true for `…/ks` add-ons (sedadlo, rohož, kolesá) |
| `active` | boolean not null default true | inactive hides from new orders; preserved in history |
| `sort_order` | int not null default 0 | catalog display order |
| `created_at` | timestamptz not null default now() | |

### 2.6 `service_prices`

Per-(service × category) duration **and** price — settles PRD §13 #2 (services are
priced in Phase 1, display/evidence only) and #3 (full table, not a multiplier;
the `services.md` ratios are irregular so no multiplier fits).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `service_id` | uuid fk → services | |
| `pricing_category` | `pricing_category` **null** | NULL = applies to any category (flat add-ons) |
| `duration_min` | int null | NULL = no scheduled duration (e.g. dezinfekcia ozónom, ohrievače) |
| `price_cents` | int not null | EUR cents |
| `price_from` | boolean not null default false | true for "od" prices (e.g. *Stavba auta od 217,90 €*) |
| **unique** | (`service_id`, `pricing_category`) | one row per category (and one NULL row for flat) |

- Main services have five rows (one per category, those that apply).
- Flat add-ons have a single row with `pricing_category = NULL`.
- Per-unit add-ons (`is_per_unit`) store the per-unit price here; quantity lives on
  the order line (§2.8).

### 2.7 `orders`

The central entity (PRD §6). One car, one box, one time slot, a status lifecycle.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `client_id` | uuid fk → clients not null | |
| `car_id` | uuid fk → cars not null | category snapshot taken at booking via car |
| `box` | smallint not null | `check (box in (1,2))` — two fixed boxes (PRD §5) |
| `starts_at` | timestamptz not null | |
| `duration_min` | int not null | default = Σ line durations; **manually editable** (PRD §4 step 3) |
| `ends_at` | timestamptz **generated** | `starts_at + duration_min` (stored generated, for the overlap constraint) |
| `status` | `order_status` not null default `'vytvorena'` | |
| `note` | text null | manager-only edit (PRD §7) |
| `created_by` | uuid fk → staff not null | audit (PRD §11) |
| `reminded_at` | timestamptz null | idempotency marker for the 30-min SMS (architecture §6) |
| `deleted_at` | timestamptz null | soft-cancel; allowed only before `zaplatena` (PRD §6) |
| `created_at` | timestamptz not null default now() | |
| `updated_at` | timestamptz not null default now() | |

**Conflict prevention (PRD §4, acceptance §15.3)** — Postgres exclusion constraint
(requires `btree_gist`):

```sql
alter table orders add constraint orders_no_box_overlap
  exclude using gist (
    box with =,
    tstzrange(starts_at, ends_at) with &&
  )
  where (deleted_at is null and status <> 'nedostavil_sa');
```

Deleted and *nedostavil sa* orders free their slot (PRD §6); all other states
occupy it. This makes a conflicting reservation impossible at the DB level, not
just in app code.

**Assigned workers:** an order may have **multiple** assigned workers — modeled M:N
via `order_staff` (§2.14), not a column here.

**Status transition rules** (enforced in Server Actions, audited):
`vytvorena → hotova` (any role; fires the "ready" SMS), `hotova → zaplatena`
(manager only, Phase 1 manual), `vytvorena → nedostavil_sa` (manager only, frees
slot), and the **approved exception** `nedostavil_sa → vytvorena` (manager only — a
late-arriving client; re-checks conflict + hours because the slot may have been
rebooked). No *other* transition returns to `vytvorena` (overrides PRD §6 for this one
case only).

**Indexes:** `(box, starts_at)` and `(starts_at)` for calendar range queries;
`(client_id)`, `(car_id)`, `(status)`.

### 2.8 `order_services`

The services on an order. Values are **snapshotted** at add time so later catalog
edits never rewrite history (PRD §10 integrity). A service may be added in any
order state and removed only if not yet performed (PRD §9.3).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `order_id` | uuid fk → orders not null | |
| `service_id` | uuid fk → services not null | reference (may later be inactive) |
| `name_snapshot` | text not null | service name at add time |
| `category_snapshot` | `pricing_category` null | the car's category at add time |
| `quantity` | int not null default 1 | >1 only for per-unit add-ons |
| `duration_min_snapshot` | int null | per-unit × quantity contribution to order duration |
| `price_cents_snapshot` | int not null | per-unit × quantity |
| `paid` | boolean not null default false | per-line paid flag (PRD §9.3) |
| `added_by` | uuid fk → staff not null | audit |
| `added_at` | timestamptz not null default now() | |
| `removed_at` | timestamptz null | soft-remove (only if not performed) |

**Index:** `(order_id)`.

### 2.9 `sms_messages`

Outbound SMS log (PRD §8). Failures are visible on the order and retryable.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `order_id` | uuid fk → orders not null | |
| `type` | `sms_type` not null | `reminder` \| `ready` |
| `phone` | text not null | recipient at send time |
| `body` | text not null | rendered template (Slovak; ≤70 chars w/ diacritics — PRD §8) |
| `status` | `sms_status` not null default `'pending'` | |
| `provider_message_id` | text null | from the SMS provider |
| `error` | text null | failure reason (shown on order) |
| `sent_at` | timestamptz null | |
| `delivered_at` | timestamptz null | set by the webhook (architecture §1) |
| `created_at` | timestamptz not null default now() | |

**Indexes:** `(order_id)`, `(status)`, `(provider_message_id)` (webhook lookup).

### 2.10 `sms_templates`

Editable message bodies so wording can change without a deploy (PRD §8: "configured
per client request"). Seeded with simple Slovak placeholders now, replaced later
(confirmed in planning).

| Column | Type | Notes |
| --- | --- | --- |
| `type` | `sms_type` **pk** | one active template per type |
| `body` | text not null | with placeholders, e.g. `{cas}`, `{spz}` |
| `updated_at` | timestamptz not null default now() | |

### 2.11 `audit_log`

Basic audit trail (PRD §11). Manager-only read; retained ≥3 months.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `actor_email` | text not null | edge identity at action time |
| `actor_staff_id` | uuid fk → staff null | resolved role-bearer (null if not yet in staff) |
| `action` | text not null | e.g. `order.create`, `order.status_change`, `order.delete`, `order.note_edit`, `order.assign`, `order_service.add/remove/paid` |
| `entity_type` | text not null | `order`, `order_service`, … |
| `entity_id` | uuid not null | |
| `order_id` | uuid null | convenience FK for filtering by order |
| `details` | jsonb null | before/after, e.g. `{"from":"vytvorena","to":"hotova"}` |
| `created_at` | timestamptz not null default now() | |

**Indexes:** `(created_at)`, `(entity_type, entity_id)`, `(order_id)`.

### 2.12 `opening_hours`

Per-weekday hours; closed hours render greyed in the calendar (PRD §14).

| Column | Type | Notes |
| --- | --- | --- |
| `day_of_week` | smallint **pk** | 0=Mon … 6=Sun (app convention) |
| `open_time` | time null | null when `is_closed` |
| `close_time` | time null | |
| `is_closed` | boolean not null default false | |

### 2.13 `day_overrides`

Per-date exceptions to the recurring weekly `opening_hours`, managed by the manager
(PRD §14). A date can be either **fully closed** or **open with custom hours** (e.g.
24 Dec 08:00–12:00). Generalizes the original "holidays" idea (closed-only) so
half-days/shortened days are expressible without editing the weekly schedule.

| Column | Type | Notes |
| --- | --- | --- |
| `day` | date **pk** | the overridden date |
| `is_closed` | boolean not null default true | true = closed all day; false = use the custom times below |
| `open_time` | time null | required (15-min boundary) when `is_closed=false`; null otherwise |
| `close_time` | time null | required (15-min boundary) when `is_closed=false`; `open_time < close_time` |
| `label` | text null | e.g. "Štátny sviatok", "Štedrý deň – skrátené" |

When a `day_overrides` row exists for a date, it **wins** over that weekday's
`opening_hours`. The availability helper (spec 04) resolves: override → else weekday
hours.

### 2.14 `order_staff` (M:N)

Workers assigned to an order. An order may have several workers; a worker is on many
orders (PRD §3: either role may assign self or others). Replaces the former single
`orders.assigned_staff_id`.

| Column | Type | Notes |
| --- | --- | --- |
| `order_id` | uuid fk → orders not null | |
| `staff_id` | uuid fk → staff not null | the assigned worker |
| `assigned_by` | uuid fk → staff not null | who made the assignment (audit) |
| `assigned_at` | timestamptz not null default now() | |
| **pk** | (`order_id`, `staff_id`) | a worker is assigned at most once per order |

**Indexes:** `(order_id)`, `(staff_id)` (the latter for "orders for worker X" and
history-by-worker views). Assignments are added/removed directly (no soft-delete); each
add/remove writes `audit_log` (`order.assign` / `order.unassign`).

---

## 3. Authorization / RLS strategy

Primary gate = **Cloudflare Access at the edge + role checks in Server Actions**
(`CLAUDE.md`). RLS is **defense-in-depth** — a backstop against direct database
access, never the primary mechanism. Per-table posture:

| Path | Connection | Gate |
| --- | --- | --- |
| **Writes** (all mutations) | Server Action → `service_role` key (server-only) | App resolves role from `staff` and checks the PRD §3 rule **before** mutating. `service_role` bypasses RLS by design. |
| **Reads for pages** | Server Component → `service_role` (server-only) | Same edge gate; rendered server-side, key never reaches the browser. |
| **Realtime (live calendar)** | Browser subscription | See §3.1 — the open question. |

**RLS baseline:** enable RLS on **every** table with **deny-by-default** (no policy
for the `anon` role → anon can read/write nothing). This makes the public
`anon` key worthless on its own, which matters because the key is internet-reachable
directly at Supabase (bypassing Cloudflare). `service_role` (used only server-side)
bypasses RLS, so app reads/writes are unaffected.

### 3.1 How the browser authenticates Realtime (decided)

The live-calendar requirement (PRD §5) needs the **browser** to hold a Realtime
subscription. Auth is at the Cloudflare edge, so there is **no Supabase user JWT**.

**Critical fact:** Cloudflare Access gates only the Next.js app on the VPS — it does
**not** sit in front of Supabase Cloud. The Supabase URL + anon key are shipped to
the browser (`NEXT_PUBLIC_*`) and are reachable **directly** over the internet,
bypassing Cloudflare. So "the app is only reachable behind Cloudflare" does **not**
protect the database. Anon read policies would expose every client's name/phone to
anyone holding the public anon key — rotation is only a band-aid. That approach is
rejected.

**Decision — server-minted Supabase JWT.** On page load, the Server Component mints
a short-lived JWT signed with `SUPABASE_JWT_SECRET`, embedding the Cloudflare
identity + role as claims. The browser uses it for the Realtime subscription only.
RLS keeps **deny-by-default for `anon`** and grants reads only on an `authenticated`
claim, so the bare anon key grants nothing. Initial calendar load is server-rendered
via `service_role` regardless; only the live subscription uses the minted JWT.

This requires `SUPABASE_JWT_SECRET` in the env map (architecture §3.2) and a
token-minting helper in `lib/`. The first spec wires it as part of the walking
skeleton's Realtime slice.

---

## 4. Soft-delete vs hard-delete summary

| Table | Strategy | Why |
| --- | --- | --- |
| `staff` | `active` flag | preserve FK refs in history/audit (PRD §10) |
| `services` | `active` flag | catalog integrity (PRD §9.1) |
| `orders` | `deleted_at` (only before `zaplatena`) | cancel ≠ erase; stays in client history (PRD §6, §10) |
| `order_services` | `removed_at` (only if not performed) | history integrity (PRD §9.3) |
| `order_staff` | hard add/remove (audited) | a current-assignment association; the audit log preserves the history |
| `clients`, `cars` | hard-delete avoided in Phase 1 | personal data; no delete flow in PRD. GDPR erasure handled ad-hoc by manager if ever needed (out of Phase 1 scope) |
| `audit_log` | append-only, retain ≥3 months | PRD §11.2 |
| `sms_messages` | append-only | delivery record |
| `opening_hours`, `day_overrides`, `sms_templates` | mutable config | no history value |
