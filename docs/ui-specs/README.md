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
| 13 | Theme reskin (Nova preset, fonts, `STAV_FARBY`) | 📝 | §3, §15.B–C | 12 |
| 14 | Calendar header, date-picker, box filter | 📝 | §4 | 12, 13 |
| 15 | Order detail — popup Sheet + `/orders/[id]` + `SmsStatusCard` | 📝 | §7 | 13 |
| 16 | Nová rezervácia — 4-step wizard | 📝 | §8 | 13, 14 |
| 17 | Zákazníci — merged master-detail (`?id=`) | 📝 | §9 | 13 |
| 18 | SPRÁVA sections — restyle + hours merge + audit pagination | 📝 | §10 | 13 |

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
