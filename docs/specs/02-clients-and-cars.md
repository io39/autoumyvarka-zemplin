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

1. **Clients** keyed by phone (E.164-normalized, unique), with optional name and note.
2. **Cars** keyed by ŠPZ (unique), with optional model and a required
   `pricing_category` (`os | suv | van | dod | motorka`).
3. **Many-to-many** client↔car: a car may belong to several clients; a client may
   have several cars (PRD §13#1).
4. **Shared-ŠPZ duplicate detection:** adding a car whose ŠPZ already exists links the
   existing car to the client instead of creating a duplicate.
5. **Search** clients by phone or name (PRD §10).
6. A **client detail** stub: client data + linked cars. (Full per-car *visit history*
   is spec 08, which needs orders — out of scope here.)
7. Audit every client/car mutation (PRD §11).

### 1.2 User stories (PRD §4, §10)

- As **either role**, I enter a phone number and instantly see whether the client
  exists and which cars they have — so I can start a reservation in seconds.
- As **either role**, I can register a new client and add a car (ŠPZ, model, category).
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
| `/clients` | both roles | search by phone/name; results list; "new client" entry |
| `/clients/[id]` | both roles | client detail: data, linked cars, (history slot → spec 08) |

- Phone-first search box; debounced; matches exact phone or `ilike` name.
- "Pridať auto" dialog: ŠPZ, model, category select. On ŠPZ collision → link prompt.
- shadcn/ui: `Input`, `Table`/list, `Dialog`, `Select`, `Badge` (category). Mobile-first
  ≥360px — the search + add-car flow must work one-handed on a phone.
- Slovak copy throughout.

### 2.2 Phone & ŠPZ normalization

- **Phone:** normalize to E.164 before insert/lookup (`lib/clients/phone.ts`). Slovak
  default region for bare national numbers. Search normalizes the query the same way so
  `0905…` and `+421905…` match the same client.
- **ŠPZ:** normalize (uppercase, strip spaces) before insert/lookup so `BV 123 AB` and
  `bv123ab` collide and trigger the link prompt.

### 2.3 Server Actions (`lib/actions/clients.ts`, `lib/actions/cars.ts`)

All validate with zod; all that mutate write `audit_log`.

| Action | Input (zod) | Authz | Audit action |
| --- | --- | --- | --- |
| `findClientByPhone` | `{ phone }` | both | — (read) |
| `searchClients` | `{ query }` | both | — (read) |
| `createClient` | `{ phone, name?, note? }` | both | `client.create` |
| `updateClient` | `{ id, phone?, name?, note? }` | **manager** | `client.update` (or `client.phone_change`) |
| `addCarToClient` | `{ clientId, spz, model?, pricingCategory }` | both | `car.create` or `car.link` |
| `linkExistingCar` | `{ clientId, carId }` | both | `car.link` |
| `updateCar` | `{ id, model?, pricingCategory }` | **manager** | `car.update` |

- `createClient`: unique-phone violation → friendly Slovak error (no crash); offer to
  open the existing client.
- `addCarToClient`: normalize ŠPZ, look it up.
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
- Changing owner↔car associations is link-only, never destructive.

### 2.4 Data & migrations

Migration `0002_clients_cars.sql`:
- `clients`, `cars`, `client_cars` per data-model §2.2–§2.4, with indexes
  (`clients.phone` unique, `cars.spz` unique, `client_cars(client_id)`,
  `client_cars(car_id)`).
- Enable RLS, deny-by-default (no anon policies) — per the supabase-migrations skill.

### 2.5 Error handling & loading states

- Typed action results `{ ok: false, message }` rendered inline; the link-confirm case
  returns `{ ok: true, needsLinkConfirm: true, existingCar }` so the UI can branch.
- Search and detail use shadcn `Skeleton` while loading; empty-state copy in Slovak
  ("Žiadny klient s týmto číslom").

---

## 3. Tasks

1. **(M)** Migration `0002_clients_cars.sql` (tables, indexes, RLS deny-by-default).
   (dep: spec 01 migration baseline)
2. **(S)** `lib/clients/phone.ts` (E.164 normalize) + `lib/cars/spz.ts` (ŠPZ normalize)
   with unit tests. (dep: 1)
3. **(M)** zod schemas + `lib/actions/clients.ts` (`findClientByPhone`, `searchClients`,
   `createClient`, `updateClient`) with authz + audit. (dep: 1, 2)
4. **(M)** `lib/actions/cars.ts` (`addCarToClient` with duplicate detection,
   `linkExistingCar`, `updateCar`) with authz + audit. (dep: 1, 2)
5. **(M)** `/clients` search page (phone/name, debounced, results, new-client). (dep: 3)
6. **(M)** `/clients/[id]` detail: data + linked cars + add-car dialog + link-confirm
   prompt. (history section is a placeholder slot for spec 08). (dep: 3, 4)
7. **(S)** Worker-vs-manager edit gating in UI (workers can add, not edit fields). (dep: 5,6)
8. **(M)** Tests: unit (phone/ŠPZ normalize, schemas), e2e (create client, add car,
   shared-ŠPZ link, manager-only edit, search). (dep: 5, 6)

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

### 4.6 Search (e2e, must pass)

- Searching the exact phone returns the client; searching a name substring (case-
  insensitive) returns matching clients; a non-matching phone returns the empty state.

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
