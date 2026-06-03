# Spec 15 — Order detail: popup Sheet + full page + shared cards

> **Status:** done · **PRD refs:** §6 (lifecycle), §7 (notes), §8 (SMS log), §9.3, §11 ·
> **Depends on:** spec 13 (theme), spec 14 (calendar blocks) ·
> **UI-redesign refs:** `../UI-STRUCTURE.md` §7 (order detail — two surfaces), §6 (tree) ·
> **Baseline refs:** `../zemplin-baseline.md` (order-detail.tsx ~770 lines)

Give order detail **two surfaces that share one set of section cards**: a **popup Sheet**
opened from a calendar block (quick use) and the existing **`/orders/[id]` page** (opened
from client history — detailed use). Reorder the cards to `UI-STRUCTURE.md` §7. Almost all
logic already exists and is correct — this spec **extracts** the in-file sections into
shared, one-per-file card components and **adds the Sheet**; it does **not** rebuild the
actions.

> **Folder decision:** keep **`components/orders/`** (not `components/booking/`). Routes are
> already `/orders` (`UI-STRUCTURE.md` §0.5) and a rename churns imports for no gain. The
> §6 `Booking*` names map onto files under `components/orders/`. *Confirm in review.*

---

## 1. Requirements

### 1.1 What this feature does

1. Extract the section components currently inline in `order-detail.tsx` into **shared,
   one-per-file cards** under `components/orders/sections/`, rendered by **both** surfaces.
2. Add a **popup Sheet** (`BookingDetailSheet`) — **side sheet on desktop, bottom sheet on
   mobile** — opened by clicking a **calendar block** (spec 14 left the block as a `Link`).
3. Keep the **full `/orders/[id]` page** (opened from client history, spec 17) rendering
   the same cards.
4. **Card order:** Stav badge + meta (Box · čas · dátum) → Akcie (manager: Zmeniť čas left /
   Zmazať right) → **Klient + Auto side by side** (`sm:grid-cols-2`, stacked on mobile) →
   **História klienta** → Poznámka → Pracovníci → Služby → SMS → bottom status actions
   (Stav, + Nedostavil sa manager).
5. Feed the Sheet via a single **client-callable bundle action** returning everything the
   cards need (`getOrderDetailBundle` — detail + workers + services + SMS + `recentVisits`).
6. **História klienta box:** the client's **last 3 other visits** (newest-first, excludes the
   current order + cancelled), via the lightweight `getRecentClientVisits({ clientId,
   excludeOrderId, limit })` action — each row (dátum · auto · služby · stav) **links to that
   order**; a **"Celá história →"** link opens `/clients?id=`. Empty state "Žiadne predošlé
   návštevy." Read-only, both roles.

### 1.2 User stories (UI-STRUCTURE §7)

- As staff, I click an order in the calendar and a **Sheet** slides in with the full order
  — status, client, car, services, workers, note, SMS — without leaving the calendar.
- As staff, from a client's history I open the **full page** for the same detail.
- As prevádzka, I see **read-only** versions of manager-only controls (note, services, car,
  Zmeniť čas, delete, Nedostavil sa) — but I can still advance status and add/remove workers.

### 1.3 Non-goals

- **No change to the order Server Actions or their authz** — `setStatus`, `setNote`,
  `addOrderService`, `moveOrder`, `deleteOrder`, `resendSms`, worker add/remove, per-line
  paid all stay as-is (specs 06/07). This is presentation + composition only.
- **No new SMS features** — the existing delivery log (`SmsSection`) is renamed
  `SmsStatusCard`; behavior unchanged.
- No "Zmeniť čas → calendar slot picker" rework — see §2.5.

---

## 2. Design

### 2.1 Shared cards (extract, one per file)

Move each existing inline section into `components/orders/sections/`, props-only leaves
(no data fetching), reused by both surfaces. Map to §6 names:

| New file | From (today) | Edit gating |
| --- | --- | --- |
| `BookingStatusBadge` | header `Badge` | — |
| `BookingStatusActions` | "Stav" section buttons | advance: all; Nedostavil sa: manager |
| `BookingClientCard` | Klient block + history link | — |
| `BookingCarCard` | Auto block | — |
| `BookingServicesList` | `ServicesSection` | add/remove/paid: manager |
| `BookingWorkerCard` | `WorkersSection` | add/remove: all roles |
| `BookingNotes` | `NoteSection` | edit: manager |
| `SmsStatusCard` | `SmsSection` | resend: manager |
| `ChangeTimeDialog` | `MoveDialog` | manager |
| `DeleteOrderDialog` | `DeleteDialog` | manager (before zaplatena) |

Mutations stay where they are (parent passes the same `call(...)` callbacks). The cards
already implement the read-only-vs-editable split via a `canEdit`/role prop — preserve it.

### 2.2 Shared body — `OrderDetailBody`

A single component rendering the cards in the order above (§1.1 #4), given
`{ role, detail, allWorkers, services, sms, recentVisits, onRefresh }`. Both surfaces render
`<OrderDetailBody/>`:

- **`OrderDetailView`** (page) wraps it with the page title/back-link.
- **`BookingDetailSheet`** wraps it in a `Sheet` body with the §7 title row
  (`Rezervácia · {od}–{do} · Box {n}`).

Reordering vs. today: **Akcie (Zmeniť čas / Zmazať)** moves to **just under the status
badge** (was bottom); **status-advance buttons** move to the **bottom** (was mid); note
moves below services/workers. Same components, new order. **This order is fixed** — later
refinements adjust spacing only, not the sequence.

Spacing/readability: sections use `space-y-5`, each card `p-4`, with section labels
`mb-1 tracking-wide`; long values (client name/phone, ŠPZ/model, notes) `break-words`
(notes also `whitespace-pre-wrap`) so they wrap inside the card instead of overflowing.

### 2.3 The Sheet (`BookingDetailSheet`)

- Add shadcn **`sheet`** primitive (not installed).
- **Responsive side:** bottom sheet on mobile, right side-sheet on `sm:+` (`side` chosen via
  a small `useMediaQuery`; bottom-on-mobile is the requirement).
- **Desktop width & height:** a **comfortable reading width** of ~450–600px —
  `sm:max-w-lg` (512px) widening to `xl:max-w-xl` (576px) — and **full height**
  (`sm:max-h-none`, no `90dvh` cap, which otherwise cut the panel off). It never covers the
  whole screen. The mobile bottom sheet keeps `max-h-[90dvh]`.
- Opened from `BookingBlock` (calendar): the block becomes a button that sets the selected
  order id and opens the Sheet (replacing the spec-14 `Link`). The **full page** stays the
  client-history entry point.

### 2.4 Data — one client-callable bundle action

The page loads `getOrder` + worker list + `listServices` + `getOrderSms` server-side. Add
**`getOrderDetailBundle({ id })`** in `lib/actions/orders.ts` returning
`{ detail, allWorkers, services, sms }` (composing the existing reads), callable from the
Sheet on open. The `/orders/[id]` page may switch to it too (single source). Role comes
from the calendar's existing `role` prop (no extra fetch).

### 2.5 "Zmeniť čas" — interim move, upgraded by spec 16

The target behavior (confirmed): **Zmeniť čas opens the wizard** prefilled (client/car/
services), starting at the services/termín steps so the manager can adjust services **and**
pick a new slot in the interactive calendar — see **spec 16 §2.9** (it owns the wizard edit
mode and **repoints this button**).

In **this** spec, ship Zmeniť čas as the **existing working `MoveDialog`** (relabeled
`ChangeTimeDialog`, manager-only) so order-detail is self-contained and `main` stays
releasable before spec 16 lands. Spec 16 then replaces the dialog with the wizard edit
flow. (Don't disable it — Zemplín's move already works.)

### 2.6 Note styling

`BookingNotes` keeps its **prominent** treatment (it must stand out — PRD §7), restyled to
the spec-13 tokens (a neutral/accent emphasis rather than the old amber if amber clashes
with the new palette). Workers see it read-only.

### 2.7 Error handling & states

- Sheet open while the bundle loads → a small skeleton/spinner inside the Sheet; load
  failure → inline Slovak error + a retry, Sheet stays open.
- All mutations keep the existing `toast` + `router.refresh()` flow; in the Sheet,
  `refresh()` also keeps the calendar (Realtime) in sync.

---

## 3. Tasks

1. **(S)** Add shadcn `sheet` primitive. (dep: —)
2. **(L)** Extract the §2.1 cards into `components/orders/sections/` (one per file);
   `order-detail.tsx` imports them. Behavior identical. (dep: —)
3. **(M)** `OrderDetailBody` rendering cards in §7 order; `OrderDetailView` (page) wraps
   it. (dep: 2)
4. **(M)** `getOrderDetailBundle({ id })` action (compose existing reads). (dep: —)
5. **(M)** `BookingDetailSheet` (responsive side) rendering `OrderDetailBody` from the
   bundle; loading/error states. (dep: 3, 4)
6. **(M)** Wire `BookingBlock` → open Sheet (replace the spec-14 `Link`); pass `role`.
   (dep: 5)
7. **(S)** Relabel MoveDialog → "Zmeniť čas" (`ChangeTimeDialog`), keep functional. (dep: 2)
8. **(M)** Tests: e2e (block opens Sheet with all cards in §7 order; advance status from
   Sheet; add/remove worker as prevádzka; manager-only controls hidden for prevádzka;
   SmsStatusCard empty state + resend manager-only; full page renders same cards). (dep: 6)

---

## 4. Acceptance criteria

### 4.1 Build, types, lint, tests

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build   # all exit 0
```

### 4.2 Shared cards (must pass)

```bash
# sections extracted to their own files — expect: the 8 card files exist
ls components/orders/sections/ | wc -l        # >= 8
# both surfaces render the shared body — expect: 2 importers
grep -rln "OrderDetailBody" components app | wc -l   # >= 2
```

### 4.3 Two surfaces (e2e, must pass)

- Clicking a calendar block opens a **Sheet** (bottom on mobile, right on desktop) showing
  the cards in **§7 order**; closing it returns to the calendar.
- `/orders/[id]` renders the **same** cards (from client history).
- Advancing status and adding/removing a worker work **from the Sheet** and reflect on the
  calendar (Realtime).

### 4.4 Role gating (e2e, must pass)

- prevádzka: no Zmeniť čas / Zmazať / Nedostavil sa / note-edit / service-edit / resend;
  **can** advance Hotová/Zaplatená and add/remove workers.
- manager: all of the above present; delete disabled once `zaplatena`.

### 4.5 SMS card (must pass)

- Empty state "Žiadne SMS pre túto objednávku."; failed sends stay visible with the error;
  "Poslať znova" only for manager.

### 4.6 Manual checks

- [ ] Sheet usable at 360px (bottom sheet, scrolls, no clipped actions).
- [ ] §7 order exactly: Stav → Akcie → Klient → Auto → Služby → Pracovníci → Poznámka →
      SMS → status actions.
- [ ] Note stands out; Slovak throughout; status colors from `STATE_COLOR`.
