# Spec 02 — Clients & cars

> **Status:** draft · **PRD refs:** §4 (client/car identification), §10 (client
> detail & search), §13#1 (shared ŠPZ) · **Depends on:** 01 (auth, audit, RLS
> baseline, migration foundation) · **Architecture refs:** §2 (authz), §7 (GDPR —
> personal data) · **Data-model refs:** §2.2 `clients`, §2.3 `cars`, §2.4
> `client_cars`, §3 (RLS)

Clients and their cars: the records every order hangs off. The client is keyed by
**phone number**; a car is keyed by **ŠPZ and shared across clients** (PRD §13#1).
This spec delivers the entities, search, and the shared-ŠPZ link/duplicate-detection
that the booking flow (spec 05) and history (spec 08) depend on.

---

## 1. Requirements

### 1.1 What this feature does

1. **Clients** keyed by phone (E.164-normalized, unique), with an optional name.
2. **Cars** keyed by ŠPZ (unique) **when present** — ŠPZ is **optional** (a brand-new car
   may have no plate yet). A car also carries an optional **brand** (značka — a fuzzy
   type-to-filter combobox over a curated brand list, free text allowed), an optional
   model, and a required `pricing_category` (`os | suv | van | dod | motorka | stavba`).
   Brand + model display combined as "Škoda Octavia" (`formatCarLabel`); a car's headline
   label is `formatCarPrimary` (ŠPZ → else brand/model → else "Bez ŠPZ").
   - A **missing plate is stored as `NULL`, never an empty/whitespace string** —
     `normalizeSpz` returns `NULL` for blank input and a DB `CHECK (cars_spz_not_blank)`
     backstops it. NULLs are distinct under the unique index, so two plateless cars never
     collide and never auto-link (which would otherwise merge unrelated clients' history).
   - A plateless car must still be identifiable: the add/edit form **requires a brand or
     model** when ŠPZ is absent.
3. **Many-to-many** client↔car: a car may belong to several clients; a client may
   have several cars (PRD §13#1).
4. **Shared-ŠPZ duplicate detection:** adding a car whose ŠPZ already exists links the
   existing car to the client instead of creating a duplicate. **A plateless car has no
   shared key**, so the dedup/link step is skipped — it is always created fresh and owned
   only by the client who added it.
5. **Unified fuzzy search** for clients by **phone, name, or ŠPZ** in one box — typo-
   tolerant autocomplete (PRD §10).
6. A **client detail** stub: client data + linked cars. (Full per-car *visit history*
   is spec 08, which needs orders — out of scope here.)
7. Audit every client/car mutation (PRD §11).

### 1.2 User stories (PRD §4, §10)

- As **either role**, I enter a phone number and instantly see whether the client
  exists and which cars they have — so I can start a reservation in seconds.
- As **either role**, I can register a new client and add a car (ŠPZ, model, category).
- As **either role**, I can add a car that has **no plate yet** (giving at least a brand
  or model); later, as **manager**, I can set its ŠPZ — which re-runs the shared-ŠPZ check.
- As **either role**, when I type a ŠPZ that already exists under someone else, the app
  offers to link it to this client so the shared history stays intact.
- As **either role**, I can search clients by phone or name.

### 1.3 Non-goals

- No per-car **visit history** rendering (spec 08 — needs orders).
- No order creation/booking (spec 05).
- No client/car **deletion** flow (data-model §4: no Phase-1 delete; GDPR erasure is
  out of scope). Editing is allowed; deleting is not.
- No reassigning history between owners.

### 1.4 Roles (PRD §3)

Both **manažér** and **prevádzka** may view clients/cars, create them, and view
history. PRD §3 grants worker order-creation, which requires creating/finding clients
and cars — so create/find here is **both roles**. Editing existing client/car *data*
mirrors order-data editing (manager-only, PRD §3 "Úprava údajov objednávky (… údaje o
aute)"); workers may add but not edit existing client/car fields. This split is made
explicit in §2.3.

---

## 2. Design

### 2.1 Routes & UI

| Route | Access | Purpose |
| --- | --- | --- |
| `/clients` | both roles | unified fuzzy search (phone / name / ŠPZ); suggestions; "new client" entry |
| `/clients/[id]` | both roles | client detail: data, linked cars, (history slot → spec 08) |

- **One search box, three fields:** a single debounced autocomplete that matches the
  query against the client's **phone**, **name**, or **any linked car's ŠPZ** — the user
  doesn't pick a field. Typing surfaces ranked suggestions (client name + phone +
  matched ŠPZ) and selecting one opens `/clients/[id]`.
- **Fuzzy & partial** via Postgres **`pg_trgm`** (typo-tolerant: `novak`→`Novák`,
  `BV12`→`BV123AB`), ranked by similarity (see §2.3). Server-side — client PII never
  ships to the browser (consistent with the deny-by-default RLS posture).
- "Pridať auto" dialog: ŠPZ, model, category select. On ŠPZ collision → link prompt.
- shadcn/ui: `Command`/combobox (autocomplete), `Input`, `Dialog`, `Select`, `Badge`
  (category). Mobile-first ≥360px — search + add-car must work one-handed on a phone.
- Slovak copy throughout.

### 2.2 Phone & ŠPZ normalization

- **Phone:** normalize to E.164 before insert/lookup (`lib/clients/phone.ts`). Slovak
  default region for bare national numbers. Search normalizes the query the same way so
  `0905…` and `+421905…` match the same client.
- **ŠPZ:** normalize (uppercase, strip spaces) before insert/lookup so `BV 123 AB` and
  `bv123ab` collide and trigger the link prompt. **Blank or whitespace-only ŠPZ normalizes
  to `NULL`** (a plateless car) — never an empty string; a too-short/invalid non-blank
  value is a validation error, not a silent `NULL`.

### 2.3 Server Actions (`lib/actions/clients.ts`, `lib/actions/cars.ts`)

All validate with zod; all that mutate write `audit_log`.

| Action | Input (zod) | Authz | Audit action |
| --- | --- | --- | --- |
| `findClientByPhone` | `{ phone }` | both | — (read; exact, used by the booking flow) |
| `searchClients` | `{ query, limit? }` | both | — (read; unified fuzzy autocomplete) |
| `createClient` | `{ phone, name? }` | both | `client.create` |
| `updateClient` | `{ id, phone?, name? }` | **manager** | `client.update` (or `client.phone_change`) |
| `addCarToClient` | `{ clientId, spz?, brand?, model?, pricingCategory }` | both | `car.create` or `car.link` |
| `linkExistingCar` | `{ clientId, carId }` | both | `car.link` |
| `updateCar` | `{ id, spz?, brand?, model?, pricingCategory, confirmMerge? }` | **manager** | `car.update` or `car.merge` |

- `createClient`: unique-phone violation → friendly Slovak error (no crash); offer to
  open the existing client.
- `addCarToClient`: normalize ŠPZ (blank → `NULL`); the schema requires a brand or model
  when ŠPZ is `NULL`.
  - **Plateless (`NULL`)** → skip the lookup; always create `cars` row + `client_cars`
    link (`car.create`). No dedup is possible without a plate.
  - **No match** → create `cars` row + `client_cars` link (`car.create`).
  - **Match under this client** → no-op with a notice.
  - **Match under a different client** → return `{ needsLinkConfirm: true, existingCar }`;
    UI prompts; confirm calls `linkExistingCar` (`car.link`). This is the shared-ŠPZ path.
- `updateClient` may change the **phone** (the client key), but **manager only** —
  people switch numbers. The new phone is normalized (E.164) and checked for
  uniqueness; a collision with another client returns a friendly Slovak error (offer to
  open that client). A phone change is audited as `client.phone_change` with
  `{from, to}` in `details`, so the key change is traceable (PRD §11). The client's
  cars and history are unaffected (history hangs off cars/orders, not the phone string).
- `updateCar` (manager) may also **set or change the ŠPZ** — e.g. adding a plate to a
  previously plateless car. The new plate is normalized; if it already belongs to **another
  car row** the two rows represent the same physical car, so the action offers to **merge**
  them (§2.6) rather than reject — it returns `{ needsMergeConfirm: true, existingCar }` and
  the UI confirms. The unique index backstops the case (`23505` → the same merge prompt) so
  a duplicate plate can never be written. Clearing the plate is allowed only if a brand or
  model still identifies the car **and** the car is **not shared** — clearing the ŠPZ off a
  car owned by more than one client would silently break the shared-ŠPZ link (the car goes
  plateless, so future adds of that plate no longer link here), so it is rejected with a
  friendly Slovak error.
- Changing owner↔car associations is link-only, never destructive.
- `searchClients({ query })`: returns up to `limit` (default ~10) **client** suggestions
  where the query trigram-matches the client's `name`, `phone`, **or any linked car's
  `spz`** (join `client_cars`→`cars`). Implemented with `pg_trgm`: the `%` similarity
  operator (backed by the GIN indexes, data-model §2.2–§2.3) plus `similarity()` for
  ranking; phone also matched on the normalized digits so `0905…` finds `+421905…`.
  Results carry `{ clientId, name, phone, matchedSpz? }` ordered by greatest similarity.
  A short query (< 2 chars) returns nothing (avoids scanning everything).

### 2.4 Data & migrations

Migration `0002_clients_cars.sql`:
- `create extension if not exists pg_trgm;`
- `clients`, `cars`, `client_cars` per data-model §2.2–§2.4, with indexes
  (`clients.phone` unique, `cars.spz` unique, `client_cars(client_id)`,
  `client_cars(car_id)`), plus **trigram GIN** indexes: `clients(name gin_trgm_ops)`,
  `clients(phone gin_trgm_ops)`, `cars(spz gin_trgm_ops)`.
- Enable RLS, deny-by-default (no anon policies) — per the supabase-migrations skill.
- Migration `0017_optional_car_spz.sql`: `cars.spz` is **nullable** (plateless cars) with
  a `CHECK (spz is null or btrim(spz) <> '')` backstop so a blank string can never land in
  the column. The unique index treats NULLs as distinct, so plateless cars never collide.
- Migration `0018_merge_cars.sql`: the `merge_cars(source, target, brand, model, category)`
  function (§2.6). `SECURITY DEFINER`, `EXECUTE` revoked from `public`/`anon`/`authenticated`
  and granted to `service_role` — mirrors `delete_client_cascade` (`0014`) and `search_clients`
  (`0002`). It runs the whole merge in one transaction.

### 2.5 Error handling & loading states

- Typed action results `{ ok: false, message }` rendered inline; the link-confirm case
  returns `{ ok: true, needsLinkConfirm: true, existingCar }` so the UI can branch.
- Search and detail use shadcn `Skeleton` while loading; empty-state copy in Slovak
  ("Žiadny výsledok"). Search is debounced (~200 ms) and aborts stale in-flight requests.

### 2.6 Merging cars (setting a colliding plate)

When a manager sets a car's ŠPZ to a plate that already belongs to **another** car row,
the two rows are the same physical car and must collapse into one. This is the **only**
place a merge arises — `addCarToClient` never creates a duplicate (an existing plate links
the *client* to the one car row; a plateless car has no key to dedup on).

**Confirm, don't auto-merge.** `updateCar` mirrors the overlap-confirm pattern
(`allowOverlap`): a `confirmMerge?: boolean` input gates the destructive step.

| Result | When |
| --- | --- |
| `{ ok: true, needsMergeConfirm: true, existingCar }` | plate collides with car `Y`, `confirmMerge` not set |
| `{ ok: true, mergedInto: Y.id }` | plate collides, `confirmMerge: true` → merge performed |
| `{ ok: true }` | no collision → normal field/plate update |
| `{ ok: false, message }` | validation / shared-plate-clear guard / not found |

**Survivor & rules** (confirmed product decisions):
- The **pre-existing plated car `Y` survives** (keeps its `id` and existing orders/links);
  the edited car `X` is merged into it. Matches the "use the existing car" principle.
- The survivor's `brand` / `model` / `pricing_category` are set to the **manager's edited
  values** (the freshest intent). Past orders are unaffected — they snapshot their own
  duration/price at booking, so the car's current category only drives *future* bookings.
- The merged-away `X` is **hard-deleted** once empty. A documented exception to the
  soft-delete rule (like the client hard-delete, `0014`): nothing is lost — every order and
  link moved to `Y` — and the merge is fully recorded in `audit_log`. The merge is
  **irreversible**.

**`merge_cars(source, target, brand, model, category)`** (migration `0018`) runs the whole
operation in **one transaction** (`SECURITY DEFINER`, called by RPC — the app can't do this
atomically across statements):
1. `update orders set car_id = target where car_id = source` (all statuses, incl. history).
2. Link every `source`-owner to `target`: `insert into client_cars (client_id, target) …
   on conflict do nothing` (dedups when a client owned both), then delete `source`'s links.
3. `update cars set brand/model/pricing_category = …` on `target`.
4. `delete from cars where id = source` (now an empty shell).

The action calls the RPC, then writes the audit (audit stays in the action layer to capture
the actor — CLAUDE.md): `car.merge` on `entity_id = target` with
`{ source_id, target_id, spz, reassigned_orders, merged_clients }`.

**UI.** `client-detail`'s edit-car dialog: a `needsMergeConfirm` result opens a confirm
naming both cars and the consequence — *"Auto {X} spojiť s autom {Y}? Objednávky a klienti
auta {X} sa presunú na auto {Y}. Pôvodné auto sa odstráni a akcia sa nedá vrátiť."* —
**Spojiť** re-calls `updateCar` with `confirmMerge: true`; on success it toasts "Autá
spojené." and refreshes (the open client is now linked to `Y`). A cancel path leaves both
rows untouched.

**Concurrency.** Check-then-act, no DB-level lock — the same accepted TOCTOU posture as the
box-overlap soft check (single-operator wash). If `target` is concurrently deleted, the FK
reassignment fails inside the transaction and the whole merge rolls back, surfaced as a
friendly Slovak error. Do **not** add locking to "fix" this.

**Audit labels** (`lib/audit/labels.ts`): `car.merge` → "Spojenie áut"; `summarizeDetails`
renders the source→target ŠPZ (defensive on missing keys, never throws).

---

## 3. Tasks

1. **(M)** Migration `0002_clients_cars.sql` (pg_trgm extension, tables, unique +
   trigram GIN indexes, RLS deny-by-default). (dep: spec 01 migration baseline)
2. **(S)** `lib/clients/phone.ts` (E.164 normalize) + `lib/cars/spz.ts` (ŠPZ normalize)
   with unit tests. (dep: 1)
3. **(M)** zod schemas + `lib/actions/clients.ts` (`findClientByPhone`, `searchClients`,
   `createClient`, `updateClient`) with authz + audit. (dep: 1, 2)
4. **(M)** `lib/actions/cars.ts` (`addCarToClient` with duplicate detection,
   `linkExistingCar`, `updateCar`) with authz + audit. (dep: 1, 2)
5. **(M)** `/clients` unified fuzzy search page (one box → phone/name/ŠPZ autocomplete,
   debounced + abortable, ranked suggestions, new-client entry). (dep: 3)
6. **(M)** `/clients/[id]` detail: data + linked cars + add-car dialog + link-confirm
   prompt. (history section is a placeholder slot for spec 08). (dep: 3, 4)
7. **(S)** Worker-vs-manager edit gating in UI (workers can add, not edit fields). (dep: 5,6)
8. **(M)** Tests: unit (phone/ŠPZ normalize, schemas), e2e (create client, add car,
   shared-ŠPZ link, manager-only edit, search). (dep: 5, 6)
9. **(M)** Car merge (§2.6): migration `0018_merge_cars.sql` (`merge_cars` function +
   grants), `updateCar` `confirmMerge` branch + `car.merge` audit, `car.merge` audit
   labels, the merge-confirm dialog in the edit-car flow, and e2e/unit coverage. (dep: 4, 6)

---

## 4. Acceptance criteria

### 4.1 Build, types, lint, tests

```bash
pnpm typecheck      # exits 0
pnpm lint           # exits 0
pnpm test           # exits 0
pnpm build          # exits 0
```

### 4.2 Migration & RLS

```bash
supabase db reset   # applies 0002, exits 0
# RLS enabled on all three tables (expect 3 rows, rowsecurity=t):
psql "$LOCAL_DB_URL" -c \
  "select tablename, rowsecurity from pg_tables \
   where tablename in ('clients','cars','client_cars') order by 1;"
# Deny-by-default: no anon policies (expect 0):
psql "$LOCAL_DB_URL" -c \
  "select count(*) from pg_policies \
   where tablename in ('clients','cars','client_cars') and 'anon' = any(roles);"
# Uniqueness present (expect unique index on clients.phone and cars.spz):
psql "$LOCAL_DB_URL" -c \
  "select indexdef from pg_indexes \
   where tablename in ('clients','cars') and indexdef ilike '%unique%';"
# pg_trgm enabled + trigram GIN indexes present (expect 3: name, phone, spz):
psql "$LOCAL_DB_URL" -c "select 1 from pg_extension where extname='pg_trgm';"
psql "$LOCAL_DB_URL" -c \
  "select count(*) from pg_indexes where tablename in ('clients','cars') \
   and indexdef ilike '%gin_trgm_ops%';"
```

### 4.3 Normalization (unit, must pass)

- `0905123456`, `+421905123456`, `00421 905 123 456` all normalize to one value.
- `BV 123 AB`, `bv123ab`, `BV123AB ` all normalize to one ŠPZ.

```bash
pnpm test clients/phone cars/spz    # exits 0
```

### 4.4 Shared-ŠPZ duplicate detection (e2e, must pass)

- Create client A, add car `XX123` → `cars` has 1 row, `client_cars` has 1 link.
- Create client B, add car `xx 123` → **no new `cars` row**; action returns
  `needsLinkConfirm`; confirming creates a **second `client_cars` link** to the same
  `cars` row. Final state: `cars`=1, `client_cars`=2, audit has a `car.link` entry.

```bash
pnpm test e2e/shared-spz            # exits 0
```

### 4.5 Authorization (e2e, must pass)

- As **prevádzka**: `createClient` and `addCarToClient` succeed; `updateClient`
  (incl. phone) and `updateCar` are rejected with `ForbiddenError`.
- As **manažér**: all of the above succeed, including changing a client's phone; the
  change writes a `client.phone_change` audit row with `{from, to}`, and a subsequent
  lookup by the **new** phone finds the client while the old phone returns the empty
  state.
- Changing a phone to one already used by another client is rejected with a friendly
  Slovak error (no partial update).

```bash
pnpm test e2e/clients-permissions   # exits 0
```

### 4.6 Unified fuzzy search (e2e, must pass — PRD §10)

- Given client "Ján Novák", phone `+421905123456`, car `BV123AB`:
  - query `novak` (no diacritics) → returns the client (trigram, typo/diacritic
    tolerant).
  - query `novk` (transposed/missing letter) → still returns the client (fuzzy).
  - query `0905` → returns the client (phone match across normalization).
  - query `BV12` → returns the client via the **ŠPZ** match, with `matchedSpz` set.
- Results are ranked by similarity; a non-matching query and a <2-char query return
  empty. A car shared by two clients surfaces **both** when searched by that ŠPZ.

```bash
pnpm test e2e/clients-search        # exits 0
```

### 4.7 Audit (e2e, must pass)

- `createClient` → `audit_log` row `client.create`; `addCarToClient` (new) →
  `car.create`; link path → `car.link`, each with the correct `actor_email` and
  `entity_id`.

```bash
pnpm test e2e/clients-audit         # exits 0
```

### 4.8 Manual checks

- [ ] `/clients` search + add-car dialog usable at 360px (no horizontal scroll).
- [ ] All visible strings are Slovak.
- [ ] Adding an existing ŠPZ shows the Slovak link prompt, not a duplicate.
- [ ] Add-car dialog: ŠPZ is optional; submitting with no ŠPZ and no brand/model is blocked.

### 4.9 Plateless cars (optional ŠPZ)

- `cars.spz` is nullable; `CHECK (cars_spz_not_blank)` rejects an empty/whitespace plate.
- Two plateless cars (`spz = NULL`) coexist (NULLs distinct under the unique index) and are
  **not** auto-linked to each other.
- `addCarToClientSchema` / `updateCarSchema`: blank ŠPZ → `NULL`; a plateless car with no
  brand and no model is rejected; an implausible non-blank plate is rejected.
- A manager can set a plate on a plateless car; setting a plate already owned by another
  car row triggers the **merge** flow (§4.10), not a duplicate or a silent overwrite.
- ŠPZ-less cars render `formatCarPrimary` (brand/model, else "Bez ŠPZ") in the calendar,
  history, unpaid list, and order detail; the SMS `{spz}` token expands to the car label
  (else empty).

```bash
psql "$LOCAL_DB_URL" -c \
  "select is_nullable from information_schema.columns \
   where table_name='cars' and column_name='spz';"   # YES
pnpm test clients/spz validation/clients cars/format    # exits 0
```

### 4.10 Car merge (e2e, must pass — §2.6)

- Seed car `X` (plate `XX111`, one order, client A) and car `Y` (plate `YY222`, one order,
  client B). As **manager**, edit `X` and set its plate to `YY222`.
  - First submit returns `needsMergeConfirm`; the dialog names both cars and the
    irreversible consequence.
  - Confirming runs the merge: **`cars` has one row left** (`Y`, plate `YY222`, `X` gone);
    `Y` now has **both** orders (`orders.car_id` reassigned); both clients A and B are linked
    to `Y` in `client_cars` (no duplicate link); an `audit_log` `car.merge` row exists on
    `entity_id = Y` with `{ source_id, target_id, spz }`.
  - The survivor `Y` carries the **manager's edited** brand/model/category.
- Cancelling the confirm leaves both car rows and their links untouched.
- As **prevádzka**: `updateCar` (and therefore the merge) is rejected with `ForbiddenError`.

```bash
# Function exists and is SECURITY DEFINER (prosecdef = t):
psql "$LOCAL_DB_URL" -c \
  "select proname, prosecdef from pg_proc where proname = 'merge_cars';"
# EXECUTE not granted to anon/authenticated (inspect proacl — expect service_role only):
psql "$LOCAL_DB_URL" -c \
  "select proacl from pg_proc where proname = 'merge_cars';"
pnpm test e2e/car-merge            # exits 0
```
