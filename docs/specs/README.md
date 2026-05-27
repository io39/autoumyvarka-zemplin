# Feature specs — index (dependency order)

Every feature gets a spec (Requirements → Design → Tasks → Acceptance Criteria)
**before** implementation (`CLAUDE.md`, spec-driven development). Spec 01 is the
template; new specs are drafted by the `spec-writer` subagent in that format.

Specs are listed in **dependency order** — implement top to bottom. Each entry notes
its PRD section(s) and which prior specs it depends on. Status: ✅ written · 📝 to be
written.

| # | Spec | Status | PRD refs | Depends on |
| --- | --- | --- | --- | --- |
| 01 | [Foundation: edge auth, role mapping, staff](./01-foundation-auth-and-staff.md) | ✅ | §3, §11, §14 | — |
| 02 | [Clients & cars (phone key, shared ŠPZ)](./02-clients-and-cars.md) | ✅ | §4, §10, §13#1 | 01 |
| 03 | [Service catalog (services + per-category pricing)](./03-service-catalog.md) | ✅ | §9, §13#2, §13#3 | 01 |
| 04 | [Settings: opening hours & day overrides](./04-settings-opening-hours-holidays.md) | ✅ | §14 | 01 |
| 05 | [Reservations & two-box calendar](./05-reservations-and-calendar.md) | ✅ | §4, §5, §6 | 01, 02, 03, 04 |
| 06 | [Order detail & lifecycle (status, notes, assignment, services)](./06-order-detail-and-lifecycle.md) | ✅ | §6, §7, §9.3, §11 | 05 |
| 07 | [SMS notifications (reminder + "ready", webhook)](./07-sms-notifications.md) | ✅ | §8 | 05, 06 |
| 08 | [Client detail & service history](./08-client-detail-and-history.md) | ✅ | §10, §13#1 | 02, 05, 06 |
| 09 | [Audit log view (manager)](./09-audit-log-view.md) | ✅ | §11 | 01, 06 |
| 10 | Orders archive & daily overview | 📝 | §10 (extends) | 05, 06 |
| 11 | Unpaid-order alerts | 📝 | §9.3 (extends) | 06 |

---

## Per-spec scope notes

### 02 — Clients & cars
`clients` (phone = unique key, optional name/note), `cars` (ŠPZ unique, shared,
`pricing_category`), `client_cars` M:N. **Shared-ŠPZ duplicate detection** at car-add
time (data-model §2.4). **Unified fuzzy search** for clients by phone, name, or ŠPZ in
one autocomplete box, typo-tolerant via Postgres `pg_trgm` trigram indexes (PRD §10).
Depends on 01 for auth + audit + the migration baseline.

### 03 — Service catalog
`services` + `service_prices` seeded from `docs/services.md`: main + add-on (incl.
`is_per_unit` and `price_from`), per-(service × category) duration & price, nullable
durations. Manager-only activate/deactivate; never hard-delete (PRD §9.1). Depends on
01.

### 04 — Settings: opening hours & day overrides
`opening_hours` (recurring weekly, per weekday, `is_closed`) + `day_overrides`
(per-date: closed **or** custom hours, e.g. a shortened holiday). Override wins over
the weekday default. Manager-only edit. Consumed by the calendar (closed periods
render greyed — PRD §14) and by the "suggest nearest free slot" logic in 05. Depends
on 01.

### 05 — Reservations & two-box calendar
The heart. The phone-call booking flow (client → car → services → time), the
DB-level **box-overlap exclusion constraint**, automatic **duration calculation**
(Σ line durations, manually editable), the two-box day/week calendar with the four
status colors, **Realtime live updates** (consuming the minted JWT + RLS read
policies from spec 01 / data-model §3.1), and mobile single-box switching (PRD §5).
Depends on 01 (auth/realtime), 02 (clients/cars), 03 (services/durations), 04
(hours/overrides).

**Planning-note refinements (requested 2026-05-27):**
- **15-minute slot granularity** for time selection and the calendar grid (09:00,
  09:15, 09:30, …), not full-hour intervals.
- The **expected finish time** (`ends_at`) is shown prominently on order creation and
  on the calendar block, so workers see when a wash should be done.
- Order blocks/detail show the **vehicle model/type** alongside the ŠPZ, so workers
  identify cars faster — not the plate alone.

### 06 — Order detail & lifecycle
Status transitions with role rules (`vytvorena → hotova` any role; `→ zaplatena`
manager; `→ nedostavil_sa` manager) + audit; manager-only **notes** (PRD §7);
worker-or-manager **staff assignment**; **add/remove/pay services** on an existing
order in any state with per-line `paid` (PRD §9.3). The `hotova` transition is the
hook the SMS spec attaches to. Depends on 05.

### 07 — SMS notifications
`sms_templates` (simple Slovak placeholders now), the "ready" SMS fired on
`vytvorena → hotova`, the 30-min **reminder** via `pg_cron` → Route Handler
(architecture §6), the provider **webhook** Route Handler for delivery status, and
failure visibility + retry on the order (PRD §8). Depends on 05 (orders) and 06 (the
`hotova` transition).

### 08 — Client detail & service history
Read-only client page: details, all linked cars, and each car's chronological visit
history aggregated across **all linked clients** (shared-ŠPZ — dad's 5 + son's 1 = 6),
including `nedostavil_sa` records (PRD §10, §13#1). Depends on 02, 05, 06.

### 09 — Audit log view
Manager-only browsable/filterable view over `audit_log` (PRD §11), ≥3-month
retention. The audit *write* path ships in 01 and each mutating spec; this spec is
the *read* surface. Depends on 01 and 06 (most audited events live on orders).

### 10 — Orders archive & daily overview *(requested 2026-05-27)*
A **full cross-cutting overview** of completed/historical orders, distinct from the
per-client history in spec 08. Browse **any past day** (e.g. today's orders still
fully browsable in 2028): both boxes side by side, all vehicles, all services
performed, and order status — a clean read-only archive filterable by date range
(and ideally box / status / service). This is the manager's "what happened that day"
view, independent of which customer it was. Orders are soft-deleted and never purged
(data-model §4), so the archive is complete indefinitely. Depends on 05 (orders) and
06 (lifecycle/services).

### 11 — Unpaid-order alerts *(requested 2026-05-27)*
A visible **warning/notification** surface for orders that are not `zaplatena` when
they should be — especially **unpaid orders from previous days**, and any lingering
unpaid from the current day. Shown to the manager (e.g. a badge/banner with a count
and a drill-down list). Reads order status + per-line `paid` flags (data-model §2.7,
§2.8). Depends on 06 (status + per-line paid).

---

## Coverage check against PRD §15 acceptance criteria

| PRD §15 criterion | Spec(s) |
| --- | --- |
| 1. Create reservation < 1 min on mobile | 05 |
| 2. Both boxes visible, 4 status colors | 05 |
| 3. No conflicting reservation | 05 (DB exclusion constraint) |
| 4. Worker can update to `hotova`/reassign, not delete/move/no-show | 05, 06 |
| 5. Client lookup shows all cars + full history | 02, 08 |
| 6. Manager note visible to workers, not editable by them | 06 |
| 7. Both SMS sent reliably + logged | 07 |
| 8. Manual `zaplatena`, reflected realtime in every calendar | 06 (+ 05 realtime) |
| 9. Audit log records create/status/note edits | 01, 06, 09 |
| 10. Opening hours & day overrides configurable, calendar respects | 04, 05 |
| 11. Whole flow works mobile + desktop | 02–08 (mobile-first NFR each) |
