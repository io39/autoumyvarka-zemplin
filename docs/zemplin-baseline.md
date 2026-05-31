# UI Structure — Autoumyváreň Zemplín

A map of how the UI is built, for handing to another agent that will redesign it.
All user-facing copy is **Slovak**; keep it Slovak when restyling.

## Stack & conventions

- **Next.js 16 App Router**, TypeScript strict. Pages are React Server Components by
  default; interactive pieces are `"use client"` components under `components/`.
- **Tailwind CSS v4** (CSS-first config in `app/globals.css`, no `tailwind.config`).
- **shadcn/ui**, "new-york" style, base color **slate**, icons **lucide-react**.
  Primitives live in `components/ui/`.
- `cn()` helper (`lib/utils.ts`) = `clsx` + `tailwind-merge` for class composition.
- **Mobile-first** (≥360px). Layouts use `mx-auto max-w-*` containers with
  `p-3 sm:p-6` padding and `space-y-*` stacking.
- Toasts via **sonner** (`<Toaster />` mounted once in the root layout).

## Theming

Design tokens are CSS variables in `app/globals.css`, defined in **oklch** with a
light `:root` and a `.dark` block (dark mode wired but not actively toggled).
Tokens: `background, foreground, card, popover, primary, secondary, muted, accent,
destructive, border, input, ring`. Radius base `--radius: 0.625rem` with
`sm/md/lg/xl` derivations. **To re-skin the whole app, edit these variables first** —
components reference them via Tailwind classes (`bg-background`, `text-muted-foreground`, etc.).

**Order status colors** are separate, hardcoded Tailwind triples in
`lib/orders/colors.ts` (`STATUS_STYLE`) — amber = vytvorená, sky = hotová,
emerald = zaplatená, zinc/struck-through = nedostavil sa. Restyle these too.

## Global shell

- `app/layout.tsx` — root layout. `<html lang="sk">`, `<body class="min-h-svh antialiased">`,
  renders children + `<Toaster />`. **No global nav/header/sidebar** — there is no app shell.
- **Navigation is a hub-and-spoke model**: the home calendar has a small `Menu` link
  (top-right header); `app/menu/page.tsx` is a plain list of `<Link>`s to every section.
  Manager-only links are gated by `staff.role === "manazer"`.
- Auth/role errors render full-screen via `components/auth/auth-error-views.tsx`
  (`UnauthenticatedView` = 401, `ForbiddenView` = 403). Pages call these instead of
  throwing when identity/role checks fail.

## Routes → what each page does

| Route | File | Server/Client | What it does |
|---|---|---|---|
| `/` | `app/page.tsx` | RSC + `Calendar` client | **Home / live calendar.** Day or week view of the two wash boxes; shows orders as colored time blocks. Header shows logged-in staff name/role badge, an overdue-unpaid badge (manager only), and a `Menu` link. Updates live via Supabase Realtime. |
| `/menu` | `app/menu/page.tsx` | RSC | **Navigation hub.** Links to all sections; manager-only links hidden for workers. |
| `/orders/new` | `app/orders/new/page.tsx` | RSC + `BookingForm` | **Create reservation.** Pick client/car, services, box, time slot. Computes duration & checks box/time conflicts. |
| `/orders/[id]` | `app/orders/[id]/page.tsx` | RSC + `OrderDetail` | **Order detail.** View one order; status transitions (vytvorená→hotová→zaplatená, or nedostavil sa), add/remove services, edit notes, reassign worker. Manager has more powers. |
| `/clients` | `app/clients/page.tsx` | RSC + `ClientSearch` | **Client search.** Find clients by phone number (the client key). |
| `/clients/[id]` | `app/clients/[id]/page.tsx` | RSC + `ClientDetail` | **Client detail.** Client's cars and full service history. |
| `/services` | `app/services/page.tsx` | RSC + `ServicesManager` | **Service catalog** (manager). List/manage services; soft-delete (deactivate). |
| `/services/[id]` | `app/services/[id]/page.tsx` | RSC + `ServiceEditor` | **Edit one service** (manager). |
| `/staff` | `app/staff/page.tsx` (+ `loading.tsx`) | RSC + `StaffManager`/`WorkerManager` | **Staff management** (manager). Manage staff accounts and workers. Has a loading skeleton. |
| `/unpaid` | `app/unpaid/page.tsx` | RSC + `UnpaidList` | **Unpaid orders** (manager). Overdue/unpaid orders list; mirrors the home overdue badge. |
| `/audit` | `app/audit/page.tsx` | RSC + `AuditView` | **Audit log** (manager). Searchable record of every state change (creation, transitions, deletes, note edits, reassignments). |
| `/settings/hours` | `app/settings/hours/page.tsx` | RSC + `OpeningHoursEditor` | **Opening hours** (manager). Weekly opening hours that drive the calendar grid. |
| `/settings/exceptions` | `app/settings/exceptions/page.tsx` | RSC + `DayOverridesEditor` | **Day exceptions / holidays** (manager). Per-day overrides to opening hours. |
| `/settings/sms-templates` | `app/settings/sms-templates/page.tsx` | RSC + `SmsTemplatesEditor` | **SMS templates** (manager). Edit the automated SMS message templates. |

> Route handlers (not UI): `app/api/sms/webhook/route.ts` (delivery callbacks) and
> `app/api/reminders/route.ts` (scheduled reminder trigger).

## Component inventory

### Primitives — `components/ui/` (shadcn/ui)
`badge`, `button`, `dialog`, `input`, `label`, `select`, `skeleton`, `sonner` (toaster), `table`.
These carry the variant/size styling; restyling them propagates everywhere.

### Feature components — `components/`
| Component | Used by | Role |
|---|---|---|
| `calendar/calendar.tsx` (~550 lines, client) | `/` | The big one. Day/week grid, 15-min rows (`ROW_PX=24`), box switcher, navigation, Realtime subscription, colored status blocks. |
| `orders/booking-form.tsx` (~390) | `/orders/new` | Reservation creation form. |
| `orders/order-detail.tsx` (~770) | `/orders/[id]` | Largest component; full order view + all actions. |
| `clients/client-search.tsx` (~190) | `/clients` | Phone search box + results. |
| `clients/client-detail.tsx` (~516) | `/clients/[id]` | Cars + history. |
| `services/services-manager.tsx` (~334), `services/service-editor.tsx` (~376) | `/services`, `/services/[id]` | Catalog list + single-service editor. |
| `staff/staff-manager.tsx` (~254), `staff/worker-manager.tsx` (~203) | `/staff` | Staff accounts + workers. |
| `settings/opening-hours-editor.tsx` (~151), `settings/day-overrides-editor.tsx` (~213), `settings/sms-templates-editor.tsx` (~89) | `/settings/*` | The three settings editors. |
| `audit/audit-view.tsx` (~281) | `/audit` | Paginated/searchable audit list. |
| `unpaid/unpaid-list.tsx` (~190), `unpaid/unpaid-badge.tsx` (~56) | `/unpaid`, `/` | Overdue list + live count badge. |
| `auth/auth-error-views.tsx` | all pages | 401/403 full-screen views. |

## Recurring layout patterns (match these when restyling)

- **Page container:** `<main className="mx-auto max-w-5xl space-y-4 p-3 sm:p-6">`
  (calendar uses `max-w-5xl`; menu/auth use `max-w-md`).
- **Page header:** a `<header className="flex flex-wrap items-center justify-between gap-2">`
  with an `h1` title + right-aligned actions/badges.
- **Titles:** `text-xl font-semibold` (page), `text-base font-medium` (inline);
  secondary text `text-sm text-muted-foreground` / `text-xs`.
- **Links** are currently styled as underlined text (`underline underline-offset-4`),
  not buttons — a likely redesign target.
- **Role gating** is done in markup with `staff.role === "manazer" && (...)`.

## Where the design lives (quick reference for a redesign)

1. **Global tokens / colors / radius** → `app/globals.css`.
2. **Status block colors** → `lib/orders/colors.ts`.
3. **Component-level styling** → shadcn primitives in `components/ui/` + Tailwind
   classes inline in each feature component.
4. **There is no shared nav/header component** — if the redesign wants a persistent
   sidebar or top bar, it must be created (e.g. in `app/layout.tsx`) and the
   `/menu` hub reworked or removed.
