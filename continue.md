# Continue — handoff for the next agent

**Project:** Autoumyváreň Zemplín — internal reservation system for a single car wash.
**Phase:** Implementation, spec-driven. **All feature specs (01–11) are done.**
Remaining: walking-skeleton deploy (Supabase Cloud EU + VPS + Cloudflare
Tunnel/Access) and the client's open questions. **Last updated:** 2026-05-29.

Read these first, in order: `CLAUDE.md` (conventions), `docs/prd.md` (Slovak
requirements), `docs/architecture.md`, `docs/data-model.md`, `docs/specs/README.md`.

---

## First-run setup (do this before any code work)

The local stack must be up and `.env.local` must exist (it's gitignored, so a fresh
checkout has none). From the repo root:

```bash
corepack pnpm install                 # pnpm runs via corepack (no global install)
# start Docker Desktop first (supabase needs it), then:
pnpm supabase start                   # boots the local Postgres/Realtime stack
pnpm supabase status -o env           # copy ANON_KEY/SERVICE_ROLE_KEY/JWT_SECRET into .env.local
pnpm supabase db reset                # applies all migrations + seed (manager + worker)
pnpm typecheck && pnpm test           # sanity: should all pass
```

`.env.local` keys (see `.env.example` for the full set): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`,
plus the dev shim `DEV_AUTH_EMAIL`/`DEV_AUTH_ROLE`. After any new migration, rerun
`pnpm supabase db reset` and `pnpm supabase gen types typescript --local --schema public
> lib/supabase/database.types.ts`.

---

## Where things stand

Planning artifacts are all written and committed locally on `main`:

- `docs/architecture.md` — stack, edge-auth flow, deployment, env map, version policy.
- `docs/data-model.md` — full schema (14 tables), RLS posture, soft-delete map.
- `docs/services.md` — the client's price list (source for the catalog seed).
- `docs/specs/01..11` — feature specs, dependency-ordered, all ✅ in `docs/specs/README.md`.
- `.claude/` — `spec-writer` + `code-reviewer` subagents, hooks, and 3 skills
  (`supabase-migrations`, `edge-auth-authz`, `order-duration-conflict`).

### Implementation status
- **Spec 01 — DONE** (commit `feat: scaffold app and implement spec 01`). The app is
  scaffolded: Next 16 (App Router, TS strict), React 19, Tailwind 4, shadcn/ui, pnpm,
  Vitest + Playwright. Migration `0001_foundation.sql` (all enums + `staff` +
  `audit_log` + deny-by-default RLS), `seed.sql` (manager + a worker), generated
  `lib/supabase/database.types.ts`. Auth lib (`lib/auth/*`), service-role client,
  audit writer, Realtime JWT mint, staff Server Actions + `/staff` UI + `/` home +
  Slovak 401/403 views. 21 unit + 5 e2e tests pass.
- **Spec 02 — DONE** (commit `feat: implement spec 02 (clients & cars)`). Migration
  `0002_clients_cars.sql` (pg_trgm + unaccent; `clients`/`cars`/`client_cars` + trigram
  GIN indexes + RLS; `search_clients(q,lim)` RPC, execute revoked from anon/authenticated).
  Normalizers `lib/clients/phone.ts` + `lib/cars/spz.ts`. Actions in
  `lib/actions/clients.ts` + `lib/actions/cars.ts` (shared-ŠPZ link detection,
  manager-only edits, phone_change audit). UI `/clients` (fuzzy search) + `/clients/[id]`
  (detail, add-car/link-confirm, history placeholder for spec 08). 26 unit + 11 e2e pass.
- **Spec 03 — DONE** (commits `feat: implement spec 03 (service catalog)` + the
  code-review follow-ups `fix(services): apply spec 03 code-review should-fix items`
  and `chore(services): apply spec 03 code-review nits`). Migration
  `0003_service_catalog.sql` (`services` + `service_prices`, `unique nulls not
  distinct (service_id, pricing_category)`, deny-by-default RLS). `supabase/seed.sql`
  extended with 24 services / 47 prices translated from `docs/services.md` (cents,
  `price_from` for "od" rows, `is_per_unit` for `/ks` add-ons, NULL durations for
  time-less items). Pure resolver `lib/services/price-lookup.ts` (category → NULL
  fallback → "not available"); Slovak formatters `lib/services/format.ts`. Actions
  in `lib/actions/services.ts` (`listServices`, `getServicePrice`, `createService`,
  `updateService`, `upsertServicePrice`, `deleteServicePrice`, `setServiceActive`).
  UI `/services` (list + add) and `/services/[id]` (per-category grid edit) —
  manager-only, 403 for workers.
- **Spec 04 — DONE** (commit `feat: implement spec 04 (opening hours & day
  overrides)`, plus code-review follow-ups `fix(audit): apply spec 04
  code-review must-fix + should-fix` and `fix(settings): force 24h time
  picker via lang=sk-SK on time inputs`). Migration `0004_settings.sql`
  (`opening_hours` pk `day_of_week`, `day_overrides` pk `day`, both with
  check constraints `closed ⇒ NULL times` / `open ⇒ open<close`, deny-by-
  default RLS). Seed: 7 weekday rows (Mon–Fri 08:00–17:00, Sat 08:00–12:00,
  Sun closed). Pure helper `lib/settings/availability.ts`
  (`getOpenInterval`, `isOpenAt`, `isRangeOpen`) with **override-wins**
  resolution and **Europe/Bratislava** timezone handling via
  `Intl.DateTimeFormat`. Actions `lib/actions/settings.ts`. Migration
  `0005_audit_entity_nullable.sql` drops NOT NULL on `audit_log.entity_id`
  so config tables with non-uuid PKs can audit cleanly; settings audits
  use `entity_type='settings'` + `entity_id=null` + `details.table`.
  `writeAudit(entityId: string | null)`.
- **Spec 05 — DONE** (commits: `feat: implement spec 05 (reservations &
  calendar)`, plus follow-ups `feat(calendar): week view (7 days × 2
  boxes, shared time axis)` and `fix(orders): apply spec 05 code-review
  findings`). Migration `0006_orders.sql` (`orders` with status enum,
  `box smallint check(1,2)`, `ends_at` synced by a `BEFORE INSERT/UPDATE`
  trigger because generated columns can't use non-IMMUTABLE
  `timestamptz + interval`, the **btree_gist exclusion constraint**
  `orders_no_box_overlap` excluding soft-deleted + `nedostavil_sa`,
  indexes on `(box, starts_at)` etc., RLS deny-by-default + `authenticated`
  SELECT policies for the live calendar, and `alter publication
  supabase_realtime add table` for both `orders` and `order_services`).
  Pure helpers: `lib/orders/duration.ts` (Σ × category, NULL-duration
  add-ons → 0, flags unavailable), `lib/orders/slots.ts` (15-min grid +
  `suggestFreeSlots` / `overlapsAny`), `lib/orders/colors.ts` (4 status
  palettes), `lib/time/bratislava.ts` (shared DST-aware local↔UTC —
  `bratislavaLocalToUTC` / `bratislavaLocalToISO` /
  `bratislavaLocalDayRange`). Actions `lib/actions/orders.ts`
  (`getCalendar`, `suggestSlots`, `createOrder` with 15-min boundary
  check, `isRangeOpen`, snapshot order_services, friendly Slovak mapping
  of exclusion violation SQLSTATE 23P01, audit `order.create`,
  best-effort parent cleanup on line failure, **`durationOverrideMin`
  gated behind `requireManager`** per spec §2.3 / PRD §3). UI `/` is now
  the calendar with both **day and week views** (`?view=day|week`):
  - **Day view**: 2-box grid, 15-min rows, status colors,
    ŠPZ+model+service+start–finish blocks, date nav prev/next/dnes/picker,
    mobile single-box switcher.
  - **Week view**: 7 days × 2 boxes in a horizontally-scrollable grid,
    shared time axis (union of per-day open intervals), greyed closed
    zones, compact blocks (ŠPZ + start–finish), day headers link into the
    day view, navigation steps by 7 days.
  - Realtime subscription via the server-minted JWT (`lib/realtime/
    browser.ts`); channel name carries `view+date` so switching tears
    down and re-creates cleanly.
  `/orders/new` is the booking form (client preselected via `/clients`
  deep link, car select, service checkboxes mains+addons with per-unit
  qty, `Navrhnúť termín` calls `suggestSlots`, live duration + finish +
  total). Home now has a `Menu` link → `/menu` for admin pages. Client
  detail got a "Nová objednávka" button.
  **84 unit + 30 e2e tests pass.**
  **Deliberately NOT in this slice (carry-over to spec 06 / later — most now landed in 06):**
  optimistic insert in the calendar (Realtime echo refreshes the grid,
  good enough for phase 1); multi-context Realtime e2e (subscription
  wired, no two-browser test yet); suggested-slots list UI in the
  booking form (currently auto-picks the best slot); `/orders/[id]`
  detail route (spec 06's territory — calendar block links will 404
  until 06 lands; per-day clipping on the week-view time axis (reviewer
  rated low priority); a soft note that `order_services` is in the
  Realtime publication with no subscriber yet (spec 06 will subscribe).
- **Spec 06 — DONE** (commits `feat: implement spec 06 (order detail &
  lifecycle)` (fa23277) + later code-review follow-up `fix(orders): apply
  spec 06 code-review findings` (71a5983) covering an over-eager toast
  assertion in order-noshow-revert.spec.ts, a `deleted_at` guard on
  `removeOrderWorker`, and a stray `useMemo` import in order-detail.tsx).
  Migration `0007_order_staff.sql` (M:N `order_staff` with PK
  `(order_id, staff_id)`, FK to `staff` for `assigned_by`, deny-by-default
  RLS + authenticated SELECT, added to `supabase_realtime` publication).
  Pure transition matrix `lib/orders/transitions.ts` (`canTransition`,
  `allowedNextStatuses`) — PRD §3 matrix wins where §2.2 ASCII diagram
  conflicted, so `hotova → zaplatena` is **both roles**; the
  `nedostavil_sa → vytvorena` late-arrival exception is manager-only and
  re-checks conflict + hours in the action layer. In-process
  `lib/orders/ready-event.ts` emitter — `onOrderReady` / `emitOrderReady`,
  `server-only`, swallowed listener errors; spec 07 subscribes here.
  Server actions appended to `lib/actions/orders.ts`: `getOrder`
  (filters `deleted_at` so cancelled orders 404), `setStatus`
  (transition matrix + ORDER_READY emission on `vytvorena → hotova` +
  no-show revert via `slotIsFree` & `rangeIsOpen` helpers, friendly
  Slovak `"Termín už bol medzitým obsadený."` when slot rebooked),
  `moveOrder`, `deleteOrder` (rejects on `zaplatena`, soft via
  `deleted_at`), `addOrderWorker` / `removeOrderWorker` (idempotent on
  PK collision; both roles), `setNote` (manager-only, audits
  trimmed-from/to), `addOrderService` / `removeOrderService` /
  `setOrderServicePaid`. Duration recompute on add/remove **respects a
  prior manual override**: if `orders.duration_min` ≠ Σ active line
  `duration_min_snapshot`, the booking width is left alone. UI:
  `/orders/[id]` server page + `components/orders/order-detail.tsx`
  client component (status badge, client+car, prominent amber Poznámka
  block, status action buttons gated by `allowedNextStatuses`, workers
  add/remove via `Select`+button (`data-section="workers"`,
  `data-worker-id`), services list with per-line `paid` toggles and
  Odstrániť buttons disabled on hotova+, total Cena spolu, MoveDialog
  + DeleteDialog (manager only, role-gated rendering). Calendar block
  links to `/orders/[id]` (alive since spec 05). E2e helper
  `seedOrder()` in `tests/e2e/support.ts` (far-future random weekday
  date 800–2300 days out, retry on exclusion-violation, safe-time
  window 11:00–12:30 default to avoid collisions with the booking-
  conflict suite's 09:00/13:00 fixtures). Spec 06 tests:
  `order-role-permissions`, `order-move-delete`, `order-noshow-revert`,
  `order-note-audit`, `order-services` (e2e); `transitions`,
  `ready-event` (unit). **All 95 unit + 41 e2e tests pass on a clean
  `pnpm supabase db reset`.** Code-reviewer pass returned 0 must-fix, 3
  should-fix (all applied: deleted_at filter on getOrder, override-aware
  duration math on add/remove, audit trim) + 3 nits (migration filename
  fixed in spec 06 doc).
- **Spec 07 — DONE** (commits `feat: implement spec 07 (sms notifications)`
  (8ca57b4) — first-pass code-review should-fix items were applied in that
  same commit — plus the later second-pass follow-up `fix(sms): apply spec
  07 code-review nits` (286d627) which adds a zod-parse on the reminder
  body and a `console.warn` on unknown `provider_message_id` in the
  webhook). Migration `0008_sms.sql`: `sms_templates` (pk `type`) seeded
  with placeholder Slovak text (PRD §13#4 final wording TBD);
  `sms_messages` (append-only outbound log) with three indexes
  (`order_id`, `status`, `provider_message_id`); RLS deny-by-default on
  both; the `pg_cron` + `pg_net` job `sms-reminders` (every minute) that
  POSTs to `/api/reminders` with `x-reminder-secret`. URL/secret are read
  from per-database GUCs (`app.reminder_url`, `app.reminder_secret`); the
  cron command exits with a NOTICE when either GUC is unset (avoiding
  minute-by-minute 401 noise in local dev where the GUCs are never set).
  Provider adapter `lib/sms/provider.ts` with a `fake` impl (default,
  `.env.example`); the real Slovak provider is still TBD per PRD §13#4 /
  architecture §1; `getSmsProvider()` throws on any unknown `SMS_PROVIDER`
  rather than silently falling back. The fake adapter's magic-phone
  failure (used by e2e to exercise the dispatch error path) is gated
  behind `SMS_FAKE_ALLOW_FAILURE=1`, set only in dev/CI `.env.local` —
  production never trips it on a real customer number.
  Rendering: `lib/sms/render.ts` substitutes `{cas}` / `{spz}` / `{nazov}`,
  leaves unknown tokens in place (typo doesn't ship raw), `smsSegmentCount`
  reports 70/67 GSM-with-diacritics segments. Dispatch: `lib/sms/dispatch.ts`
  logs a `pending` row first (so a crash mid-send still leaves a visible
  trace), then updates to `sent`/`failed`; if the failure-update itself
  fails, logs via `console.error` instead of silently returning a misleading
  `pending` row. `lib/sms/wire.ts` subscribes the ready SMS to ORDER_READY
  (spec 06) — imported at the top of `lib/actions/orders.ts` so the
  listener is registered before `setStatus` emits; the same `readyListener`
  constant is module-scoped + an explicit `registered` flag guards against
  future multi-bundle splits.
  Server actions in `lib/actions/sms.ts`: `getOrderSms` (both roles),
  `getSmsTemplates` (read; both roles), `saveSmsTemplate` (manager,
  `sms.template_save` audit), `resendSms` (manager; creates a NEW attempt
  row and audits `sms.resend` — old failure row retained per spec §2.6).
  Route Handlers: `POST /api/reminders` (auths `x-reminder-secret`; selects
  orders whose start is in `reminderWindow(now)` = ±2 min around now+30,
  status `vytvorena`, `deleted_at IS NULL`, `reminded_at IS NULL`; stamps
  `reminded_at` via `UPDATE … WHERE reminded_at IS NULL … SELECT id` and
  gates on row count, so two interleaved cron fires don't both dispatch;
  per-order SMS failure doesn't abort the batch) and `POST /api/sms/webhook`
  (header-only `x-sms-webhook-secret`; query-string secret fallback removed
  to avoid log leakage; zod-validates body; unknown `provider_message_id`
  → 200 + log; malformed → 400).
  UI: `/settings/sms-templates` (manager-only) with per-template live
  char counter (70/segment); SMS section on `/orders/[id]` showing every
  attempt with status badge + resend button (manager only). Menu link
  added.
  Tests: unit `tests/unit/sms/{render,reminder-window}.test.ts`; e2e
  `sms-ready` (success + forced failure; status transition succeeds
  either way), `sms-reminder` (401, idempotency via `reminded_at`,
  exclusion of deleted/non-`vytvorena`/out-of-window), `sms-webhook`
  (401/400/200 unknown id/delivered/failed), `sms-permissions` (worker
  → 403 on templates page, no resend button on order; manager →
  template save with audit, resend creates new attempt). **109 unit +
  55 e2e pass on a clean `pnpm supabase db reset`.**
  First code-reviewer pass returned 0 must-fix, 5 should-fix (all applied
  in 8ca57b4: magic-phone gated by `SMS_FAKE_ALLOW_FAILURE`, `?secret=`
  query fallback removed, dispatch update error logged, cron skips when
  GUCs unset, `wire.ts` `registered` flag) + 2 nits (both applied:
  empty-body counter shows "0 SMS", `0007_sms.sql` → `0008_sms.sql`
  typo in spec). A second pass after commits surfaced 1 should-fix on
  spec 06 (flaky toast assertion in `order-noshow-revert.spec.ts` — see
  71a5983) and 4 nits split across both specs; the spec 06 nits landed
  in 71a5983 (`removeOrderWorker` `deleted_at` guard, unused `useMemo`
  import) and the spec 07 nits in 286d627 (reminder zod-parse, webhook
  `console.warn` on unknown id).
  Deliberate carry-overs: the real Slovak SMS provider adapter is NOT
  pinned (PRD §13#4 open — final wording AND provider both TBD); local
  dev currently sends nothing because the fake adapter is the default;
  production deploy needs to (a) `alter database … set app.reminder_url
  = …` and `app.reminder_secret = …` on the Supabase DB and
  (b) configure the Cloudflare Access bypass policy for `/api/sms/webhook`
  (the one path the provider can't authenticate to).

- **Spec 08 — DONE.** Client detail & service history. Pure shaping helper
  `lib/clients/history.ts` (`buildCarHistories`): groups orders by `car_id`,
  **filters `deleted_at`** (cancelled bookings hidden) and **keeps
  `nedostavil_sa`** (no-shows visible — PRD §10), sorts newest-first, maps
  service lines (incl. **removed lines, marked** — unlike the live order total),
  worker display names, and a per-car `shared` flag. The filtering lives in the
  helper (not the query) so the unit test is the honest gate. New action
  `getClientWithHistory` in `lib/actions/clients.ts` (added **alongside**
  `getClientWithCars`, which `/orders/new` still uses): loads client + linked
  cars, then **all** orders for those `car_id`s with **no `client_id` filter**
  (PRD §13#1 shared-car aggregation — dad's 5 + son's 1 = both see 6), nested
  `order_services` + `order_staff(staff)`, and computes `sharedCarIds` from
  `client_cars` (car linked to >1 client). The `order_staff→staff` embed has two
  FKs (staff_id, assigned_by) so the typed client can't resolve it — cast
  `as unknown as HistoryOrderInput[]`; runtime shape verified by e2e. UI: the
  spec-02 dashed placeholder in `components/clients/client-detail.tsx` is
  replaced by a per-car history section (`data-section="history"`,
  `data-car-id`): ŠPZ + model header, "zdieľané auto" `Badge` when shared,
  newest-first entry list where each entry is a **`Link` to `/orders/[id]`**
  (read-only — edits happen on the order) showing date·time, `STATUS_STYLE`
  badge (incl. grey `nedostavil_sa`), services (removed ones `line-through`),
  workers, note; empty-state "Zatiaľ žiadna história". `/clients/[id]/page.tsx`
  now calls `getClientWithHistory`. Order detail already linked back to client
  history (spec 06) and the calendar block → order detail (spec 05), so task 3
  was verification-only. Tests: unit `tests/unit/clients/history-aggregation.test.ts`
  (5 tests: shared 5+1=6, deleted-excluded/no-show-kept, newest-first, snapshot
  names+removed-marked+workers+note, grouping/empty); e2e `client-history.spec.ts`
  (search phone → cars + history incl no-show, click → order; shared ŠPZ shows
  both clients' orders + hint, count=2 on both pages) + `client-history-permissions.spec.ts`
  (both roles view; history section has no mutating controls). New e2e helper
  `seedOrderFor({clientId, carId, status, workerEmail})` in `support.ts`.
  Adding the ŠPZ to the history header made it appear twice on `/clients/[id]`,
  so four existing specs' `getByText(spz, exact)` detail-page assertions were
  scoped with `.first()` (clients-audit, clients-permissions, clients-search,
  shared-spz). **114 unit + 59 e2e pass on a clean `pnpm supabase db reset`.**
  Code-reviewer pass returned 0 must-fix, 1 should-fix + 2 nits. Applied:
  zod uuid validation at the `getClientWithHistory` boundary (invalid id →
  null → 404); the history status badge no longer reuses
  `STATUS_STYLE[*].bg` (its calendar-block `line-through`/`opacity` struck
  through the `nedostavil_sa` label) — replaced by a clean per-status
  `HISTORY_STATUS_BADGE` map in `client-detail.tsx`. Accepted as-is: the
  `as unknown as` cast on the orders query (documented two-FK embed issue,
  e2e-covered); `getClientWithCars` shares the same pre-zod pattern but is
  out of spec-08 scope. Deliberate default: the
  **cancelled-orders-in-history** question (spec 08 §2.2 / open question #5)
  is left at the spec default (hide cancelled, show no-shows) and commented in
  `lib/clients/history.ts` — still open with the client, non-blocking.

- **Spec 09 — DONE.** Manager-only audit-log read view. **No migration** —
  read-only over `audit_log`, whose indexes (`created_at`,
  `(entity_type,entity_id)`, `order_id`) already exist from spec 01. Pure
  `lib/audit/labels.ts`: `ACTION_LABEL` (all ~29 action codes → Slovak) +
  `ENTITY_LABEL` + `summarizeDetails(action, details)` (status from→to via the
  shared `STATUS_STYLE` labels, note/move/assign/paid/…; defensive on
  null/unknown `details`, never throws; unknown action → "" so the UI shows the
  label alone). Pure `lib/audit/cursor.ts`: base64 keyset cursor over
  `(created_at, id)`, split on the LAST "|" (uuid id is unambiguous). Action
  `lib/actions/audit.ts` `getAuditLog` (zod `lib/validation/audit.ts`,
  `requireManager`, filters from/to/actions[]/entityType/orderId, **keyset
  pagination** fetching limit+1; `from`/`to` are Bratislava-local days →
  `bratislavaLocalDayRange` UTC bounds; cursor uses PostgREST row-value
  `or(created_at.lt."ts",and(created_at.eq."ts",id.lt.uuid))` — timestamp
  double-quoted so the tz `+` survives the filter parser, verified the `lt`
  works on a uuid column). UI: `/audit` page (manager-only 403 flow, reads
  `?orderId=`) + `components/audit/audit-view.tsx` (Table: Bratislava time,
  actor_email, Slovak action label, entity **linked via `order_id`** →
  `/orders/[id]` (simpler+correct: order_service/sms rows carry the order in
  `order_id` while `entity_id` is the line/message), details summary; filters =
  native `<input type=date>` + single-select action/entity dropdowns (the
  action accepts arrays for future multiselect — no multiselect/date-picker
  component installed, avoided pulling one in); "Načítať ďalšie" keyset
  pagination; Slovak empty-state). `/audit` link added to `/menu` (manager
  block) and a manager-only "História zmien →" link on `/orders/[id]` →
  `/audit?orderId=`. Tests: unit `tests/unit/audit/{labels,cursor}.test.ts`
  (13: label maps + every written action code covered, summary per shape +
  defensiveness, cursor round-trip/last-pipe-split/malformed). E2e
  `audit-permissions` (worker 403, manager renders), `audit-coverage`
  (full UI lifecycle create→assign→note→status→delete, then `/audit?orderId`
  shows all 5 with actor + "Vytvorená → Hotová"; the test restores
  `opening_hours` to seed defaults first — other suites clobber day 0 = Mon),
  `audit-filters` (orderId/action/date filters; keyset no-dup/no-gap with a
  newer row inserted between page loads). **127 unit + 64 e2e pass on a clean
  `pnpm supabase db reset`.** Retention check (§4.5): 0 anon policies on
  `audit_log`, 4 indexes. Code-reviewer pass: 0 must-fix, 3 should-fix + 4
  nits. Applied: (1) `/audit` guards a malformed `?orderId=` with a uuid
  regex (ignore → unfiltered) so the action's zod can't throw uncaught;
  (2) `decodeAuditCursor` now validates the decoded `id` (uuid) + `created_at`
  (ISO) before they're interpolated into the PostgREST filter — closes an
  injection surface on the client-controlled cursor; (3) the audit table now
  has a mobile stacked-card layout (`<sm`) beside the desktop table (`≥sm`,
  carries `data-section="audit"` for the e2e) per §2.1/§4.6; + nits: auth
  double-check comment, unified `buildArgs` (was `queryArgs`/`applyFilters`
  duplication). Declined with reasoning: a `from<=to` zod `.refine` (would
  reintroduce an uncaught-throw from the client path; empty state is fine);
  debouncing filter changes (YAGNI nit, action is fast). Carry-over: action
  filter is single-select (multiselect deferred, user-accepted); no purge job
  (retain indefinitely per §2.3 — volume tiny); no CSV export (Phase 2).

- **Spec 10 — DONE.** Unpaid-order alerts (manager-only, read-only/derived).
  **No migration** (§2.5 partial index deferred — Phase-1 volume tiny). Pure
  `lib/orders/unpaid.ts`: `isUnpaid` (deleted/`vytvorena`/`nedostavil_sa` never;
  `hotova` OR any non-removed `paid=false` line), `isOverdue(o, todayKey)` via
  `bratislavaDateKey` lexical compare, `unpaidAmountCents` (sums non-removed
  unpaid lines; snapshot is already the line total — no ×quantity). **Key
  interaction documented in that file:** `setStatus`→`zaplatena` does NOT
  cascade lines to `paid` and lines default `paid=false`, so a `zaplatena`
  order is "settled" only once its lines are individually marked paid
  (`setOrderServicePaid`) — intended per-line workflow (PRD §9.3); the
  definition is one-line-tunable if the client wants `zaplatena` alone to mean
  settled (open question, see below). Actions in `lib/actions/orders.ts`:
  `getUnpaidOrders({scope?})` (requireManager; candidate query = not-deleted +
  status in hotova/zaplatena, nested client/car/order_services; filter via
  `isUnpaid`; partition overdue/today; overdue-first then oldest; per-row unpaid
  amount + service names) and `getUnpaidCount()` (lightweight overdue count for
  the badge). Both fetch-and-filter (§2.5-sanctioned for Phase 1; caveat noted
  in `fetchUnpaidCandidates` — narrow via an unpaid-line subquery or the partial
  index if the `zaplatena` history grows). UI: `/unpaid` manager-only page (403
  flow, mints realtimeJwt) + `components/unpaid/unpaid-list.tsx` (red banner when
  overdue>0 "Pozor: {n} … z minulých dní", counts line, Table overdue-first with
  date→order link, client, ŠPZ, services, `formatPriceCents` sum, Po
  termíne/Dnes badge, Slovak empty-state; live-refetch on `orders` +
  `order_services` realtime; **desktop table ≥sm + mobile stacked cards <sm**
  for 360px readability — test hooks `data-section`/`data-order-id`/`data-spz`
  live on the desktop table only, matching the spec-09 strict-mode lesson).
  Header badge `components/unpaid/unpaid-badge.tsx`
  in the home header (manager only — `getUnpaidCount` throws for workers so the
  page calls it only for `manazer`; hidden at 0; links to `/unpaid`; live).
  Menu link added. Tests: unit `tests/unit/orders/unpaid.test.ts` (9, all §4.2
  cases incl. post-hoc unpaid line + removed-line exclusion); e2e
  `unpaid-alerts` (overdue+today seed → badge count, banner text, list
  overdue-first + amount + order links; **live**: paying a line via DB drops the
  row + decrements the count with no reload) and `unpaid-permissions` (worker
  403 on `/unpaid` + no badge; manager renders). New e2e helpers in `support.ts`:
  `bratislavaDateOffset(days)` + `seedDatedOrder({date,status,linePaid})` (can
  seed PAST dates for overdue — future-only seeders couldn't). **137 unit + 68
  e2e pass on a clean `pnpm supabase db reset`.** Code-reviewer pass: 0 must-fix,
  1 should-fix + 1 nit, both applied: header badge now reads "Po termíne: {n}"
  (it counts overdue only — "Nezaplatené" misstated cardinality vs the page's
  "Po termíne" rows); banner uses correct Slovak count-noun agreement via a new
  shared `lib/intl/sk.ts` `skPlural` helper (1 / 2–4 / 5+) with a unit test.

- **Spec 11 — DONE.** Účty (login accounts) & Zamestnanci (workers) split.
  Splits the overloaded `staff` table — which did double duty as login identity
  **and** order-assignable pool — into two: `staff` (logins, **unchanged**:
  `getCurrentStaff`/`requireManager`/`audit_log.actor_staff_id` all still read it,
  zero authz changes) and a new `workers` table (name + `active`, soft-delete, no
  email/no role/no login). Migration `0009_workers.sql`: `create table workers
  (id, display_name, active, created_at)`, partial `workers_active_idx (active)
  where active`, RLS enabled **deny-by-default (0 policies)**; then repoints
  `order_staff` in place — drops the old `staff_id` FK, renames `staff_id →
  worker_id`, adds FK `order_staff_worker_id_fkey → workers(id)`, renames the index
  to `order_staff_worker_idx`. The table name, RLS policy, realtime publication
  entry, PK shape `(order_id, worker_id)` and `assigned_by → staff(id)` (the account
  that performed the assignment) all stay. No data migration: on `supabase db reset`
  the seed runs after migrations and seeds no `order_staff` rows, so the table is
  empty when `0009` runs. `supabase/seed.sql` seeds 3 active workers (Peter, Jano,
  Marek) for dev + e2e. `database.types.ts` regenerated; `WorkerRow`/`WorkerInsert`
  added to `lib/supabase/types.ts`.
  Validation `lib/validation/workers.ts` (`createWorkerSchema`/`updateWorkerSchema`/
  `setWorkerActiveSchema` — trimmed non-empty name, uuid id, no uniqueness on name).
  Actions `lib/actions/workers.ts` (`listWorkers` active-first/by-name,
  `createWorker`/`updateWorker`/`setWorkerActive`), all `requireManager` + zod +
  audit (`worker.create`/`update`/`activate`/`deactivate`), `revalidatePath("/staff")`
  — **no self-deactivation guard** (workers aren't logins, no lockout risk).
  Orders repoint (`lib/validation/orders.ts` `orderWorkerSchema` `staffId → workerId`;
  `lib/actions/orders.ts` `OrderDetail.workers` type + `getOrder` embed
  `workers:order_staff(*, worker:worker_id(id, display_name, active))` +
  `addOrderWorker`/`removeOrderWorker` validate against `workers`, `worker_id`,
  audit key `worker_id`; `app/orders/[id]/page.tsx` dropdown source `staff →
  workers`, prop `allStaff → allWorkers`). Order-detail UI
  (`components/orders/order-detail.tsx`) reads `workers`: `StaffLite → WorkerLite`,
  `w.staff_id → w.worker_id`, `w.staff → w.worker`. Client history repoint
  (`lib/clients/history.ts` `HistoryOrderInput.workers` shape `staff → worker`;
  `lib/actions/clients.ts` embed `workers:order_staff(worker:worker_id(display_name))`)
  — **the spec-08 `as unknown as HistoryOrderInput[]` cast is gone**: after the split
  `worker_id → workers` and `assigned_by → staff` point to different tables, so
  PostgREST resolves the embed cleanly and a plain `as HistoryOrderInput[]` typechecks.
  Audit `lib/audit/labels.ts` gains four `worker.*` `ACTION_LABEL`s + `worker:
  "Zamestnanec"` `ENTITY_LABEL` (the `order.assign`/`order.unassign` summaries return
  fixed strings and don't read the detail key, so no `summarizeDetails` logic changed
  — only the unit test's detail key moved `staff_id → worker_id`).
  UI: `/staff` now renders **two manager-only blocks** —
  `components/staff/staff-manager.tsx` (**Účty**, heading `<h1>Zamestnanci</h1>` → `<h2>Účty</h2>`,
  `data-section="accounts-manager"`) and the new
  `components/staff/worker-manager.tsx` (**Zamestnanci**, name-only add/edit/
  activate-deactivate, `data-section="workers-manager"`, `data-worker-id`). **Both
  blocks have a client-side hide-inactive toggle** (default: inactive hidden;
  "Zobraziť neaktívne/neaktívnych" reveals them dimmed with the "Neaktívny" badge) —
  pure `useMemo` filter over the already-loaded rows, the actions still return active
  + inactive. `app/staff/page.tsx` loads `listStaff()` + `listWorkers()`, still
  `requireManager` with the 403 view. Tests: unit `tests/unit/validation/workers.test.ts`
  (4) + the moved audit-label key; e2e `tests/e2e/staff-workers.spec.ts` (3: two
  blocks + worker CRUD + hide-inactive; deactivated worker drops out of the order
  dropdown; prevádzka 403). E2e fixtures updated: `seedOrderFor` assigns by
  `workerName` (was `workerEmail`→staff) inserting `worker_id`;
  `order-role-permissions.spec.ts` `staff_id → worker_id`; `staff-permissions.spec.ts`
  + `staff-audit.spec.ts` scoped to the Účty block (two "Pridať" buttons now). **143
  unit + 71 e2e pass on a clean `pnpm supabase db reset`** (the prior counts grew by
  the 4 new worker-validation unit tests and the worker-related e2e). Schema check
  (after reset): `workers` exists, RLS on, **0 policies**; `order_staff` has
  `worker_id` FK → `workers`, **no `staff_id`**, `assigned_by` FK → `staff`, PK
  `(order_id, worker_id)`; seed = 3 workers. Backend code-review pass: **0 blockers,
  2 nits applied.**
  ⚠️ **Intermittent e2e seen during this session (NOT spec 11):** one full-suite run
  failed at `tests/e2e/order-noshow-revert.spec.ts` (the nedostavil_sa → vytvorená
  revert assertion) — the revert was rejected server-side. It is **distinct** from
  the documented `client-history.spec.ts` shared-ŠPZ flake (different test, different
  mechanism). Reproduces only under full-suite DB state (9/10 in isolation on the
  branch, 5/5 on `main`), and `setStatus`/conflict/hours code is untouched by spec 11
  (which only edits the worker embed + add/remove worker actions). Exact trigger not
  pinned (intermittent, full-suite-context-only); the capstone clean-DB full run was
  green (71/71 e2e). Treated as a pre-existing/cross-suite-interference flake, not a
  spec-11 regression — reported, not fixed (same handling as the client-history flake).

### Local environment notes (real, learned this session)
- **pnpm** runs via corepack (`pnpm 11.3.0`); the supabase CLI is a devDependency
  (`pnpm supabase …`). Node 22 (`.nvmrc`).
- `.env.local` is generated from `pnpm supabase status -o env` (gitignored).
- **E2e runs against a production build** (`pnpm build && pnpm start`), not `pnpm dev`:
  Turbopack's HMR websocket fails under the sandbox and blocks hydration, so dialogs/
  forms never become interactive under `pnpm dev` *in the agent sandbox*. Local `pnpm
  dev` in a real terminal is fine. See `tests/README.md`.
- Targeted tests: `pnpm test:unit <path>` / `pnpm test:e2e <path>` (the chained `pnpm
  test <arg>` would send the arg to Playwright only).

### Git state — important
- Commits are **local and unpushed.** The hook `.claude/hooks/block-dangerous-bash.sh`
  blocks `git push … main` and force-push **from inside Claude Code sessions** (the
  user pushes from their own terminal). Don't try to push to `main`; ask the user to.
- `docs/Autoumyvaren-Projektove-Poziadavky-v2.docx` is untracked (pre-existing).

---

## Next steps (implementation)

Implement in spec order; each spec's "Tasks" + "Acceptance criteria" are the checklist.

1. **Specs 01–10 — ALL DONE.** No more feature specs in `docs/specs/`.
2. **Walking-skeleton / production deploy** (architecture §8) is now the main
   remaining work: provision Supabase Cloud EU, the self-hosted VPS, and the
   Cloudflare Tunnel + Access policies; wire the prod env store (Supabase keys,
   `SUPABASE_JWT_SECRET`, SMS provider creds). Spec-07 deploy notes still apply:
   `alter database … set app.reminder_url/app.reminder_secret` for the pg_cron
   reminder, and a Cloudflare Access **bypass** policy for `/api/sms/webhook`.
3. **Pick + pin the real Slovak SMS provider** (PRD §13#4 — provider AND final
   wording both still open; `fake` adapter is the default in dev).
4. **Resolve the client's open questions** (below) and tune where flagged.

These remaining items are deploy/ops + client decisions, not new specs — use
**`spec-writer`** only if a genuinely new feature is requested.

Use the **`spec-writer`** subagent only if a *new* spec is needed; use **`code-reviewer`**
after meaningful changes. The skills in `.claude/skills/` auto-load for migrations, auth,
and order-domain work — follow them.

---

## Non-negotiable conventions (from CLAUDE.md — enforce while coding)

- **Server Actions** for everything except two Route Handlers: the SMS webhook and the
  reminder trigger (spec 07).
- **zod** at every Server Action boundary and the SMS webhook.
- **Every state change writes `audit_log`** with the actor identity.
- **Authz**: every mutating action calls the role helper (`requireManager()` etc.)
  before mutating. Auth is at the Cloudflare edge; the app does authorization only.
- **RLS deny-by-default** on every table; `service_role` server-side only; browser
  Realtime uses a **server-minted JWT** (Supabase is NOT behind Cloudflare — see
  data-model §3.1). Never add an anon read policy exposing client PII.
- **Migrations are checked-in SQL**, never dashboard edits. Never
  `supabase db reset --linked` (hook-blocked).
- **Soft-delete** domain history; never hard-delete orders/services/clients.
- **All user-facing strings Slovak.** Phone = client key. ŠPZ shared across clients.

## Key decisions already made (don't re-litigate)

- 6 `pricing_category` values: `os, suv, van, dod, motorka, stavba`. Durations/prices are
  a full per-(service × category) table (no multiplier), seeded from `docs/services.md`.
- `day_overrides` = per-date closed OR custom hours; wins over weekly `opening_hours`.
- 15-minute slot grid; calendar blocks show ŠPZ + model + finish time.
- Box conflict prevented by a **DB exclusion constraint** (btree_gist), excluding
  deleted + `nedostavil_sa`.
- Status: `vytvorena→hotova` (any role), `hotova→zaplatena` (mgr), `vytvorena→
  nedostavil_sa` (mgr), and the **exception** `nedostavil_sa→vytvorena` (mgr, late
  arrival, re-checks conflict/hours).
- **Multiple workers** per order via `order_staff` M:N (no `assigned_staff_id`).
- Unified fuzzy search (phone/name/ŠPZ) via Postgres **pg_trgm** trigram indexes.
- Reminder SMS via Supabase **pg_cron** → Route Handler, idempotent on `orders.reminded_at`.
- Browsing past day/week history = calendar **date navigation** (spec 05), not a
  separate archive feature.

## Open questions for the client (flagged in specs; not blocking implementation)

1. Final SMS wording + signature (PRD §13#4) — placeholders seeded for now.
2. Split-shift / lunch-break hours — current model is one open–close interval per day
   (spec 04 §2.2). Promote `opening_hours`/`day_overrides` to multiple rows if needed.
3. "Unpaid" definition for alerts (spec 10 §1.2) — **implemented** as `hotova`
   OR any non-removed `paid=false` line (per-line workflow; `zaplatena` alone
   does NOT settle lines). Confirm; tune the one-liner in `lib/orders/unpaid.ts`
   if the client wants `zaplatena` to mean fully settled.
4. Whether `prevadzka` (workers) may see the unpaid-alerts view (spec 10 §1.4)
   — **implemented** manager-only (default). Open the badge + `/unpaid` to
   workers if the client wants it.
5. Whether cancelled (soft-deleted) orders should appear in client history (spec 08 §2.2).
6. Real opening-hours defaults and the exact "/kabína" service modeling (spec 03/04).
7. Účty (login accounts) and Zamestnanci (workers) are **fully separate** (spec 11
   §1.3): a `prevadzka` login is **not** auto-added as an assignable worker. To credit
   a person on an order you add them as a **Zamestnanec** name (separate entry), even
   if they also have a login. Confirm this double-entry is acceptable; if the client
   wants a login to imply a worker, that's a Phase-2 link-worker-to-account feature
   (currently out of scope).

## Gotchas

- Don't build a login page — auth is edge (Cloudflare Access). Local dev uses the
  env-gated dev-auth shim; it must be inert when `NODE_ENV=production`.
- The `sms-reminders` pg_cron job is registered on `supabase db reset`. Its body
  checks the `app.reminder_url` / `app.reminder_secret` GUCs and exits with a
  NOTICE when either is unset — so local dev (where the GUCs are unset) stays
  quiet instead of hammering `/api/reminders` with 401s every minute.
- The SMS delivery webhook is the one route that bypasses Cloudflare Access; it verifies
  `SMS_WEBHOOK_SECRET` in-handler (spec 07 §2.8).
- Calendar/scheduling UI component and the Slovak SMS provider SDK are **TBD** — pick and
  pin the minor when you reach specs 05 / 07 (architecture §1, §9).
