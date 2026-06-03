# Spec 12 — App shell & navigation (sidebar + bottom nav)

> **Status:** draft · **PRD refs:** §3 (roles & permissions) ·
> **Depends on:** spec 01 (edge auth, `getCurrentStaff`, role gating, 401/403 views) ·
> **UI-redesign refs:** `docs/UI-STRUCTURE.md` §0 (key decisions), §1 (target shell),
> §2 (navigation), §11 (route map), §12 (folder layout) ·
> **Baseline refs:** `docs/zemplin-baseline.md` (current hub-and-spoke nav, per-page containers)

First slice of the UI redesign. Replaces Zemplín's hub-and-spoke navigation
(`/menu` + a "Menu" link) with a **persistent app shell**: a desktop **sidebar**
and a mobile **bottom nav**, with the manager-only **SPRÁVA** admin cluster behind a
**burger (≡) dropdown**. This is **structure only** — no theme/reskin (spec 13), no
page-content changes beyond reconciling each page's outer container with the new shell.

---

## 1. Requirements

### 1.1 What this feature does

1. Introduce a **persistent app shell** that wraps every page: a **240px sidebar** on
   desktop (`md:+`) and a **bottom nav** on mobile, replacing the `/menu` hub.
2. Drive navigation from a **single data source** (`components/navigation/navItems.ts`)
   — no hardcoded nav buttons.
3. Show the **PREVÁDZKA** items (Kalendár, Nová rezervácia, Zákazníci) to **all roles**.
4. Collect the **SPRÁVA** items (staff, services, hours, SMS templates, audit) behind a
   **manager-only burger (≡ — `Settings` icon) → dropdown**, on both desktop (in the
   sidebar) and mobile (in the bottom nav, opening **upward**). `prevadzka` never sees it.
5. Render the shell **chrome-less** (no sidebar/bottom-nav) when no active staff identity
   resolves — so the 401/403 views stay full-screen.
6. **Reconcile every existing page** with the shell: remove each page's own `<main>` +
   outer container/padding (the shell now owns `<main>`), keeping any intentional inner
   content width.
7. **Remove** the `/menu` hub page and the calendar header's "Menu" link.
8. Surface the manager **overdue-unpaid badge** in the **desktop sidebar** (above SPRÁVA),
   since the calendar header is mobile-only (spec 14 §2.6).

### 1.2 User stories (from PRD §3, UI-STRUCTURE §0/§2)

- As **either role**, I see a persistent nav (sidebar on desktop, bottom bar on phone)
  and can reach Kalendár, Nová rezervácia, and Zákazníci from anywhere in one tap.
- As the **manager**, I additionally see a **SPRÁVA (≡)** burger that drops down to the
  admin sections (staff, services, hours, SMS templates, audit).
- As **prevádzka** (the shared on-shift account), I never see the SPRÁVA burger and my
  bottom bar shows only the three core items.

### 1.3 Non-goals

- **No reskin** — fonts, Nova preset, status-color remap are **spec 13**. Build the shell
  with the current primitives/tokens; it inherits the new tokens when 13 lands.
- **No page-content redesign** — calendar header (spec 14), order detail (15), wizard
  (16), clients master-detail (17), SPRÁVA section restyles (18) are later. This spec only
  *reconciles each page's outer container* with the shell; inner content is untouched.
- **No new routes** beyond deleting `/menu`. Route map (UI-STRUCTURE §11) is realized
  incrementally by later specs.
- **No `app/(app)` route group** — decided: the shell lives in the **root layout**
  (UI-STRUCTURE §1). Auth is at the Cloudflare edge (no in-app login route) and every page
  wants the shell, so a route group buys nothing; reversible later if a non-shell page
  ever appears.

---

## 2. Design

### 2.1 Shell ownership — server component, dumb root layout

- Keep **`app/layout.tsx` dumb**: `<html lang="sk">` / `<body>` / `<Toaster />`, wrapping
  children in a single `<AppShell>`:
  ```tsx
  <body className="min-h-dvh antialiased">
    <AppShell>{children}</AppShell>
    <Toaster />
  </body>
  ```
- **`components/navigation/AppShell.tsx`** is a **server component**. It resolves the
  current actor and decides chrome:
  - Call `getCurrentStaff()` inside a `try/catch`.
  - **On success** → render the full shell: `<Sidebar role staffName unpaidCount realtimeJwt
    />` (desktop), `<main>` with the page, and `<BottomNav role />` (mobile). `role` drives
    SPRÁVA visibility (manager-only). For managers it also mints the Realtime JWT
    (`mintRealtimeToken(getIdentity())`) + `getUnpaidCount()` for the sidebar `UnpaidBadge`.
  - **On throw** (`Unauthenticated`/`Forbidden` — authenticated by Cloudflare but not a
    provisioned active staff row) → render a **bare passthrough**: just `{children}`, no
    sidebar/bottom-nav, so the page's own 401/403 view fills the screen.
- The **shell owns the only `<main>`**, rendered **full-width with no `max-w` cap** so
  wide content (the calendar) can fill the space; pages that should stay narrow set their
  own `mx-auto max-w-*` (every page except the calendar does). Side gutter `mx-auto md:mx-10`
  (centered on mobile, 40px margins on desktop), padding `p-3 sm:px-4 sm:pt-4` (kept tight),
  `min-w-0 overflow-x-hidden`, plus bottom padding for the mobile nav +
  `env(safe-area-inset-bottom)`. Desktop reserves the 240px sidebar gutter
  (`md:pl-60` or a flex/grid two-column layout).
- **Dedupe the actor lookup:** `AppShell` and every page both call `getCurrentStaff()`
  (two DB lookups/request). Wrap it (or `getIdentity`) in React **`cache()`** so the shell
  and the page share one result per request. Cheap to do now, annoying to retrofit.

> Rationale (the route-group trade-off): an `app/(app)` group would let the 401/403 views
> sit *outside* the shell for free. We instead keep the root layout and put the
> no-identity branch in `AppShell`. If that passthrough ever starts fighting the
> framework, switching to `(app)` is the cheaper path — but it's not expected to.

### 2.2 Nav data — `components/navigation/navItems.ts`

Single source of truth (UI-STRUCTURE §2). Shape:

```ts
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;            // Slovak
  icon: LucideIcon;
  managerOnly?: boolean;    // SPRÁVA items → true
  group: "prevadzka" | "sprava";
}
```

**PREVÁDZKA** (always shown, with icons — used by sidebar + bottom nav):

| Label | href | icon (lucide) | group |
| --- | --- | --- | --- |
| Kalendár | `/` | `Calendar` | prevadzka |
| Nová rezervácia | `/orders/new` | `CalendarPlus` | prevadzka |
| Zákazníci | `/clients` | `Users` | prevadzka |

**SPRÁVA** (`managerOnly: true`, **text-only** in the dropdown — `icon` carried in the
type for consistency but **not rendered** in the dropdown; only the burger toggle shows an
icon):

| Label | href | group |
| --- | --- | --- |
| Správa zamestnancov | `/staff` | sprava |
| Katalóg služieb | `/services` | sprava |
| Otváracie hodiny | `/settings/hours` | sprava |
| SMS šablóny | `/settings/sms-templates` | sprava |
| Záznam zmien | `/audit` | sprava |

> **Decisions baked in:** SPRÁVA burger toggle = lucide **`Settings`** (gear); dropdown
> items are **text-only** (no per-item icons). PREVÁDZKA icons above (`Calendar`,
> `CalendarPlus`, `Users`) are **proposed — confirm in review.**
>
> Note: `/settings/hours` will absorb `/settings/exceptions` in spec 18 (merged
> hours+exceptions); the route already exists, so the nav item is correct now.

### 2.3 Components

- **`components/navigation/Sidebar.tsx`** (`"use client"` — needs `usePathname` for active
  state) — desktop only (`hidden md:flex`), fixed 240px. Renders the PREVÁDZKA items
  (icon + label, active state via `usePathname`). At the bottom: the logged-in staff name
  + role; and — **manager only** — the overdue **`UnpaidBadge`** (live, → `/unpaid`, hidden
  at 0) **above** the **SPRÁVA burger** (a `Settings`-icon button opening a shadcn
  `DropdownMenu` of the SPRÁVA items, text-only). Props: `{ role, staffName, unpaidCount,
  realtimeJwt }` — `AppShell` mints the Realtime JWT + `getUnpaidCount` for managers and
  passes them in. (The calendar header is mobile-only, so on desktop this sidebar badge is
  the only unpaid affordance — see spec 14 §2.6.)
- **`components/navigation/BottomNav.tsx`** (`"use client"`) — mobile only
  (`md:hidden`), fixed to the bottom, `env(safe-area-inset-bottom)` padding. Four slots:
  the three PREVÁDZKA items (icon + short label) and — **manager only** — a fourth
  **`Settings`-icon burger** whose `DropdownMenu` opens **upward** (`side="top"`) with the
  SPRÁVA items. `prevadzka` sees only the three. Props: `{ role }`.
- Both derive their items from `navItems.ts` filtered by `group` and `managerOnly` vs
  `role === "manazer"`. Active state by `usePathname()` (exact match for `/`, prefix match
  for the rest).
- Needs the shadcn **`dropdown-menu`** primitive — add via `pnpm dlx shadcn@latest add
  dropdown-menu` (not yet in `components/ui/`).

### 2.4 Cross-page container reconciliation (the sweep)

The shell now owns `<main>` + container + padding. Every page that currently renders its
own `<main className="mx-auto max-w-* p-4 sm:p-6">` must change:

- **Remove** the `<main>` element and its `mx-auto max-w-* p-… ` outer wrapper — return
  the page content as a fragment or top-level `<div className="space-y-*">` (keep only the
  vertical-rhythm utility, drop padding/`max-w`/`mx-auto`).
- Pages that genuinely want a **narrower content column** than `max-w-7xl` (forms, detail
  pages) keep an **inner** `mx-auto max-w-2xl` (etc.) wrapper **without** its own padding —
  never a second `<main>`.

Affected pages (current widths, from the baseline): `/` (5xl), `/clients` (2xl),
`/clients/[id]` (2xl), `/audit` (4xl), `/services` (5xl), `/services/[id]` (3xl),
`/orders/[id]` (3xl), `/orders/new` (2xl), `/settings/hours` (2xl),
`/settings/sms-templates` (2xl), `/settings/exceptions` (2xl), `/staff` (3xl),
`/unpaid` (3xl). Plus `/page.tsx` calendar (see §2.5).

> This is the part that makes "done" actually done: skipping it leaves nested containers
> and doubled padding across the app.

### 2.5 Remove the hub (and **every** link to it)

- **Delete `app/menu/page.tsx`** (the hub) — replaced by the shell.
- **Remove all four `/menu` links** — the route-killer must leave **zero** dead links
  behind it (this spec ships before specs 13–18 on a releasable `main`). Current refs:
  - `app/page.tsx` (calendar header "Menu")
  - `components/audit/audit-view.tsx` (back link)
  - `components/settings/sms-templates-editor.tsx` (back link)
  - `components/unpaid/unpaid-list.tsx` (back link)

  Later specs may add a context-appropriate back-affordance; the shell nav already covers
  "go elsewhere".
- No redirect needed for `/menu` (it was an internal hub, not a deep-link target); after
  deletion it 404s, which is fine once every link above is gone.

### 2.6 Error handling & states

- The shell's no-identity branch (§2.1) is the only new error path; the 401/403 views
  themselves are unchanged (spec 01).
- Active-link styling uses existing primitives/tokens (reskinned in spec 13).
- No loading skeleton needed for the shell itself (it's server-rendered with the page).

---

## 3. Tasks

Ordered; complexity S/M/L; dependencies in parentheses.

1. **(S)** Add shadcn **`dropdown-menu`** primitive to `components/ui/`.
2. **(S)** `components/navigation/navItems.ts` — typed `NavItem[]` (PREVÁDZKA + SPRÁVA per
   §2.2). (dep: —)
3. **(M)** `components/navigation/Sidebar.tsx` — desktop nav + staff/role footer +
   manager-only SPRÁVA `Settings` burger → `DropdownMenu`. (dep: 1, 2)
4. **(M)** `components/navigation/BottomNav.tsx` — mobile nav + manager-only `Settings`
   burger → upward `DropdownMenu`. (dep: 1, 2)
5. **(M)** `components/navigation/AppShell.tsx` (server) — resolve `getCurrentStaff()`,
   render full shell or chrome-less passthrough; own the single `<main>`. (dep: 3, 4)
6. **(S)** `app/layout.tsx` — wrap children in `<AppShell>`; `min-h-dvh`. (dep: 5)
7. **(M)** Container sweep — strip per-page `<main>`/outer container/padding across all
   affected pages (§2.4); preserve intended inner widths. (dep: 6)
8. **(S)** Delete `app/menu/page.tsx`; remove calendar "Menu" link (§2.5). (dep: 6)
9. **(M)** Tests: e2e nav (manager sees SPRÁVA burger + can reach each SPRÁVA route;
   prevádzka sees only the 3 core items, no burger; active-link state); single-`<main>`
   assertion; no-identity passthrough renders chrome-less. (dep: 7, 8)

---

## 4. Acceptance criteria

Concrete and checkable. Shell commands run from repo root.

### 4.1 Build, types, lint, tests

```bash
pnpm typecheck                      # exits 0
pnpm lint                           # exits 0
pnpm test                           # exits 0; unit + e2e pass
pnpm build                          # exits 0
```

### 4.2 Single `<main>`, no leftover containers (must pass)

```bash
# No page declares its own <main> anymore (shell owns it) — expect: 0
grep -rnE "<main" app/**/page.tsx app/page.tsx | grep -v AppShell | wc -l
# /menu hub is gone — expect: no such file
test ! -e app/menu/page.tsx && echo OK
# NO /menu links remain anywhere (4 today: calendar, audit, sms-templates, unpaid) — expect: 0
grep -rn '/menu' app components | wc -l
```

- Rendered DOM on any page contains **exactly one** `<main>` (assert in e2e).

### 4.3 Navigation & role gating (e2e, must pass)

- As `manazer`: sidebar shows the 3 PREVÁDZKA items + the SPRÁVA `Settings` burger; the
  burger dropdown lists all 5 SPRÁVA items and each navigates to its route
  (`/staff`, `/services`, `/settings/hours`, `/settings/sms-templates`, `/audit`).
- As `prevadzka`: sidebar shows only the 3 PREVÁDZKA items and **no** SPRÁVA burger;
  bottom nav (mobile viewport) shows only the 3 core items.
- Active item reflects the current route (`usePathname`).

```bash
pnpm test e2e/navigation            # exits 0
```

### 4.4 No-identity passthrough (e2e or unit, must pass)

- When `getCurrentStaff()` throws (identity maps to no active staff row), the shell
  renders **no** sidebar/bottom-nav — the page's 401/403 view is full-screen
  (assert the nav landmarks are absent).

### 4.5 Manual checks

- [ ] Desktop (`md:+`): 240px sidebar visible, persistent across route changes; main
      content not overlapped, no horizontal scroll.
- [ ] Mobile (360px): bottom nav fixed, respects safe-area inset; SPRÁVA burger (manager)
      opens **upward**; content not hidden behind the bar.
- [ ] No page shows doubled padding or a too-narrow/nested container after the sweep.
- [ ] All nav labels are Slovak; PREVÁDZKA icons render (Calendar / CalendarPlus / Users).
- [ ] `prevadzka` (via `DEV_AUTH_ROLE=prevadzka`) sees no SPRÁVA affordance anywhere.
