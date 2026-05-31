# UI Redesign Guide — make "Zemplín" look & build like this prototype

> **What this file is.** Implementation spec for the **Zemplín** project (summarised in
> [`zemplin-baseline.md`](./zemplin-baseline.md)). Goal: **restructure Zemplín's UI to
> match the navigation shell, component decomposition, conventions and visual theme of a
> reference prototype** (Autoumyváreň). UI copy stays **Slovak**.
>
> - **"Ours" / "this prototype"** = the model to copy.
> - **"Theirs" / "Zemplín"** = the app you are changing.
> - **`❓ ASK USER`** marks a decision to confirm with the user before building it; all
>   open questions are listed in **§13**.
> - **§15 (Appendix)** holds the canonical business rules, status colors, theme tokens and
>   SMS templates referenced throughout.

---

## 0. Key decisions

1. **Navigation:** Zemplín drops hub-and-spoke (`/menu`) and adopts our persistent
   **sidebar (desktop) + bottom nav (mobile)** shell.
2. **Redesign scope:** **structure *and* visual theme** — adopt our shell, component
   decomposition, SOLID/`lib` conventions, **and** our theme (Nova preset,
   `STAV_FARBY` colors, our fonts).
3. **Big components:** document the ideal decomposed tree, but **splitting is optional**.
4. **Order detail — two surfaces (sharing the same section cards):** a **popup Sheet**
   opened from the **calendar** (quick use), **and** a **full order page `/orders/[id]`**
   opened from the **client history** (detailed view — see §7, §9).
5. **Routes:** Zemplín **keeps its English routes** (`/orders`, `/clients`, `/staff`…).
6. **Sections:** Zemplín **keeps all its sections**, folded into our nav model.

### Calendar + navigation
7. **Nav split:** **PREVÁDZKA** (Kalendár, Nová rezervácia, Zákazníci) visible to all;
   **SPRÁVA** (staff, services, **hours+exceptions merged**, SMS, audit) **manager-only**,
   shown as a **burger (≡) icon + dropdown** on **both** desktop and mobile (mobile opens
   upward) — not a text list, not a routed hub.
8. **Calendar default view:** **Day**.
9. **Date control:** clickable date → **shadcn `Calendar` popover with month + year
   selectors** (replaces our quick-list dropdown).
10. **Box filter:** **mobile only**.
11. **Zákazníci + Klient merged:** `/clients` is a **master-detail** page (search →
    inline detail, URL `?id=`); the **`/clients/[id]` route is kept** as a deep-link that
    redirects — never deleted (§9).

### Roles & permissions
Two roles: **prevádzka** (operations — the shared account the on-shift workers all sign
in on) and **manažér** (manager) — real auth (Zemplín).
Canonical permission list; drives nav gating (§2: SPRÁVA = manager-only) and the
order-detail popup (§7).

- **Prevádzka can:** view calendar · create an order · assign a worker (self or other) ·
  mark **Hotová** · mark **Zaplatená** (no caveat) · view client history.
- **Manager only:** edit order data (services, car) · move an order's time slot
  ("Zmeniť čas") · delete / cancel an order · mark **Nedostavil sa** · add / edit the
  note · manage the service catalog · manage workers.

---

## 1. The target shell (replace hub-and-spoke with our shell)

Zemplín today has **no app shell** — a `/menu` hub page + a "Menu" link in the calendar
header. **Replace this** with our shell:

```
┌──────────────────────────────────────────────┐
│ Sidebar │            <main>                    │
│ (desktop│   max-w-7xl, padded container        │
│  240px) │   ── page content renders here ──    │
├─────────┴──────────────────────────────────────┤
│        BottomNav (mobile only)                  │
└──────────────────────────────────────────────┘
```

**Create (modeled on ours):**
- **Shell lives in the root `app/layout.tsx`** — **decided: no `(app)` route group.**
  Auth is at the Cloudflare edge (no in-app login route) and every page wants the shell,
  so a route group buys nothing here; reversible later if a non-shell page ever appears.
  The shell renders the nav **only when a staff identity resolves** — the 401/403
  full-screen views render chrome-less (no sidebar/bottom-nav).
  Keep our mobile niceties: `min-h-dvh`, `<main>` `min-w-0 overflow-x-hidden`, bottom
  padding for the nav + `env(safe-area-inset-bottom)`.
- `components/navigation/Sidebar.tsx` — desktop nav (240px).
- `components/navigation/BottomNav.tsx` — mobile bottom bar.
- `components/navigation/navItems.ts` — **single source of truth** for nav items.

**Remove / rework:** the `/menu` page and the calendar's "Menu" link become redundant.
Keep Zemplín's `auth/auth-error-views.tsx` (401/403 views).

---

## 2. Navigation — sidebar (desktop) + bottom nav with burger (mobile)

**PREVÁDZKA** items are visible to everyone. **SPRÁVA** is **manager-only** and shown as
a single **burger (≡) icon with a dropdown** — *not* a text list — on **both** desktop
and mobile. Prevádzka never sees the SPRÁVA burger.

### Desktop sidebar
Always visible (all roles):
```
PREVÁDZKA
  Kalendár            /
  Nová rezervácia     /orders/new
  Zákazníci           /clients
```
At the bottom, manager-only — a **SPRÁVA burger (≡) icon** (icon, no text label) that
opens a **dropdown**:
```
≡  (SPRÁVA)  ▸ dropdown
     Správa zamestnancov   /staff
     Katalóg služieb       /services
     Otváracie hodiny      /settings/hours   (incl. výnimky / sviatky — merged)
     SMS šablóny           /settings/sms-templates
     Záznam zmien          /audit
```

### Mobile bottom nav
```
[ Kalendár ] [ Nová rez. ] [ Zákazníci ] [ ≡ ]
                                           └─ manager-only burger icon; opens a
                                              dropdown UPWARD with the same SPRÁVA items
                                              (tap → go straight there, no hub page)
```
- Same pattern as desktop: a **burger (≡) icon → dropdown** (opens **upward** on mobile),
  not a routed `/menu` hub.
- Manager-only; the prevádzka bottom bar shows just the 3 core items.

### `navItems.ts` shape (data-driven, no hardcoded buttons)
```ts
interface NavItem {
  href: string
  label: string          // Slovak
  icon: LucideIcon
  managerOnly?: boolean   // SPRÁVA items → true (real auth: role === 'manazer')
  group: 'prevadzka' | 'sprava'
}
```
PREVÁDZKA → always shown (sidebar + mobile bottom bar). SPRÁVA → manager-only, collected
under the burger (≡) dropdown on both desktop and mobile.

> ❓ **ASK USER (nav, remaining):** which lucide icon for the SPRÁVA burger and for each
> item in the dropdown?

---

## 3. Adopt our visual theme (full reskin)

Replace Zemplín's look with ours:

| Concern | Zemplín now | → Our target |
|---|---|---|
| shadcn style | new-york / slate | **Nova preset** (`base-nova`) |
| Design tokens | oklch vars in `globals.css` | our token set |
| Fonts | (theirs) | **Plus Jakarta Sans** + **JetBrains Mono**, `display: swap` |
| Status colors | `STATUS_STYLE` in `lib/orders/colors.ts` | **`STAV_FARBY`** in `types/index.ts` |

**Status color remap** (semantics unchanged, palette changes):

| Status | Zemplín now | → Our `STAV_FARBY` |
|---|---|---|
| vytvorená | amber | **red** |
| hotová | sky | **orange** |
| zaplatená | emerald | **green** |
| nedostavil sa | zinc / struck | **gray** |

Adopt **one home** for status colors (`STAV_FARBY` in `types/index.ts`) and retire
`lib/orders/colors.ts`. Exact class values: **§15.B**.

**Updated decision:** **keep dark mode** — Zemplín has the dark plumbing wired, so the
reskin provides Nova **light + dark** tokens and `dark:` status-color variants. The
**activation mechanism (toggle vs follow-OS) is deferred** (decided later; no toggle built
in spec 13). **Keep sonner toasts** for action feedback (save, status change, delete,
resend SMS).

---

## 4. Calendar page — header & layout (`/`)

The home calendar is the entry point; everything else is reached from the nav.
**Default view: Day.** Header layout, **top → bottom**:

```
                       [+ Nová rezervácia] [! 3 nezaplatené] [Janko • MANAGER]  ← 1. actions, TOP, right-aligned
                             [ Deň | Týždeň ]                  ← 2. Day/Week switch, centered
                           ◀   22. máj 2026   ▶                ← 3. date (clickable → Calendar popover) + ◀▶
                                  DNES                          ← 4. today / "Späť na dnes"
 ● Vytvorená ● Hotová ● Zaplatená ● Nedostavil sa     ( Box 1 | Box 2 | Obe )
 └─ 5. Legenda — LEFT, directly above grid       6. Box filter — RIGHT, mobile only ─┘
──────────────────────────────────────────────────────────────────────────
                  grid: Box 1 | Box 2 (Day)  /  7 day columns (Week)
```

1. **Header actions** — **top of the page, right-aligned to the calendar's right edge**:
   "Nová rezervácia" button · overdue/unpaid badge (manager → `/unpaid`) · logged-in
   staff name + role badge.
2. **Day / Week switch** — Tabs, centered, below the actions. Applies to both views.
3. **Date** — large, centered, **clickable → shadcn `Calendar` popover** with
   **month + year selectors** (`captionLayout="dropdown"`). Flanked by ◀ ▶ to step one
   day/week. Week view shows the week range; day view shows the single date.
4. **Today state** (below the date) — if the view is today/this week, show **"DNES"**;
   otherwise a **button to jump back to today** ("Späť na dnes").
5. **Legenda** — **left side, directly above the grid**: Vytvorená (red) · Hotová
   (orange) · Zaplatená (green) · Nedostavil sa (gray). From `STAV_FARBY` (`StatusLegend`).
   On **mobile** use **shortened labels** to save width (not collapsed/hidden — still shown).
6. **Box filter** — **right side of the same row as the legend, MOBILE ONLY**: Box 1 /
   Box 2 / Obe. Desktop always shows both boxes side by side, so no filter there.

### Mobile layout of the header actions
On a narrow screen the actions stack:
```
[ Janko • MANAGER ] ............... [ ! 3 nezaplatené ]   ← role/staff left, unpaid badge right
[ + Nová rezervácia ]                                      ← below, full-width
```

### New vs. our current prototype
- **Date picker** is the main addition — **remove** our quick-list `NavDropdown` and use
  a shadcn `Calendar` popover (month/year dropdowns) as the **only** date control.
- **Box filter** is new and **mobile-only**.
- Day/Week toggle, ◀ ▶ nav, DNES pill, `StatusLegend`, status colors already exist in
  our prototype and are reused.

---

## 5. Component conventions to adopt (the "build like ours" part)

Apply our SOLID + React conventions. Essentials:

- **Orchestrators vs. leaf.** Only **page-level / orchestrator** components read data
  (Zemplín: server pages / Supabase queries). **Leaf components receive data via props**
  and never fetch.
- **Pure logic in `lib/`** — date/time, availability, conflict checks, totals, status
  transitions. No side effects; time passed as an argument.
- **Server Components by default**, `"use client"` only for state/effects/handlers.
- **No magic numbers in JSX** — constants (`SLOT_PX`, `DAY_START_HOUR`, `HOURS`…).
- **One component per file**, co-located by feature folder; PascalCase components.
- **shadcn primitives from `components/ui/`**; **no `any` / `@ts-ignore`**.

---

## 6. Target component trees (reference — splitting is optional)

### Calendar — `calendar/calendar.tsx` (~550 lines) → our tree
```
CalendarView                 ← orchestrator, Day/Week toggle (Tabs); keeps Realtime
├── (header)                 ← §4 layout: switch, date+picker, today, legenda, actions, box filter
├── DayView                  ← reads data for the day
│   ├── DayNav → Calendar popover (date), ◀▶, "Späť na dnes"
│   ├── StatusLegend
│   ├── TimeAxis              ← hour rail (left column)
│   ├── BoxColumn → { BoxHeader, BoxBody }
│   │   └── BookingBlock      ← absolutely-positioned status block
│   └── BookingDetailSheet    ← opens on block click (§7)
└── WeekView
    ├── WeekNav → Calendar popover, ◀▶
    ├── StatusLegend
    └── WeekDayColumn (×7) → WeekBookingBlock
```

### Order detail — `orders/order-detail.tsx` (~770 lines) → section cards
Rendered in **both** the popup Sheet (from calendar) and the `/orders/[id]` page (from
client history). Content order in §7:
```
BookingDetailSheet (popup; DetailSection wraps each card)
├── (title: Rezervácia · čas od–do · Box)
├── BookingStatusBadge        ← colored stav
├── BookingStatusActions      ← transitions + "Zmeniť čas" (deferred) + write audit
├── BookingClientCard         ← + link to /clients/[id]
├── BookingCarCard
├── BookingServicesList       ← add service = manager only
├── BookingWorkerCard         ← add / remove chips (all roles)
├── BookingNotes              ← edit = manager only
└── SmsStatusCard             ← SMS delivery log (2 types) + manager resend
```

### New reservation — `orders/booking-form.tsx` (~390) → wizard
```
BookingWizard → BookingStepper, steps/Step1Client…Step4TimeSlot, WizardActions
```

### Clients — `client-search.tsx` (~190), `client-detail.tsx` (~516)
```
ClientList → ClientSearchInput, ClientCard
ClientDetail → CarRow (×N), ServiceHistoryRow (×N)
```

### Keep-as-sections (apply conventions, no prescribed split)
`services-manager` + `service-editor`, `staff-manager` + `worker-manager`,
`opening-hours-editor` / `day-overrides-editor` / `sms-templates-editor`,
`audit-view`, `unpaid-list` + `unpaid-badge`.

---

## 7. Order detail — popup (quick) + full page (detailed)

Order detail has **two surfaces sharing the same section cards**:
- **Popup Sheet** — opened by **clicking an order in the calendar** (bottom sheet on
  mobile, side sheet on desktop). For **quick** use.
- **Full page `/orders/[id]`** — opened from the **client history** (§9) by clicking an
  order. The **detailed** view.

The content below (top → bottom) applies to **both**.

### Content, top → bottom
1. **Title** — `Rezervácia` · time **od–do** · **Box** (1/2).
2. **Stav** — current status, **colored** badge (`STAV_FARBY`).
3. **Akcie (manager only)** — one row: **Zmeniť čas** on the **left edge**,
   **Zmazať / Zrušiť** on the **right edge** (space between them).
   - *Zmeniť čas* — deferred / complicated; will later route into a new-reservation-style
     flow with the calendar slot picker. Present but disabled for now.
   - *Zmazať* — deletes / cancels the order (manager only; allowed before ZAPLATENA, rule #5).
4. **Klient** — name + info, **link to their history** (`/clients/[id]`).
5. **Auto** — car info (model, ŠPZ, typ, farba).
6. **Služby** — list of services + totals; **add a service** (manager only — already
   working in Zemplín).
7. **Pracovníci** — assigned workers as chips; **add / remove** (allowed for everyone).
8. **Poznámka** — the note; **edit button** (manager only).
9. **SMS** — bordered card with the SMS delivery log (full spec below).
10. **Bottom — status actions** — buttons to advance the status, plus **Nedostavil sa**
    (manager only).

### Role gating inside the popup (see §0 permissions)
| Element | Prevádzka | Manager |
|---|---|---|
| Mark **Hotová** (VYTVORENA→HOTOVA) | ✅ | ✅ |
| Mark **Zaplatená** (HOTOVA→ZAPLATENA) | ✅ | ✅ |
| Add / remove **workers** | ✅ | ✅ |
| **Klient** history link | ✅ | ✅ |
| **Zmeniť čas** (move slot) | ❌ | ✅ (deferred) |
| Edit **služby** / **auto** | ❌ | ✅ |
| Edit **poznámka** | ❌ | ✅ |
| Mark **Nedostavil sa** | ❌ | ✅ |
| **Delete / cancel** order | ❌ | ✅ (before ZAPLATENA, rule #5) |

> Prevádzka sees **read-only** versions of manager-only elements (no edit buttons), not
> hidden sections — they still need to *see* the car, services, and note.

### SMS card (`SmsStatusCard`)
A **bordered card titled "SMS"** — a **read-only delivery log** of the two automated
SMS types (business rule #8). Empty state: **"Žiadne SMS pre túto objednávku."**

Each SMS row shows:
- **Typ** (`SMS_TYPE_LABEL`) — one of two:
  - **Pripomienka** — the 30-min-before reminder.
  - **Auto je pripravené** — sent when the order is marked **Hotová**.
- **Stav** badge (`STATUS_LABEL`):
  - **Odosiela sa** — pending (gray)
  - **Odoslané** (sent) / **Doručené** (delivered) — default
  - **Zlyhalo** — failed (destructive / red)
- **Čas** — `created_at`, formatted `sk-SK`.
- **Text** — the SMS body (truncated).
- **Chyba** — error text in red if the send failed (failed sends stay visible).
- **"Poslať znova"** (resend) — **manager only** (`canResend={isManager}`); prevádzka sees
  the row but no resend button.

Components: reused from §6 (`BookingStatusBadge`, `BookingStatusActions`,
`BookingClientCard`, `BookingCarCard`, `BookingServicesList`, `BookingWorkerCard`,
`BookingNotes`) plus a new **`SmsStatusCard`**.

---

## 8. Nová rezervácia — wizard (`/orders/new`)

A **4-step wizard** (our model), available to **all roles** (prevádzka can create orders).
Order: **Klient → Auto → Služby → Termín**. Chrome: `BookingStepper` (4-step progress)
+ `WizardActions` (Späť / Ďalej, final **"Vytvoriť rezerváciu"**).

### Steps
**1. Klient** (`Step1Client`)
- **Fuzzy search** by phone / name (telefón = unique client key, rule #1) — already
  fuzzy in the app; keep it. Matches an existing client as you type, or
  **"Pridať nového zákazníka"** via a Dialog (meno + telefón). Duplicate-phone check is
  a backend concern (Phase 2 TODO).

**2. Auto** (`Step2Car`)
- Pick one of the client's existing cars, or **"+ nové auto"** (ŠPZ, model, typ, farba).

**3. Služby** (`Step3Services`)
- Checkbox list of **active** services (from the Katalóg služieb). Running summary of
  **total minutes + €**. The total duration sets the slot length used in step 4.

**4. Termín** (`Step4TimeSlot`) — **quick slots + full picker**, with a header that
**mirrors the calendar (§4)**:
- **Deň / 3 dni switch** on top.
- **Date** below it — **clickable → shadcn `Calendar` popover** (month + year),
  flanked by ◀ ▶. Same control as §4.
- **"Dnes" / "Späť na dnes"** below the date, for **both** views (Deň and 3 dni).
- **Today is highlighted** with a **gray box** in the day blocks (as in our prototype).
- **Quick slots:** nearest free slots **per box** (Box 1 / Box 2) as one-tap buttons.
- **Full picker** below: slot picker for the chosen view with the past-time
  ("MINULOSŤ") overlay; free ranges computed from existing orders.
- **Box is implicit** — set by which box's slot you pick.
- Enforces **no box+time overlap** (rule #2); slot length = sum of service durations.

### Entry points (confirmed)
| From | Behaviour |
|---|---|
| **Nav "Nová rezervácia"** | blank wizard at step 1 |
| **Calendar "+" button** (header) | **blank** wizard (not prefilled with the viewed day) |
| **Client detail page** | client prefilled → **skips step 1, starts at step 2 (Auto)** |

> *Not* selected: starting from an empty calendar slot — grid cells are **not**
> clickable entry points for now (can revisit later).

### After creating
Success toast, then return to the calendar with the new order visible.

> ❓ **ASK USER (wizard):** new client / new car created here aren't persisted yet
> (Phase 2) — confirm intended behaviour once the backend exists.

---

## 9. Zákazníci + Klient — merged master-detail (`/clients`)

**Merged:** the search/list page and the client detail are **one master-detail page**,
to cut a step — **search → click → detail appears inline** (no page load). The dedicated
`/clients/[id]` route is **kept** as a thin deep-link entry (see below).

### Master-detail layout
- **Fuzzy search** (by meno / telefón) + a results list of `ClientCard` rows showing
  **meno + telefón only** (for now).
- **Before searching:** a **blank "type to search" prompt** (no list shown yet).
- Results **sorted alphabetically** by meno.
- **"+ Nový zákazník"** button on this page — **all roles** can create a client.
- Selecting a result loads the client via `getClientWithHistory(id)` and renders
  **`<ClientDetail>` inline** — **below the list on mobile, side-by-side on `sm:+`**.
- Selection is reflected in the URL as **`/clients?id=…`** (searchParams) so refresh,
  browser-back, and bookmarking work.

### The inline detail (`<ClientDetail>`), top → bottom
1. **Klient blok** (card) — meno + telefón (call / SMS links). Buttons:
   - **Nová rezervácia** — **under the name**; **all roles** (starts the wizard at step 2).
   - **+ Pridať auto** — **all roles** (prevádzka may add a car).
   - **Upraviť klienta** — **manager only**.
2. **Zoznam áut** — each car listed (model, ŠPZ, typ, farba) with an **Upraviť auto**
   button (**manager only** — editing/removing a car stays manager-only). A car with
   **no orders yet** shows **"Žiadne služby"**.
3. **Per-car dropdown (accordion)** — expands to that car's order history. **Poradie**
   (1st / 4th…) is counted **per car** and shown **next to the name**. Each order
   **row (compact):** dátum · čas od–do · poradie · služby (short) · **stav** badge.
4. **Inside an expanded order** — a dropdown for **Pracovníci** and the **Poznámka**
   (plus box + total € — **expanded only**).
5. **Open full order** — clicking the order row (or a button) **redirects to the full
   order page** `/orders/[id]` (§7, detailed view). *The calendar popup is for quick
   use; this page is the full view.*

### Keep the `/clients/[id]` deep-link route
`app/clients/[id]/page.tsx` **stays**, but just **redirects to `/clients?id=<id>`** (or
renders the same merged view). **Do not delete it** — it's a deep-link target the rest of
the app relies on:
- order detail → client link, booking form → client link
- `revalidatePath("/clients/[id]")` after car/client edits
Deleting it would 404 those links and stale the revalidation.

### Components
`ClientsPage` (master-detail orchestrator) → `ClientSearchInput`, `ClientCard` (×N
results), and the self-contained **`<ClientDetail>`** rendered inline. Detail data via
`getClientWithHistory(id)`. `ClientDetail` → `ClientHeaderCard`, `CarRow` (×N accordion),
`ServiceHistoryRow` (×N).

### Role gating (see §0 permissions)
| Action | Prevádzka | Manager |
|---|---|---|
| Search / view client · cars · history | ✅ | ✅ |
| **+ Nový zákazník** | ✅ | ✅ |
| **Nová rezervácia** (from client) | ✅ | ✅ |
| **+ Pridať auto** (add a car) | ✅ | ✅ |
| Edit client (meno / telefón) | ❌ | ✅ |
| Upraviť / remove car | ❌ | ✅ |
| Open an order's full page | ✅ | ✅ |

**Confirmed:** search-result rows show **meno + telefón** only (for now).

---

## 10. SPRÁVA sections (manager-only admin)

All manager-only, reached via the SPRÁVA burger (§2). **General rule: keep the app's
current screens, restyle to our theme + fonts** (§3, §5) with small adjustments only —
plus the specific changes below. **Every page uses the shell** (sidebar on desktop,
bottom nav on mobile).

### Katalóg služieb (`/services`, `/services/[id]`)
- Keep as-is functionally; **update fonts + minor adjustments**.
- **New:** split services into **two separate blocks — "Hlavné služby" and "Doplnkové
  služby"** — each an **expandable dropdown (accordion)**.
- Soft-delete only (rule #7).

### Správa zamestnancov (`/staff`)
- Keep as-is; **update fonts + slight adjustments**. (Staff accounts + workers.)

### Otváracie hodiny + Výnimky — **merged** (`/settings/hours`)
- **Merge** opening-hours and exceptions into **one page**: **opening hours on top**,
  **holidays / day exceptions (sviatky) below**. Restyle.
- Drives the calendar grid (§4). The old `/settings/exceptions` route is folded in —
  redirect to `/settings/hours` if it was deep-linked, otherwise removed.

### SMS šablóny (`/settings/sms-templates`)
- Keep as-is; **restyle**. (70-char Slovak-diacritics limit — §13.)

### Záznam zmien (`/audit`)
- Keep as-is; **restyle** and **add pagination**.

> ❓ **ASK USER (SPRÁVA):**
> - Merged hours+exceptions — nav label "Otváracie hodiny" (assumed) or "Otváracie
>   hodiny a výnimky"? Keep route `/settings/hours`?
> - Audit pagination — page size, and numbered pages vs "load more"?

---

## 11. Section-by-section route map (Zemplín → restructured)

Routes stay English; the shell lives in the root layout (no `(app)` group). UI copy stays Slovak.

| Area | Route | Nav home | Notes |
|---|---|---|---|
| Calendar (home) | `/` | PREVÁDZKA | §4 header; keep Realtime |
| Menu hub | `/menu` | **removed** | replaced by sidebar/bottom-nav |
| New reservation | `/orders/new` | PREVÁDZKA | → `BookingWizard` |
| Order detail | **popup** (calendar) **+ `/orders/[id]`** (history) | calendar / client history | §7; shared cards |
| Clients | `/clients` (master-detail, `?id=`) | PREVÁDZKA | §9; merged search + inline detail |
| Client deep-link | `/clients/[id]` | — | **kept**; redirects to `/clients?id=<id>` |
| Staff / workers | `/staff` | SPRÁVA | "Správa zamestnancov" |
| Services | `/services`, `/services/[id]` | SPRÁVA | §10; Hlavné + Doplnkové blocks; soft-delete (rule #7) |
| Hours + exceptions | `/settings/hours` | SPRÁVA | §10; **merged** (hours top, výnimky below); drives grid |
| Exceptions (old) | `/settings/exceptions` | — | **folded into `/settings/hours`** (redirect if deep-linked) |
| SMS templates | `/settings/sms-templates` | SPRÁVA | §10; "SMS šablóny"; 70-char limit |
| Audit | `/audit` | SPRÁVA | §10; "Záznam zmien" + **pagination** |
| Unpaid | `/unpaid` | (badge in calendar header, manager) | "Nezaplatené" — **keep the app's current behaviour for now** |

> ❓ **ASK USER:** settings now = merged hours+exceptions + SMS templates as separate
> SPRÁVA items — fine, or collapse further into one tabbed "Nastavenia" page? (deferred, §13)

---

## 12. Folder layout after restructure (target)

| Layer | Folder | Rule |
|---|---|---|
| Routes / pages | `app/…` (root layout holds the shell; **no `(app)` group**) | Thin; render one orchestrator. English folders. |
| Feature UI | `components/<area>/` | `calendar, orders, clients, staff, services, settings, audit, unpaid, navigation` |
| Primitives | `components/ui/` | shadcn (Nova preset) — don't hand-edit |
| Pure logic | `lib/` | date/time, availability, totals, status — no side effects |
| Data | (Zemplín's server/Supabase layer) | only orchestrators read it; leaf via props |
| Types | `types/…` | status labels + `STAV_FARBY`; no inline types |

> ❓ **ASK USER:** match our `components/booking/` or keep their `components/orders/`?

---

## 13. Open questions (confirm with the user before building)

**Nav (remaining)**
- [ ] Lucide icons for the SPRÁVA burger and each dropdown item.

**SPRÁVA sections**
- [ ] Merged hours+exceptions — nav label "Otváracie hodiny" vs "…a výnimky"; keep `/settings/hours`?
- [ ] Audit pagination — page size; numbered pages vs "load more"?

**Components / structure**
- [ ] Split the calendar + order-detail monoliths now, or refactor later?
- [ ] Folder name `booking` vs `orders`?

**Decide later (explicitly deferred)**
- [ ] Full order page `/orders/[id]` — same cards as the popup, or show more? (decide later)
- [ ] Settings: three routes vs. one tabbed "Nastavenia" page? (decide later)
- [ ] **Nezaplatené: keep the app's current behaviour for now** — revisit later.

**Sections (later steps)**
- [ ] Enforce 70-char SMS limit in the template editor?

---

## 14. Implementation notes

1. **You're editing Zemplín**, using *this* prototype as the reference — map component
   names to Zemplín's own files (§15.E).
2. **Honor `❓ ASK USER` markers** — confirm those with the user before building them (§13).
3. **Suggested order:** shell (§1–§2) → theme (§3) + calendar page (§4) →
   conventions / refactors (§5–§8). Biggest visible change, lowest risk, first.
4. **Reuse before creating**; keep the day/week blocks in sync (shared components).

---

## 15. Appendix — self-contained reference

So this file can be handed to the other project **on its own**. Everything the rest of
the doc cites by name or number is spelled out here.

### A. Business rules (referenced as "rule #N")
1. **Telefón** is the unique client key — never duplicate.
2. **No conflict:** same box + overlapping time = forbidden.
3. **Status only moves forward:** `VYTVORENA → HOTOVA → ZAPLATENA`.
4. **NEDOSTAVIL_SA** can be set by **manager only**.
5. **Delete an order:** **manager only**, and only **before ZAPLATENA**.
6. **Edit the note (poznámka):** **manager only**; prevádzka read-only.
7. **Services are never hard-deleted** — soft delete (`aktivna: false`).
8. **Auto-SMS:** 30 min before the slot (reminder) and on `VYTVORENA → HOTOVA`
   ("auto je pripravené").

### B. Status model + exact colors
Statuses: `VYTVORENA | HOTOVA | ZAPLATENA | NEDOSTAVIL_SA`.

Labels (`STAV_LABEL`): Vytvorená · Hotová · Zaplatená · Nedostavil sa.

Colors (`STAV_FARBY`, Tailwind classes — this is the **target** palette to reskin onto):
```ts
VYTVORENA:     { bg: 'bg-red-100',    border: 'border-red-500',    text: 'text-red-700',    badge: 'bg-red-500'    }
HOTOVA:        { bg: 'bg-orange-100', border: 'border-orange-500', text: 'text-orange-700', badge: 'bg-orange-500' }
ZAPLATENA:     { bg: 'bg-green-100',  border: 'border-green-500',  text: 'text-green-700',  badge: 'bg-green-500'  }
NEDOSTAVIL_SA: { bg: 'bg-gray-100',   border: 'border-gray-400',   text: 'text-gray-600',   badge: 'bg-gray-400'   }
```
Keep these in **one place** (e.g. `types/index.ts`) and retire Zemplín's
`lib/orders/colors.ts`.

### C. Theme tokens (the "Nova preset" reskin)
- **shadcn style:** `base-nova` · **baseColor:** `neutral` · **icons:** `lucide` · RSC on.
  (`components.json` → `"style": "base-nova"`.)
- **Fonts (`next/font/google`, `display: swap`):**
  - Sans: **Plus Jakarta Sans** → `--font-sans`
  - Mono: **JetBrains Mono** → `--font-mono`
- **Toasts:** sonner (kept). **Dark mode:** **kept** (light + dark Nova tokens; activation
  toggle-vs-system deferred).

### D. SMS templates (≤ 70 chars incl. Slovak diacritics)
- **Pripomienka:** „Pripomíname Vašu rezerváciu v autoumyvárni o {čas}. Tešíme sa na Vás!"
- **Hotové:** „Vaše auto je pripravené na vyzdvihnutie. Ďakujeme!"

### E. How to read the component names
Names like `BookingDetailSheet`, `CalendarView`, `BoxColumn`, `ClientDetail`,
`BookingWizard` are **this-prototype references** — the model to copy. Map each onto
**Zemplín's own component** (e.g. `order-detail.tsx`, `calendar.tsx`, `client-detail.tsx`,
`booking-form.tsx`). You are restyling/restructuring Zemplín's existing code, not importing
this repo's files.
