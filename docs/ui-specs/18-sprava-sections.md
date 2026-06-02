# Spec 18 — SPRÁVA sections: restyle + hours merge + services accordions

> **Status:** draft · **PRD refs:** §9.1 (soft-delete), §11 (audit), §14 (hours) ·
> **Depends on:** spec 12 (shell/nav), spec 13 (theme) ·
> **UI-redesign refs:** `../UI-STRUCTURE.md` §10, §11 · **Baseline refs:**
> `../zemplin-baseline.md` (services-manager, opening-hours/day-overrides editors,
> sms-templates-editor, audit-view)

The manager-only **SPRÁVA** sections, reached via the spec-12 burger. **General rule: keep
each screen's behavior, restyle to the spec-13 theme**, with these real changes: **merge
opening-hours + exceptions** into one page, wrap the **services catalog** in Hlavné/
Doplnkové **accordions**, and switch the **audit** view from infinite "load more" to ◀ ▶
paged navigation.

---

## 1. Requirements

### 1.1 What this feature does

1. Restyle all SPRÁVA pages to the spec-13 theme/fonts; every page uses the spec-12 shell.
2. **Katalóg služieb** (`/services`): keep behavior; wrap the **existing** "Hlavné služby"
   and "Doplnkové služby" sections in **expandable accordions**. Soft-delete only (rule #7).
3. **Otváracie hodiny + Výnimky → merged** (`/settings/hours`): opening hours on top,
   holidays/day-overrides below, on **one page**. Fold in `/settings/exceptions`
   (**redirect** to `/settings/hours`).
4. **SMS šablóny** (`/settings/sms-templates`): restyle only (70-char enforcement deferred).
5. **Záznam zmien** (`/audit`): restyle **and replace the infinite "load more" with ◀ ▶
   page navigation** (each arrow shows one page, not endless scroll). (The `/menu` back-link
   is removed by **spec 12**, not here.)

### 1.2 Decisions baked in

- **Hours nav label = "Otváracie hodiny"** (route stays `/settings/hours`) — the merged
  page covers výnimky below; a longer label isn't needed. *Confirm in review.*
- **Audit pagination = ◀ ▶ paged navigation** (prev/next arrows), **replacing** the current
  infinite "Načítať ďalšie" (no endless scroll). Reuses the existing keyset cursor
  (`lib/audit/cursor.ts`, `PAGE_SIZE`) and `getAuditLog` action; only the client paging
  changes. This resolves the §13 open question.

### 1.3 Non-goals

- **No behavior changes** to service CRUD/pricing, hours/override editing, SMS-template
  editing, or audit **filtering/aggregation** — restyle + the listed structural tweaks only
  (the audit change is paging UI, not what's logged or how it's queried).
- **No 70-char SMS enforcement** in the template editor (explicitly deferred, §13).
- No new audit features beyond restyle + the `/menu`-link removal.

---

## 2. Design

### 2.1 Katalóg služieb (`/services`, `/services/[id]`)

- The two sections already exist (`services-manager.tsx`: `kind === "main"` → "Hlavné
  služby", `"addon"` → "Doplnkové služby"). Wrap each in a shadcn **`accordion`** item
  (reuse the primitive added in spec 17), default-expanded or collapsed (collapsed keeps a
  long catalog scannable). Create/edit dialogs and soft-delete (activate/deactivate)
  unchanged. Restyle to spec-13 tokens.

### 2.2 Otváracie hodiny + Výnimky — merged (`/settings/hours`)

- `app/settings/hours/page.tsx` loads **both** hours and overrides and renders
  `OpeningHoursEditor` (top) **and** `DayOverridesEditor` (below) on one page, each in its
  own titled card ("Otváracie hodiny" / "Výnimky a sviatky"). Editors themselves are
  unchanged components.
- **Date consistency:** the `DayOverridesEditor` "Dátum" field uses the shared
  **`DateField`** (`components/settings/date-field.tsx`) — the **same** shadcn `Calendar`
  popover as the main calendar (`DateNav`): month + year dropdowns, Slovak locale, Monday
  start. (Replaces the native `<input type="date">`, so all date pickers behave identically.)
  The Otvorenie/Zatvorenie **time** inputs stay native `<input type="time">` with
  `lang="sk-SK"` + `step={900}` (24h where the browser honours the locale; not forced).
- `app/settings/exceptions/page.tsx` → **`redirect('/settings/hours')`** (kept as a
  deep-link target, not deleted; UI-STRUCTURE §11). The nav already points only at
  `/settings/hours` (spec 12).

### 2.3 SMS šablóny (`/settings/sms-templates`)

- Restyle only. The 70-char Slovak-diacritics limit is **not** enforced here (deferred);
  no logic change.

### 2.4 Záznam zmien (`/audit`)

- **Switch to ◀ ▶ paged navigation.** Today `audit-view.tsx` uses a forward keyset cursor
  with a "Načítať ďalšie" button that **appends** rows (infinite scroll). Change it to
  **replace** the visible page and expose **◀ Predošlé / Ďalšie ▶** arrows:
  - **Forward:** use the existing `nextCursor` from `getAuditLog`.
  - **Back:** keep a **client-side stack of page-start cursors** (push on next, pop on
    prev) — no server change needed; page 1's cursor is `null`.
  - Disable **◀** on page 1 and **▶** when there's no `nextCursor`. `PAGE_SIZE` unchanged.
    A "strana N" indicator is optional. Filters reset paging to page 1.
- The server action `getAuditLog` (`{ rows, nextCursor }`, accepts a cursor) is reused
  unchanged — only the client paging logic changes.
- The leftover `/menu` back-link in `audit-view.tsx` is removed by **spec 12** (the
  route-killer removes all four `/menu` links). Nothing to do here beyond restyle.

### 2.5 Theme/shell conformance

- Each page drops any leftover `<main>`/container (covered by the spec-12 sweep if not
  already) and inherits the shell. Status/labels that appear in audit detail use
  `STATE_LABEL` (spec 13) via the existing `lib/audit/labels.ts` (already migrated in 13).

### 2.6 Error handling & states

- No new server paths. The `/settings/exceptions` redirect is the only routing change;
  existing editor save/error flows (toasts) are untouched.

---

## 3. Tasks

1. **(M)** `/services`: wrap Hlavné/Doplnkové sections in accordions; restyle. (dep: spec 17 accordion)
2. **(M)** `/settings/hours`: render hours + overrides on one page (two cards); load both. (dep: —)
3. **(S)** `/settings/exceptions` → `redirect('/settings/hours')`. (dep: 2)
4. **(S)** `/settings/sms-templates`: restyle only. (dep: —)
5. **(M)** `/audit`: restyle + replace "load more" with ◀ ▶ paging (client cursor stack;
   `/menu` link already removed in spec 12). (dep: —)
6. **(S)** Restyle pass + container cleanup across the SPRÁVA pages. (dep: 1–5)
7. **(M)** Tests: e2e (services accordions expand/collapse + CRUD still works; hours page
   shows both editors; `/settings/exceptions` redirects; audit **◀ ▶ paging** moves
   forward/back and disables at the ends; no `/menu` link anywhere). (dep: 6)

---

## 4. Acceptance criteria

### 4.1 Build, types, lint, tests

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build   # all exit 0
```

### 4.2 Structural changes (must pass)

```bash
# exceptions route now redirects — expect: >= 1
grep -rn "redirect(" app/settings/exceptions/page.tsx | wc -l
# no /menu links remain anywhere (app + components) — expect: 0
grep -rn 'href="/menu"' app components | wc -l
```

### 4.3 Behavior preserved (e2e, must pass)

- `/services`: Hlavné/Doplnkové render as accordions; create/edit/deactivate a service
  still works; deactivated services stay (soft-delete).
- `/settings/hours`: shows **both** opening hours and výnimky; editing each still saves.
- `/settings/exceptions` → redirects to `/settings/hours`.
- `/audit`: **◀ ▶** move between pages (replacing the list, not appending); ◀ disabled on
   page 1, ▶ disabled on the last page; filters reset to page 1 and still work.

### 4.4 Manual checks

- [ ] All SPRÁVA pages use the shell (sidebar/bottom-nav) and spec-13 theme/fonts.
- [ ] Manager-only access intact (prevádzka can't reach these — spec 01/12 gating).
- [ ] Slovak throughout; usable at 360px.
