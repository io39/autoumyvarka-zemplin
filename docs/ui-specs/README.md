# UI redesign specs — index (dependency order)

These specs restructure and reskin the **working** app (delivered by the functional
specs `docs/specs/01–11`) to the reference prototype described in
[`../UI-STRUCTURE.md`](../UI-STRUCTURE.md). They are **UI-layer only** — no schema or
Server-Action changes — and are built and merged **one at a time**, keeping `main`
releasable.

Numbering continues from the functional specs (**12+**) on purpose: these specs reference
functional specs by number (e.g. "depends on 01"), so a continuous sequence keeps those
references unambiguous. Same format as the functional specs
(Requirements → Design → Tasks → Acceptance). Status: ✅ written · 📝 to be written.

Suggested order: shell → theme → calendar → order detail → wizard → clients → SPRÁVA
sections (biggest visible change, lowest risk, first — `UI-STRUCTURE.md` §14).

| # | Spec | Status | UI-STRUCTURE refs | Depends on |
| --- | --- | --- | --- | --- |
| 12 | [App shell & navigation (sidebar + bottom nav)](./12-app-shell-and-navigation.md) | ✅ | §0–§2, §11, §12 | 01 |
| 13 | [Theme reskin (Nova preset, fonts, `STATE_COLOR`)](./13-theme-reskin.md) | ✅ | §3, §15.B–C | 12 |
| 14 | [Calendar header, date-picker, box filter](./14-calendar-header-and-controls.md) | ✅ | §4 | 12, 13 |
| 15 | [Order detail — popup Sheet + `/orders/[id]` + `SmsStatusCard`](./15-order-detail-two-surfaces.md) | ✅ | §7 | 13, 14 |
| 16 | [Nová rezervácia — 4-step wizard (+ Zmeniť-čas edit mode)](./16-new-reservation-wizard.md) | ✅ | §8 | 13, 14, 15 |
| 17 | [Zákazníci — merged master-detail (`?id=`)](./17-clients-master-detail.md) | ✅ | §9 | 13, 15, 16 |
| 18 | [SPRÁVA sections — restyle + hours merge + services accordions](./18-sprava-sections.md) | ✅ | §10 | 12, 13, 17 |

---

## Per-spec scope notes

### 12 — App shell & navigation
Replaces hub-and-spoke (`/menu`) with a persistent shell: desktop **sidebar** + mobile
**bottom nav**, driven by a single `navItems.ts`. PREVÁDZKA items (Kalendár, Nová
rezervácia, Zákazníci) for all roles; **SPRÁVA** admin cluster behind a manager-only
`Settings` burger → dropdown (text-only). Shell lives in the **root layout** (no `(app)`
group); rendered as a **server component** that goes chrome-less when no staff identity
resolves (keeps 401/403 full-screen). Includes the **cross-page container sweep** (shell
owns the single `<main>`) and removal of `/menu` + the calendar "Menu" link. Depends on
01 (auth, role gating, 401/403 views).

### 13 — Theme reskin
Nova-preset neutral tokens + Plus Jakarta Sans / JetBrains Mono, **light + dark** (dark
mode stays wired; **activation toggle-vs-system deferred**). Consolidates order-status
colors **and** labels into `types/index.ts` (`STATE_COLOR` with `dark:` variants +
`STATE_LABEL`, new red/orange/green/gray palette), retiring `lib/orders/colors.ts` and
migrating its 5 consumers. Identifiers English; only client-visible text is Slovak.
Structure unchanged.

### 14 — Calendar header, date-picker, box filter
§4 header layout; **new:** a shadcn `Calendar` popover date-picker (month+year) replacing
the native date input, plus a `StatusLegend`. Keeps the **mobile-only** Box 1 / Box 2
toggle (no "Obe"). Reconciles the staff-identity/unpaid header leftovers from spec 12
(identity in sidebar on desktop, header on mobile). Grid/Realtime unchanged;
block→`/orders/[id]` stays a link (the popup is spec 15). Moderate decomposition.

### 15 — Order detail: two surfaces
Extracts the **already-existing** order-detail sections into shared one-per-file cards
(incl. the existing SMS log → `SmsStatusCard`), reordered to §7, rendered by **both** a
**popup Sheet** (from a calendar block, via a new `getOrderDetailBundle` action) and the
kept `/orders/[id]` page. No Server-Action/authz changes. Keeps `components/orders/`.
Zmeniť čas ships as the interim working move here; **spec 16 upgrades it to the wizard**.

### 16 — Nová rezervácia wizard (+ edit mode)
4-step wizard (Klient → Auto → Služby → Termín). **New:** in-flow client step (today the
flow redirects to `/clients`) and a richer Termín step (Deň/3-dni, shared §4 date control,
quick slots + visual picker with MINULOSŤ overlay). Reuses `createOrder`/`suggestSlots`/
pricing. Also adds **edit mode**: order-detail **Zmeniť čas** opens the wizard prefilled
(client/car locked) on step 3 → adjust services + pick a new slot → apply diff via
`moveOrder` + service add/remove. New client/car **persist** (prototype's "Phase 2" n/a).

### 17 — Zákazníci master-detail
Merge search + detail into one `/clients?id=` master-detail page; keep `/clients/[id]` as a
**redirect**. Restructure detail to §9: Klient blok (Nová rezervácia / +auto / Upraviť),
per-car **accordion** history with **Poradie**, expanded-order Pracovníci/Poznámka/box/€,
row → `/orders/[id]`. No client/car/history action changes; no invented car fields.

### 18 — SPRÁVA sections
Mostly restyle. Real changes: wrap the **already-split** Hlavné/Doplnkové service sections
in accordions (primitive from spec 17); **merge** opening-hours + výnimky onto
`/settings/hours` (`/settings/exceptions` → redirect); switch audit pagination from infinite
"load more" to **◀ ▶ paged navigation** (reusing the existing keyset cursor + a client cursor
stack). (`/menu` links are all removed in spec 12, not here.)
