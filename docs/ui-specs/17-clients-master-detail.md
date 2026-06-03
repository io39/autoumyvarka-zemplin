# Spec 17 — Zákazníci: merged master-detail (`/clients`)

> **Status:** draft · **PRD refs:** §4 (phone key), §10 (history) ·
> **Depends on:** spec 13 (theme), spec 15 (full order page), spec 16 (wizard step-2 entry) ·
> **UI-redesign refs:** `../UI-STRUCTURE.md` §9 · **Baseline refs:**
> `../zemplin-baseline.md` (client-search.tsx, client-detail.tsx)

Merge the client **search** page and the client **detail** into a single **master-detail**
page: search → click → **detail appears inline** (no page load), selection reflected in the
URL as **`/clients?id=…`**. Keep `/clients/[id]` as a **redirect** deep-link. Restructure
the detail to the §9 layout: per-car **accordion** history with **Poradie**, expanded-order
Pracovníci/Poznámka/box/€.

---

## 1. Requirements

### 1.1 What this feature does

1. `/clients` becomes a **master-detail** page: a search list (master) + an inline
   `<ClientDetail>` (detail) — **below the list on mobile, side-by-side on `sm:+`**.
2. Selecting a result loads it via `getClientWithHistory(id)` and renders inline; the
   selection is stored in the URL as **`?id=`** (refresh / back / bookmark work).
3. Before searching: a **blank "type to search" prompt** (no list). Results **sorted by
   meno**; rows show **meno + telefón** only.
4. **"+ Nový zákazník"** on the page — **all roles**. Its dialog shows the same
   **non-blocking duplicate-phone hint** as the wizard (spec 16): as the phone is typed, an
   exact normalized-phone match (`searchClients` + `normalizePhone`) shows an amber note
   naming the existing client (`data-dup-phone`); submitting a duplicate opens the existing
   client (no new record — `clients.phone` is unique).
5. Restructure the detail (§9): Klient blok (Nová rezervácia under the name · +Pridať auto ·
   Upraviť klienta) → Zoznam áut → **per-car** order history with **Poradie** (per car) →
   expanded order shows Pracovníci + Poznámka (+ box + total €) → row opens the **full order
   page** `/orders/[id]`. Each vehicle is a **visually distinct block** (own card +
   alternating background tint + spacing) so its orders are clearly grouped.
6. Keep `app/clients/[id]/page.tsx` as a **redirect** to `/clients?id=<id>` — never delete.

### 1.2 User stories (UI-STRUCTURE §9)

- As staff, I search a client and their detail opens **inline** — one fewer page load —
  and I can deep-link/bookmark a client via `?id=`.
- As staff, I expand a car to see just that car's visit history, each visit numbered
  (Poradie), and open the full order when I need everything.

### 1.3 Non-goals

- **No change to the client/car/history Server Actions** — `searchClients`,
  `getClientWithHistory`, `createClient`, `updateClient`, `addCarToClient`,
  `linkExistingCar`, `updateCar` are reused unchanged (spec 02).
- **No new car fields** — the schema has ŠPZ, model, `pricing_category` (kategória); the
  doc's "typ/farba" don't exist and are **not** invented here.
- History aggregation logic (shared-ŠPZ, `buildCarHistories`) is unchanged (spec 08).

### 1.4 Role gating (§9)

| Action | Prevádzka | Manager |
| --- | --- | --- |
| Search / view client · cars · history | ✅ | ✅ |
| + Nový zákazník | ✅ | ✅ |
| Nová rezervácia (from client) | ✅ | ✅ |
| + Pridať auto | ✅ | ✅ |
| Edit client (meno / telefón) | ❌ | ✅ |
| Upraviť / link car | ❌ | ✅ |
| Open an order's full page | ✅ | ✅ |

---

## 2. Design

### 2.1 Master-detail page (`app/clients/page.tsx` + `ClientsPage`)

- The page reads `searchParams.id`; when present, server-fetches `getClientWithHistory(id)`
  and renders `<ClientDetail>` in the detail pane. Layout: master list + detail,
  `flex-col` on mobile / `sm:flex-row` (or grid) side-by-side.
- `ClientSearchInput` + results list stay **client-side** (the existing debounced
  `searchClients` with the stale-response sequence guard). Clicking a result
  `router.push('/clients?id=' + clientId)` (keeps the search query in component state).
  Results **sorted by meno**; rows = `ClientCard` (meno + telefón).
- Empty query (<2 chars) → the blank prompt (existing copy "Zadajte aspoň 2 znaky.").
- **"+ Nový zákazník"** reuses the existing `CreateClientDialog`; on create, push
  `?id=<newId>` (all roles).

### 2.2 `/clients/[id]` redirect (keep!)

- `app/clients/[id]/page.tsx` becomes a thin **`redirect('/clients?id=' + id)`**. It stays
  because order detail, the wizard, and `revalidatePath('/clients/[id]')` all target it;
  deleting it would 404 those links and stale revalidation (UI-STRUCTURE §9).

### 2.3 Detail restructure (`ClientDetail`)

- **Klient blok** (card): meno + telefón as **call/SMS links** (`tel:` / `sms:`). Buttons:
  **Nová rezervácia** under the name (**all roles** → `/orders/new?clientId=` → wizard
  step 2; available even with no cars, since the wizard can add one), **+ Pridať auto**
  (all roles), **Upraviť klienta** (manager only).
- **Zoznam áut**: each car (ŠPZ · model · kategória) + **Upraviť auto** (manager only;
  reuses link/duplicate-ŠPZ confirm). A car with **no orders** shows **"Žiadne služby."**
- **Per-car block** — each vehicle is its **own grouped block** (`data-car-block`): a
  rounded, bordered card with an **alternating background tint** (`bg-muted/30` ↔
  `bg-muted/60`) and `space-y-3` between blocks, so it's immediately obvious which orders
  belong to which car. (Not one shared accordion list — distinct cards.)
- **Per-car accordion** (`CarRow`, shadcn `accordion`, **expanded by default** via
  `defaultValue={[car.id]}` — every car's visit list shows on open; the user can collapse
  any block): shows that car's order history. **Poradie** (1., 2., …) counted **per car**, shown next to the
  visit. Each `ServiceHistoryRow` (compact): dátum · čas od–do · poradie · služby (short) ·
  **stav** badge (`STATE_COLOR`/`STATE_LABEL` — retire the local `HISTORY_STATUS_BADGE`).
- **Expanded order**: a dropdown showing **Pracovníci** + **Poznámka** (+ box + total €).
- **Open full order**: the row links to `/orders/[id]` (spec 15 detailed surface).

### 2.4 Components (§9)

`ClientsPage` (orchestrator) → `ClientSearchInput`, `ClientCard` (×N), and `<ClientDetail>`
inline. `ClientDetail` → `ClientHeaderCard`, `CarRow` (×N accordion), `ServiceHistoryRow`
(×N). Detail data via `getClientWithHistory(id)`. Add shadcn **`accordion`** primitive.

### 2.5 Error handling & states

- `?id=` that doesn't resolve → an inline "Klient sa nenašiel" in the detail pane, master
  list still usable (no full-page error).
- Mutations keep `toast` + `router.refresh()`; refresh re-reads the `?id=` detail.

---

## 3. Tasks

1. **(S)** Add shadcn `accordion` primitive.
2. **(M)** `ClientsPage` master-detail layout; `searchParams.id` → `getClientWithHistory`;
   responsive master/detail panes. (dep: —)
3. **(M)** Client-side `ClientSearchInput` + `ClientCard` list (reuse debounced search);
   select → `?id=`; "+ Nový zákazník" → push `?id=`. (dep: 2)
4. **(L)** `ClientDetail` restructure: `ClientHeaderCard` (call/SMS, Nová rezervácia,
   +Pridať auto, Upraviť), `CarRow` accordion with Poradie, `ServiceHistoryRow` compact,
   expanded Pracovníci/Poznámka/box/€; use `STATE_COLOR`/`STATE_LABEL`. (dep: 1)
5. **(S)** `app/clients/[id]/page.tsx` → `redirect('/clients?id=' + id)`. (dep: 2)
6. **(M)** Tests: e2e (search → inline detail; `?id=` survives refresh/back; deep-link
   `/clients/[id]` redirects; accordion expands per-car history with Poradie; order row →
   `/orders/[id]`; role gating per §1.4) + unit (per-car Poradie numbering). (dep: 4, 5)

---

## 4. Acceptance criteria

### 4.1 Build, types, lint, tests

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build   # all exit 0
```

### 4.2 Master-detail + deep-link (must pass)

- Searching and clicking a result shows the detail **inline** (no navigation) and sets
  `?id=`; refreshing the `?id=` URL re-opens the same client; browser-back works.
- `/clients/<id>` **redirects** to `/clients?id=<id>` (route still exists).

```bash
# deep-link route kept (not deleted) and now redirects — expect: present + redirect
grep -rn "redirect(" "app/clients/[id]/page.tsx" | wc -l   # >= 1
```

### 4.3 Detail (e2e, must pass)

- Klient blok: Nová rezervácia (all roles) → wizard at step 2; +Pridať auto (all roles);
  Upraviť klienta only for manager; Upraviť auto only for manager.
- Per-car accordion expands to that car's history; **Poradie** numbered per car; a car with
  no orders shows "Žiadne služby."; an order row opens `/orders/[id]`.
- Status badges use the spec-13 palette (no leftover amber/sky/emerald local map).

```bash
# local history badge map retired — expect: 0
grep -rn "HISTORY_STATUS_BADGE" components/clients | wc -l
```

### 4.4 Manual checks

- [ ] Mobile: detail below the list; `sm:+`: side-by-side; usable at 360px.
- [ ] Results sorted by meno; rows show meno + telefón; blank prompt before searching.
- [ ] tel:/sms: links work; Slovak throughout.
