# Spec 03 — Service catalog

> **Status:** draft · **PRD refs:** §9 (service management), §13#2 (Phase-1 pricing),
> §13#3 (duration mechanism) · **Depends on:** 01 (auth, audit, RLS baseline) ·
> **Architecture refs:** §2 (authz) · **Data-model refs:** §2.5 `services`, §2.6
> `service_prices`, §1 (`pricing_category`, `service_kind` enums), §3 (RLS)

The catalog of services the manager combines when creating an order. Each service has
a **per-(service × car category) duration and price**, seeded from `docs/services.md`.
This spec delivers the catalog tables, the seed, manager-only management, and the
**duration/price lookup** the booking flow (spec 05) consumes.

---

## 1. Requirements

### 1.1 What this feature does

1. Model **services** (`main` | `addon`), each with per-category rows of
   `duration_min` + `price_cents` in `service_prices`.
2. **Seed** the catalog from `docs/services.md` (dev-team responsibility, PRD §9.1) —
   main services (Interiér/Exteriér Classic, Interiér Premium/Tepovanie, Ochrana laku
   MM1–4) and add-ons (doplnkové služby).
3. Handle every shape in the price list: per-category prices, **`price_from`** ("od")
   prices, **`is_per_unit`** (`…/ks`) add-ons, and **NULL duration** items (no
   scheduled time, e.g. dezinfekcia ozónom, ohrievače).
4. **Manager-only catalog management:** create/edit a service and its prices, and
   **activate/deactivate** (never hard-delete — PRD §9.1).
5. A **lookup API** `getServicePrice(serviceId, category)` returning the right
   duration + price, used by booking (spec 05).
6. Audit every catalog mutation (PRD §11).

### 1.2 User stories (PRD §9)

- As the **manager**, I see the full catalog and can deactivate a service we no longer
  offer without losing it from past orders.
- As the **manager**, I can correct a price or duration for a service/category.
- As **either role** (during booking), selecting a service for a given car category
  yields the correct duration and price automatically.

### 1.3 Non-goals

- No order/booking logic (spec 05 consumes the lookup).
- No automatic total/price calculation on orders or POS (Phase 2, PRD §12.1) — Phase 1
  pricing is **display/evidence only** (PRD §13#2).
- No per-client custom pricing or discounts (Phase 2 loyalty, PRD §12.2).
- No hard-delete of services.

### 1.4 Roles (PRD §3)

Catalog management is **manager only** ("Správa katalógu služieb: Áno / Nie").
Reading the catalog (for booking) is available to **both roles**.

---

## 2. Design

### 2.1 Routes & UI

| Route | Access | Purpose |
| --- | --- | --- |
| `/services` | **manager** | list services (active + inactive), add/edit, activate toggle |
| `/services/[id]` | **manager** | edit service + its per-category price/duration rows |

- `prevadzka` navigating to `/services` gets the 403 view (spec 01).
- List groups by `kind` (main vs add-on), shows `active` badge, per-category price/
  duration grid. shadcn/ui `Table`, `Dialog`, `Input`, `Switch`, `Badge`. Mobile-first.
- **Inactive services are hidden by default**; a header **"Zobraziť neaktívne" / "Skryť
  neaktívne"** toggle (mirrors `worker-manager.tsx`, spec 11) reveals them greyed. The action
  still returns active + inactive (`listServices` is unchanged); the toggle is a client-side
  `useMemo` filter. See spec 18 §2.1.
- Editing a service shows up to 6 category rows (os/suv/van/dod/motorka/stavba); add-
  ons may have a single category-independent (`NULL`) row.

### 2.2 Seed (`supabase/seed.sql`, extended)

Translate `docs/services.md` into rows. Prices are euros → integer **cents**
(`18,90 € → 1890`). Examples (full set in the seed):

| Service | kind | category | duration_min | price_cents | flags |
| --- | --- | --- | --- | --- | --- |
| Interiér Classic | main | os | 60 | 1890 | |
| Interiér Classic | main | suv | 60 | 2390 | |
| Interiér Classic | main | van | 75 | 3190 | |
| Interiér Classic | main | dod | 75 | 2890 | |
| Exteriér Classic | main | os | 45 | 1890 | |
| Exteriér Classic | main | motorka | 30 | 1890 | |
| Tepovanie (Int. Premium) | main | os | 360 | 13790 | |
| Tepovanie (Int. Premium) | main | stavba | 600 | 21790 | `price_from=true` |
| Ochrana laku MM1 | main | dod | 90 | 9790 | `price_from=true` ("Dod od") |
| Tepovanie sedadla | addon | NULL | 15 | 1500 | `is_per_unit=true` |
| Čistenie demont. kolies | addon | NULL | NULL | 500 | `is_per_unit=true` |
| Dezinfekcia ozónom | addon | NULL | NULL | 2000 | |

> **Seed notes** (defaults chosen; nothing blocking):
> - Each main service is seeded with exactly the categories `docs/services.md` lists
>   for it — these are not uniform (e.g. Interiér Classic has os/suv/van/dod;
>   Exteriér adds motorka; Tepovanie has os/suv/dod/van + **stavba**; Ochrana MM1–4
>   have os/suv/van/dod). A missing (service, category) pair means "not offered for
>   that category" and booking hides it (handled by `getServicePrice`).
> - **`stavba`** (stavebné auto / construction work vehicle) is a `pricing_category`,
>   not a service — it currently has a price only under Tepovanie, modeled with
>   `price_from=true` ("od 217,90 €").
> - `price_from=true` also applies to the "Dod od" rows in Ochrana laku MM1 and MM2.
> - The "Dod. … (/kabína)" note: kept in the service `name` for now; exact modeling
>   to be specified later (per client) — not blocking the seed.

### 2.3 Server Actions (`lib/actions/services.ts`)

All validate with zod, call `requireManager()`, write `audit_log`.

| Action | Input (zod) | Audit action |
| --- | --- | --- |
| `listServices` | `{ includeInactive? }` | — (read; manager page) |
| `getServicePrice` | `{ serviceId, category }` | — (read; used by booking) |
| `createService` | `{ name, kind, isPerUnit, prices[] }` | `service.create` |
| `updateService` | `{ id, name, isPerUnit, sortOrder? }` | `service.update` |
| `upsertServicePrice` | `{ serviceId, category|null, durationMin|null, priceCents, priceFrom }` | `service.price_update` |
| `deleteServicePrice` | `{ serviceId, category|null }` | `service.price_delete` |
| `setServiceActive` | `{ id, active }` | `service.activate` / `service.deactivate` |

- `getServicePrice(serviceId, category)`: returns the row matching the category, else
  the `NULL`-category row (flat add-ons), else an error "služba nie je dostupná pre
  tento typ vozidla" — booking uses this to hide unavailable combinations.
- `prices[]` on `createService` is validated: each entry has a valid category (or
  `null`), `priceCents ≥ 0`, `durationMin` null-or-positive.

### 2.4 Data & migrations

Migration `0003_service_catalog.sql`:
- `services` + `service_prices` per data-model §2.5–§2.6, with the
  `unique(service_id, pricing_category)` constraint and an index on
  `service_prices(service_id)`.
- Enable RLS, deny-by-default (supabase-migrations skill).
- Seed lives in `supabase/seed.sql` (re-applied by `supabase db reset`), **not** in the
  migration (no data in migrations — skill rule).

### 2.5 Error handling & loading states

- Typed action results `{ ok: false, message }` rendered inline (Slovak).
- Unique-violation on `(service_id, category)` → friendly "pre tento typ už cena
  existuje" rather than a raw DB error.
- `/services` uses a loading skeleton; empty add-on category shows a clear hint.

---

## 3. Tasks

1. **(M)** Migration `0003_service_catalog.sql` (tables, unique constraint, index, RLS
   deny-by-default). (dep: spec 01 baseline)
2. **(L)** Seed `docs/services.md` → `supabase/seed.sql` rows (cents conversion,
   flags, NULL durations); verify counts. (dep: 1)
3. **(M)** zod schemas + `lib/actions/services.ts` reads (`listServices`,
   `getServicePrice`) with the category-fallback logic + unit tests. (dep: 1)
4. **(M)** Catalog mutations (`createService`, `updateService`, `upsertServicePrice`,
   `setServiceActive`) with `requireManager` + audit. (dep: 1, 3)
5. **(M)** `/services` list + `/services/[id]` edit UI (per-category grid, active
   toggle). (dep: 4)
6. **(M)** Tests: unit (`getServicePrice` fallback, cents conversion, schemas), e2e
   (manager CRUD + activate; worker 403; seed integrity). (dep: 5)

---

## 4. Acceptance criteria

### 4.1 Build, types, lint, tests

```bash
pnpm typecheck   # exits 0
pnpm lint        # exits 0
pnpm test        # exits 0
pnpm build       # exits 0
```

### 4.2 Migration, RLS & seed integrity

```bash
supabase db reset   # applies 0003 + seed, exits 0
# RLS enabled, deny-by-default (expect rowsecurity=t, 0 anon policies):
psql "$LOCAL_DB_URL" -c \
  "select tablename, rowsecurity from pg_tables \
   where tablename in ('services','service_prices') order by 1;"
psql "$LOCAL_DB_URL" -c \
  "select count(*) from pg_policies \
   where tablename in ('services','service_prices') and 'anon' = any(roles);"
# Seed loaded: at least the main services + add-ons exist (expect > 0):
psql "$LOCAL_DB_URL" -c "select count(*) from services;"
psql "$LOCAL_DB_URL" -c "select count(*) from service_prices;"
# Every price row has non-negative cents; durations are null or positive (expect 0 bad):
psql "$LOCAL_DB_URL" -c \
  "select count(*) from service_prices \
   where price_cents < 0 or (duration_min is not null and duration_min <= 0);"
# unique(service_id, pricing_category) enforced (expect 1 matching index/constraint):
psql "$LOCAL_DB_URL" -c \
  "select count(*) from pg_constraint where conname like '%service_prices%' \
   and contype = 'u';"
```

### 4.3 Lookup fallback (unit, must pass)

- `getServicePrice(mainService, 'suv')` returns the SUV row's duration + price.
- `getServicePrice(flatAddon, 'os')` returns the `NULL`-category row (flat add-on).
- `getServicePrice(mainService, <category with no row>)` returns the "not available"
  error, not a wrong price.
- Cents conversion: `18,90 €` ↔ `1890`; rendering shows `18,90 €`.

```bash
pnpm test services/price-lookup   # exits 0
```

### 4.4 Authorization (e2e, must pass)

- As **prevádzka**: `/services` → 403; `createService`/`setServiceActive` rejected.
- As **manažér**: create a service with per-category prices, edit a price, deactivate
  it — all succeed; deactivated service is hidden from booking but retained.

```bash
pnpm test e2e/services-permissions   # exits 0
```

### 4.5 Audit (e2e, must pass)

- `createService` → `audit_log` `service.create`; `upsertServicePrice` →
  `service.price_update`; `setServiceActive(false)` → `service.deactivate` — each with
  correct `actor_email` and `entity_id`.

```bash
pnpm test e2e/services-audit   # exits 0
```

### 4.6 Manual checks

- [ ] `/services` per-category price/duration grid is readable at 360px.
- [ ] All visible strings are Slovak; prices render as `18,90 €`.
- [ ] A deactivated service no longer appears in the (spec 05) booking picker; it is hidden
      from the default `/services` view but reappears (greyed) once "Zobraziť neaktívne" is
      toggled on.
- [ ] Seeded values spot-checked against `docs/services.md` (a few main services + one
      `price_from` and one `is_per_unit` add-on).
