# Spec 13 — Theme reskin (Nova preset, fonts, `STATE_COLOR`)

> **Status:** draft · **PRD refs:** §5 (status colors) ·
> **Depends on:** spec 12 (app shell) ·
> **UI-redesign refs:** `../UI-STRUCTURE.md` §3 (visual theme), §15.B (status colors),
> §15.C (theme tokens) ·
> **Baseline refs:** `../zemplin-baseline.md` (theming — globals.css tokens, colors.ts)

Full visual reskin of the working app: adopt the prototype's **Nova preset** tokens
(**light + dark**), **Plus Jakarta Sans + JetBrains Mono** fonts, and consolidate
order-status colors + labels into a single home (`types/index.ts` → `STATE_COLOR` +
`STATE_LABEL`), retiring `lib/orders/colors.ts`. **Dark mode stays wired** (Nova dark
tokens + `dark:` status variants); the **activation mechanism (toggle vs system) is
deferred**. **Structure is unchanged** — this spec only swaps tokens, fonts, and the
status-style source; component layout/markup is untouched.

---

## 1. Requirements

### 1.1 What this feature does

1. Swap the shadcn base to the **Nova preset** (`baseColor: neutral`) and replace the
   design-token set in `app/globals.css` accordingly.
2. Wire **Plus Jakarta Sans** (sans) and **JetBrains Mono** (mono) via `next/font/google`
   (`display: "swap"`) into `--font-sans` / `--font-mono` and the `<body>`.
3. **Keep dark mode wired**: regenerate the `.dark` token block with Nova dark tokens and
   keep the `next-themes` plumbing. The **activation UI (toggle vs system) is deferred** —
   not built here.
4. Create **`types/index.ts`** as the single home for order-status presentation:
   `STATE_COLOR` (Tailwind class set per status, **with `dark:` variants**) and
   `STATE_LABEL` (Slovak labels — the only client-visible text; identifiers are English).
5. **Remap** the status palette (semantics unchanged): vytvorená amber→**red**, hotová
   sky→**orange**, zaplatená emerald→**green**, nedostavil sa zinc→**gray**.
6. **Retire `lib/orders/colors.ts`** and repoint all 5 consumers at `types/index.ts`.
7. Keep **sonner** toasts.

### 1.2 User stories

- As a user, the app has a consistent, modern look (new fonts + palette) across every
  page and the new shell — without any change to what the pages *do*.
- As a developer, status colors and labels live in **one** place, so a future palette
  tweak is a single-file edit.

### 1.3 Non-goals

- **No layout/markup/structure changes** — that's specs 14–18. Reskin only.
- **No new status semantics** — the four statuses and their meaning are unchanged; only
  the palette and the source-of-truth location change.
- **No theme-switch UI** — dark mode stays wired (tokens + `dark:` variants), but the
  activation mechanism (toggle in the shell vs. follow-OS) is **deferred**, decided later.
- SMS-status colors/labels (`SmsStatusCard`) are **spec 15**, not here.

---

## 2. Design

### 2.1 Status presentation — `types/index.ts` (new single home)

Keyed by the real `OrderStatus` enum (lowercase — `lib/supabase/types`), not the doc's
illustrative uppercase. Shape per `UI-STRUCTURE.md` §15.B (adds an explicit `border` and a
`badge` fill vs. the old `bg/text/label` triple):

```ts
import type { OrderStatus } from "@/lib/supabase/types";

export const STATE_LABEL: Record<OrderStatus, string> = {
  vytvorena: "Vytvorená",
  hotova: "Hotová",
  zaplatena: "Zaplatená",
  nedostavil_sa: "Nedostavil sa",
};

export interface StateColor { bg: string; border: string; text: string; badge: string }

// Light classes + dark: variants so blocks stay legible in either theme.
export const STATE_COLOR: Record<OrderStatus, StateColor> = {
  vytvorena:     { bg: "bg-red-100 dark:bg-red-950",       border: "border-red-500 dark:border-red-700",       text: "text-red-700 dark:text-red-300",       badge: "bg-red-500" },
  hotova:        { bg: "bg-orange-100 dark:bg-orange-950", border: "border-orange-500 dark:border-orange-700", text: "text-orange-700 dark:text-orange-300", badge: "bg-orange-500" },
  zaplatena:     { bg: "bg-green-100 dark:bg-green-950",   border: "border-green-500 dark:border-green-700",   text: "text-green-700 dark:text-green-300",   badge: "bg-green-500" },
  nedostavil_sa: { bg: "bg-gray-100 dark:bg-gray-800",     border: "border-gray-400 dark:border-gray-600",     text: "text-gray-600 dark:text-gray-300",     badge: "bg-gray-400" },
};
```

- All class names are **static string literals** (incl. the `dark:` variants), so Tailwind
  v4's source scan picks them up (no dynamic concatenation). Exact dark shades are tunable
  in implementation — the requirement is legible-in-both-themes, not these precise values.
- **No-show treatment:** `STATE_COLOR.nedostavil_sa` is **plain color only** — the old
  `opacity-60 line-through` is dropped from the shared token. If the calendar still wants a
  struck/faded no-show block, it applies that **locally** (spec 14), not from the shared
  set. `client-detail` already renders no-show without strike-through, so this matches.

### 2.2 Consumer migration (5 call sites)

Replace `STATUS_STYLE` (`lib/orders/colors.ts`) with `STATE_COLOR` + `STATE_LABEL`:

| File | Today | Change |
| --- | --- | --- |
| `components/calendar/calendar.tsx` | `STATUS_STYLE[status].{bg,text,label}` | `STATE_COLOR[status]` (bg/border/text) + `STATE_LABEL`; keep any local no-show fade here |
| `components/orders/order-detail.tsx` | `STATUS_STYLE[status]`, `.label` | `STATE_COLOR` + `STATE_LABEL` |
| `components/clients/client-detail.tsx` | `STATUS_STYLE[e.status]` + custom no-show handling | `STATE_COLOR` + `STATE_LABEL`; keep its existing no-show choice |
| `lib/audit/labels.ts` | `STATUS_STYLE[v]?.label` | `STATE_LABEL[v] ?? v` |

Then **delete `lib/orders/colors.ts`**. The old `bg` string bundled border+hover into one
class; the new shape separates `border`, so each call site composes `bg border text`
(+ `hover:` where it had one) explicitly.

### 2.3 shadcn preset + tokens (`components.json`, `globals.css`)

- `components.json`: `baseColor: "neutral"`, adopt the **Nova preset** style
  (`UI-STRUCTURE.md` §15.C: `"style": "base-nova"`). **Verify** the installed shadcn CLI
  accepts `base-nova` as a style value; if it does not, apply Nova as **token values** in
  `globals.css` instead and leave `style` as-is — the visual target (Nova neutral tokens)
  is what matters, not the config string.
- `globals.css`: replace the `:root` oklch token set with the Nova neutral set, **and
  regenerate the `.dark` block with Nova dark tokens** (keep the `@custom-variant dark`
  line). Keep the `@theme inline` token→Tailwind mapping and the `@layer base` body
  defaults.

### 2.4 Fonts (`app/layout.tsx`)

```ts
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
const sans = Plus_Jakarta_Sans({ subsets: ["latin","latin-ext"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin","latin-ext"], variable: "--font-mono", display: "swap" });
```

- Apply `${sans.variable} ${mono.variable}` on `<html>`; ensure `--font-sans` flows into
  the body font. Include **`latin-ext`** subset so Slovak diacritics (č, š, ž, ť, ô…)
  render correctly.

### 2.5 Dark mode (kept; activation deferred)

- **Keep** the `.dark` token block (Nova dark tokens) and the `next-themes` dependency/
  plumbing as they are today ("wired but not actively toggled"). Do **not** force a theme.
- The **activation mechanism is deferred**: no toggle is added in this spec, and we don't
  decide toggle-vs-follow-OS here. Whatever drives `.dark` today keeps working; sonner's
  `<Toaster />` follows the theme.
- The only dark-related work here is ensuring `STATE_COLOR` carries `dark:` variants (§2.1)
  and the regenerated `.dark` tokens (§2.3) so nothing is illegible if dark is active.

### 2.6 Error handling & states

- Pure presentation change; no new runtime branches. Risk is **visual regression**, caught
  by the build + a manual pass, not new error paths.

---

## 3. Tasks

Ordered; complexity S/M/L; dependencies in parentheses.

1. **(M)** `types/index.ts` — `STATE_LABEL` + `STATE_COLOR` (new palette, new shape). (dep: —)
2. **(M)** Migrate the 4 files in §2.2 to `STATE_COLOR`/`STATE_LABEL`; compose
   `bg border text` explicitly; keep no-show local treatment where it existed. (dep: 1)
3. **(S)** Delete `lib/orders/colors.ts`; confirm no remaining imports. (dep: 2)
4. **(M)** `components.json` + `globals.css`: Nova neutral tokens for **both** `:root` and
   `.dark` (keep the dark variant). (dep: —)
5. **(S)** Fonts: `next/font/google` (Plus Jakarta Sans + JetBrains Mono, `latin-ext`,
   `swap`) wired in `app/layout.tsx`. (dep: —)
6. **(S)** Verify dark-mode plumbing still works (`next-themes` kept, no forced theme);
   `STATE_COLOR` dark variants legible. Activation UI deferred. (dep: 4)
7. **(S)** Tests/checks: update any unit test referencing `STATUS_STYLE`; add a unit test
   that `STATE_COLOR`/`STATE_LABEL` cover all four `OrderStatus` values. (dep: 2)

---

## 4. Acceptance criteria

### 4.1 Build, types, lint, tests

```bash
pnpm typecheck                      # exits 0
pnpm lint                           # exits 0
pnpm test                           # exits 0
pnpm build                          # exits 0
```

### 4.2 Source-of-truth migration (must pass)

```bash
# colors.ts retired — expect: file gone
test ! -e lib/orders/colors.ts && echo OK
# no lingering imports of the old module or symbol — expect: 0
grep -rn "orders/colors\|STATUS_STYLE" app components lib | wc -l
# new home exists and exports both symbols — expect: matches
grep -c "STATE_COLOR\|STATE_LABEL" types/index.ts
```

- Unit test: `STATE_COLOR` and `STATE_LABEL` each have exactly the 4 `OrderStatus` keys.

### 4.3 Palette remap (must pass)

- `STATE_COLOR.vytvorena` uses **red**, `hotova` **orange**, `zaplatena` **green**,
  `nedostavil_sa` **gray** (assert the class strings in a unit test).

### 4.4 Dark mode kept (must pass)

```bash
# .dark token block + variant still present (Nova dark tokens) — expect: >= 2
grep -nE "^\.dark|@custom-variant dark" app/globals.css | wc -l
# STATE_COLOR carries dark: variants — expect: >= 1
grep -c "dark:" types/index.ts
```

### 4.5 Manual checks

- [ ] Every page + the spec-12 shell render with the new fonts (Plus Jakarta Sans body,
      JetBrains Mono for monospace) — Slovak diacritics render correctly (latin-ext).
- [ ] Calendar status blocks show the new palette (red/orange/green/gray); legend matches.
- [ ] Order detail, client history, and audit labels all read from the new source.
- [ ] In **dark** mode (whatever currently drives `.dark`), status blocks, text, and chrome
      stay legible — no dark-on-dark or light-on-light; toasts follow the theme.
- [ ] Toasts still appear and are legible.
