# Continue — handoff for the next agent

**Project:** Autoumyváreň Zemplín — internal reservation system for a single car wash.
**Phase:** Implementation, spec-driven. **All feature specs (01–11) are done.**
**The UI redesign (specs 12–18 in `docs/ui-specs/`) is COMPLETE and all merged to `main`.**
A round of **post-redesign refinements** (calendar dynamic-height cards + axis/spacing,
order-detail panel width, header-mobile-only + sidebar unpaid badge, wizard duplicate hints
/ shared badge / Doplnkové accordion / step-3 note / stepper subtitles) is **done + committed
to `main` locally** and **merged into the specs it touches — 12/14/15/16** (no separate spec
file, per the single-source-of-truth rule in `CLAUDE.md`). Push from your own terminal —
pushing is hook-blocked here. A **TEST deployment is now live** (Coolify + Supabase Cloud
EU + Cloudflare Access) — see the **Deployment status** section below and the full runbook
`docs/deployment.md`. **Production hardening (Phase 4) is NOT done** and the VPS origin is
unhardened (no tunnel) — test/fake data only. Still ahead: the real SMS provider and the
client's open questions. **Last updated:** 2026-06-17.

Read these first, in order: `CLAUDE.md` (conventions), `docs/prd.md` (Slovak
requirements), `docs/architecture.md`, `docs/data-model.md`, `docs/specs/README.md`
(features 01–11), `docs/ui-specs/README.md` (redesign 12–18) + `docs/UI-STRUCTURE.md`.

---

## Deployment status — TEST environment live (2026-06-04)

A **test** deployment is up; **production hardening (Phase 4) is NOT done.**
`docs/deployment.md` is the runbook + source of truth for deploy steps.

**⚠️ Pending on Cloud:** migrations **`0013`–`0018`** are committed + applied locally but **NOT
yet `db push`ed to Cloud**. 0013 added `clients.deleted_at`; **0014 supersedes it** — drops that
column and switches Odstrániť to a **hard-delete cascade** (`delete_client_cascade`). **0015** adds
`orders.price_override_cents` (nullable int, manager-only manual order total). **0016** drops the
`orders_no_box_overlap` exclusion constraint (overlaps are now a soft app-layer check). **0017**
makes `cars.spz` **nullable** (plateless cars) + a `cars_spz_not_blank` CHECK. **0018** adds the
`merge_cars(...)` function (car-merge flow). Run `supabase db push` **with/before** the next app
redeploy; they apply in sequence (harmless). New app code calls `delete_client_cascade`, no longer
references `clients.deleted_at`, reads `orders.price_override_cents` (a fresh checkout without 0015
fails the price-override paths), allows plateless cars (0017), and calls `merge_cars` on a colliding
plate (0018) — a checkout missing 0017/0018 will fail the add-car / edit-plate paths.

**Done (test box):**
- **Supabase Cloud EU** (eu-central-1): migrations `0001–0012` pushed (**`0013`+`0014` pending — see
  above**); reference data loaded via `supabase/seed.prod.sql` (catalog + opening hours +
  manager `staff` row; workers are added in-app). Two Cloud-only gotchas hit + fixed:
  - Cloud pre-installs `pg_trgm`/`unaccent`/`btree_gist` in the **`extensions`** schema, so
    unqualified `gin_trgm_ops` / `box with =` failed on `db push`. Fix: install those three
    in **`public`** (disable in dashboard → the migration recreates them there). `pg_cron`/
    `pg_net` are fine in any schema (referenced as `cron.`/`net.`).
  - service_role/authenticated had **no table grants** on Cloud (the local stack
    auto-grants on create). Fixed by checked-in migration **`0012_role_grants.sql`** (full
    grant to service_role; SELECT on orders/order_services/order_staff to authenticated;
    default privileges for future tables). Symptom was `permission denied for table staff`.
- **App host: Coolify** (Nixpacks — **superseded** the runbook's systemd/Docker §3 draft).
  `nixpacks.toml` upgrades corepack before `pnpm install` (Nixpacks pins corepack 0.24.1,
  which crashes pnpm 11 on Node 22 with `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`).
  `NEXT_PUBLIC_*` must be **build-time** vars in Coolify; the rest are runtime. Deploys from
  GitHub `io39/autoumyvarka-zemplin` (branch `main`).
- **Edge: Cloudflare proxy + Access** gating the hostname; **bypass** policies for
  `/api/sms/webhook` and `/api/reminders`. The pg_cron reminder GUCs (`app.reminder_url` /
  `app.reminder_secret`) still need setting before reminders fire (deployment.md §8).

**Skipped / deferred — the "VPS port" hardening (REQUIRED before real production):**
- **No Cloudflare Tunnel; ports 80/443 are open** on the shared VPS. The app trusts the
  **unsigned** `cf-access-authenticated-user-email` header (`lib/auth/identity.ts`), so a
  directly-reachable origin = header spoofing = full manager impersonation. **Test box only
  — fake data, no real client PII.** Before prod on a dedicated VPS: either the **Tunnel**
  (no open ports, preferred) **or** firewall 80/443 to Cloudflare IP ranges **+**
  Authenticated Origin Pulls (mTLS); ideally also verify the signed `Cf-Access-Jwt-Assertion`
  JWT in-app as defense-in-depth. Recorded in `docs/deployment.md` (header + §5).

**Phase 4 (real production deploy + the hardening above) — NOT started.** Also still open:
pick/pin the real Slovak SMS provider (still `fake`), set the pg_cron reminder GUCs.

**Recent app fixes (committed to `main`, post-redesign; push from your own terminal):**
- **Optional ŠPZ (plateless cars) + car-merge flow** (5 commits, 2026-06-17;
  `73f5edd`→`824e848`→`b070fe9`→`d172fbe`→`e238476`). **Client request:** register a car with
  **no plate yet**. ŠPZ stays the shared-car *linking* key, so the risk was plateless cars
  auto-linking to each other and bleeding one client's history into another's — avoided by
  storing a missing plate as **NULL, never `""`** (NULLs are distinct under the unique index,
  so plateless cars never collide/dedup).
  - **`feat(cars)` `73f5edd`:** migration **`0017`** drops `cars.spz` NOT NULL + adds
    `CHECK (cars_spz_not_blank)`. `optionalSpzSchema` (blank→NULL) + a refine requiring a
    **brand or model when plateless**. `addCarToClient` skips the dedup lookup when plateless;
    `updateCar` can set a plate later. SMS `{spz}` token falls back to the car label, else empty.
    New `formatCarPrimary` (ŠPZ → brand/model → "Bez ŠPZ") display fallback across calendar,
    history, unpaid list, order detail, wizard, audit. Specs 02/07 + data-model updated in place.
    e2e `plateless-car.spec.ts`.
  - **`fix(cars)` `824e848`:** code-review — `UnpaidOrderRow.spz` typed `string|null`; `updateCar`
    rejects clearing the ŠPZ off a **shared** car (would break the shared link).
  - **`docs`/`feat`/`fix` `b070fe9`+`d172fbe`+`e238476`:** **car-merge flow** (spec 02 §2.6). When a
    manager sets a plate already held by **another** car row, the two rows are the same physical car
    → **merge** instead of reject. Migration **`0018`** `merge_cars(source,target,brand,model,cat)` —
    one transaction: reassign the source's orders + `client_cars` to the **existing plated survivor**,
    apply the manager's edited fields, **hard-delete** the empty source (2nd documented soft-delete
    exception after `delete_client_cascade`). `EXECUTE` granted to `service_role` only (no SECURITY
    DEFINER — mirrors `0014`). `updateCar` gains a `confirmMerge` gate (mirrors `allowOverlap`):
    returns `needsMergeConfirm` → the `EditCarDialog` confirm replays with `confirmMerge:true` →
    `mergeInto()` + `car.merge` audit. e2e `car-merge.spec.ts` (merge folds X→Y, both orders+clients
    on survivor, audit; cancel; worker can't reach it). code-reviewer (both rounds) applied: shared-clear
    guard, `merged_clients` counted via `GET DIAGNOSTICS ROW_COUNT` (was over-counted pre-dedup),
    e2e read-race waits, worker-forbidden test. **All 229 unit pass; targeted e2e green on a clean
    `supabase db reset`.** ⚠️ Known: setting a plate that collides is now a **merge**, not the old
    reject; clearing a plate off a *shared* car is still rejected.
- `feat(orders)` (`6a1112f`, 2026-06-17): **optional "ready" SMS toggle on vytvorená →
  hotová.** A **"Odoslať SMS o dokončení"** checkbox sits above the status actions whenever
  `hotova` is an available next status — checked by default, toggleable by **both roles**
  (customer already on site). Unchecking it makes `setStatus` skip the `ORDER_READY` emit
  (no "ready" SMS) and record `sms_suppressed: true` in the `order.status_change` audit
  (rendered "Zrušenie odosielania SMS"). A suppressed (no-row) ready SMS then shows in the
  SMS block as a synthetic **Neodoslaná** entry with an **Odoslať** button (**both roles**,
  for an accidental suppression) → new `sendOrderSms({ orderId, type: "ready" })` action:
  **ready-only**, **idempotent** (returns the existing row if one exists), audited
  `sms.send` ("Manuálne odoslanie SMS"). The manager-only "Poslať znova" on real rows is
  unchanged. Added the shadcn `checkbox` primitive (unified `radix-ui` import). Specs 06
  (§2.2) + 07 (§1.1/§2.6/§2.7/§4.4) updated in place. New/extended e2e in `sms-ready.spec.ts`
  (suppress → no row + audit → Neodoslaná → Odoslať sends a real `sent` row + `sms.send`
  audit). code-reviewer: 1 blocker (sendOrderSms accepted `type:"reminder"` → restricted to
  `z.literal("ready")`) + 3 should-fix (idempotency guard, order-not-found message, audit
  label) applied; `zaplatená`-window and failed-row cases left as-is by design.
- **Overlapping reservations — warn-but-allow** (merged `41fb083`, 2026-06-16; staged
  `9e70fb1`→`0cbf734`→`3e553d4`→`14e8a52`→`85b9ba9`→`d70a29d`→`be69740`→`4168d35`).
  **Client decision** (`docs/navrh-prekryvajuce-rezervacie.md`): two cars may share a box at
  the same time. Migration **`0016_drop_box_overlap_constraint.sql`** drops the hard
  `orders_no_box_overlap` btree_gist exclusion constraint (from `0006`); overlaps are now
  **allowed (unlimited)**. Collision is a **soft, confirmable** app-layer check: pure
  `lib/orders/overlap.ts` + `findBoxOverlaps()` (`lib/actions/orders.ts`) detect live
  overlaps (excluding the order itself, `deleted_at`, and `nedostavil_sa` — those free the
  slot); `createOrder`/`moveOrder`/`addOrderService`/`setStatus`(no-show→active revert)
  return a soft `{ ok:false, conflict, message }` **unless** `allowOverlap: true`, and the UI
  (`components/orders/OverlapConfirmDialog.tsx`) names the clash + retries with
  `allowOverlap`. The confirm is **both-roles** (part of the both-roles create flow, **not** a
  manager-only override — see spec 05 §2.4). `allowOverlap` added to the zod schemas
  (`lib/validation/orders.ts`); `ActionResult` gained a `conflict` field (`lib/actions/result.ts`).
  **Opening-hours checks still apply.** Calendar renders overlaps in **side-by-side lanes**:
  pure `lib/calendar/lanes.ts` `assignLanes` + `components/calendar/placeLanes.ts`, consumed
  by `DayView`/`WeekView`; `BookingCard` reworked (car name + services, dropped time/badge).
  The Step-4 wizard picker reserves a free lane and lets you **pick occupied times**.
  Docs updated across specs 05/06, `data-model.md`, ui-specs 14/16, and the
  `order-duration-conflict` + `supabase-migrations` skills. Tests: unit
  `tests/unit/orders/overlap.test.ts` + `tests/unit/calendar/lanes.test.ts`; e2e in
  `booking-wizard` (pick-occupied → confirm → create), `order-services` (overlapping add),
  `order-noshow-revert`. **⚠️ Known limitation:** the soft check is check-then-insert (not
  atomic) → a **TOCTOU race** with no DB backstop; accepted for a single-operator wash (see
  the Gotchas note + spec 05 §2.4 — **don't re-add a hard constraint to "fix" it**).
  Follow-up `chore` (`a822a9f`) fixed stale exclusion-constraint references in the docs and
  removed the now-dead `23P01` retry loops from the e2e seeders.
- `fix(realtime)` (`c59c63b`): calendar/unpaid live updates broke after a status change —
  `setStatus`'s `revalidatePath("/")` re-minted `realtimeJwt`, which (being a subscription
  dep) churned the channel and dropped the actor's own `postgres_changes` echo in the
  resubscribe gap (other tabs were fine). New `lib/realtime/use-realtime.ts`
  `useRealtimeChannel` decouples token (in-place `setAuth`) from subscription (rebuilds only
  on view/date); `startRealtimeTokenRefresh` + `mintBrowserRealtimeToken` action periodically
  re-mint so an idle tab doesn't cross the 1h TTL. Applied to calendar + both unpaid widgets.
- `feat(wizard)` (`01b3768` → `d9ab28d` → `56c3663`): reworked Step-1 new-client. The
  standalone add-customer button is gone. When the typed search query is a complete
  **unregistered** number, a **"Nový zákazník" row** (`data-new-client`, styled like a client
  result — label left, normalized number right) appears at the **top** of the results list;
  clicking it opens the **new-client dialog with the phone pre-filled** (editable telefón +
  optional meno + **Pridať**) → `createClient` + select + advance. (Iterated from a first
  "inline warning + form" version `01b3768` → result-row + pre-filled dialog `d9ab28d` →
  pinned to top `56c3663`.) **Phone search is ordered substring (not fuzzy/transposed)** —
  verified `456` does not match a `654` phone; fuzzy applies only to names/ŠPZ. Spec 16
  updated; new-client e2e rewritten for the row→dialog flow.
- `chore` (`01d25eb`): favicon (`app/favicon.ico`, from oczemplin.sk).

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
  **Later extended (2026-06-17, see "Recent app fixes"):** optional ŠPZ / plateless cars
  (migration `0017`) + the car-merge flow (migration `0018`, `merge_cars`); spec 02 §2.6 + §4.9/§4.10.
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
  `orders_no_box_overlap` excluding soft-deleted + `nedostavil_sa`
  (**later DROPPED in migration 0016** — overlaps are now a soft check; see the
  overlapping-reservations entry above),
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
  ✅ **Final code-review pass (full branch): 0 blockers, 1 should-fix, 2 nits.** Both
  actionable items applied AND verified: (1) should-fix — `order-role-permissions.spec.ts`
  "multiple workers" pre-check now queries the `workers` table (`active`, ≥2) instead of
  `staff` (the dropdown is fed by `workers` post-split; the old check tested the wrong
  table); (2) nit-2 coverage gap — added a 4th test to `staff-workers.spec.ts`
  ("a deactivated worker still shows on an order they were assigned to") covering spec
  §4.3's history-preservation criterion. Verified green after the fixes:
  `pnpm typecheck` ✓, `pnpm lint` ✓, `pnpm test:e2e staff-workers` (4/4) ✓,
  `pnpm test:e2e order-role-permissions` (3/3) ✓, then a full `pnpm test` on a clean
  `pnpm supabase db reset` ✓. Nit-3 (audit `ENTITY_LABEL` maps both `staff` and `worker`
  → "Zamestnanec") is intentional Slovak — no change. Spec 11 is complete and merged to
  `main` (local; push from your own terminal — pushing is hook-blocked here).

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

1. **Specs 01–11 — ALL DONE.** No more feature specs in `docs/specs/`. Spec 11
   (Účty/login accounts split from Zamestnanci/workers) is implemented, verified, and
   **merged to `main` locally** (push from your own terminal — pushing is hook-blocked
   here). The `feat/spec-11-accounts-workers` branch was merged then deleted.

2. **UI REDESIGN — specs 12–18 in `docs/ui-specs/` — COMPLETE + all merged to `main`.**
   Restructure + reskin the working app to the reference prototype (`docs/UI-STRUCTURE.md`).
   All seven specs written, implemented, and merged. A round of **post-redesign refinements**
   (done + committed to `main` locally) was **folded into specs 12/14/15/16** rather than a
   new spec file — see those specs + the "post-redesign refinements" recap below.

   - **Spec 12 — DONE + merged to `main`** (commit `feat: implement spec 12 (app shell &
     navigation)` `6e4ef89`, merged via `284a60c`; branch `feat/spec-12-app-shell` deleted;
     push from your own terminal — hook-blocked here). Replaced the `/menu` hub with a
     persistent shell: 240px desktop `components/navigation/Sidebar.tsx` + mobile
     `BottomNav.tsx`, both driven by `components/navigation/navItems.ts` (PREVÁDZKA =
     Kalendár/Nová rezervácia/Zákazníci for all roles, confirmed icons Calendar/CalendarPlus/
     Users; SPRÁVA = staff/services/hours/sms-templates/audit behind a manager-only `Settings`
     burger → shadcn `dropdown-menu`, opens upward on mobile). `AppShell.tsx` (server) resolves
     `getCurrentStaff()` → full shell or **chrome-less passthrough** (no-identity → 401 stays
     full-screen). `getCurrentStaff` wrapped in React **`cache()`** (shell+page share one actor
     lookup/request — load-bearing for the single-`<main>` invariant). Shell owns the single
     `<main>`; **container sweep** stripped every page's own `<main>`/outer padding → inner
     `max-w-* div`. **`ForbiddenView` no longer emits its own `<main>`** (a worker on a
     manager-only page resolves an identity, so the 403 renders *inside* the shell — keeps one
     `<main>`, lets them navigate away; `UnauthenticatedView` keeps its `<main>` since it only
     appears in the passthrough). Deleted `app/menu/page.tsx` + all 4 `/menu` links. New e2e
     `tests/e2e/navigation.spec.ts` (8 tests: role gating, SPRÁVA burger nav, active-link,
     single-`<main>` incl. the worker-403 case, no-identity passthrough). Verified:
     `pnpm typecheck`/`lint`/`build` ✓, 143 unit ✓, navigation e2e 8/8 ✓, §4.2 greps ✓
     (0 own `<main>`, 0 `/menu` refs). Code-reviewer: 1 blocker (nested `<main>` on worker-403
     — fixed) + 1 should-fix (sm-range bottom-nav clearance) + 3 nits (distinct nav landmark
     labels Bočná/Spodná, removed redundant `aria-label`s, `min-h-dvh`) — **all applied.**
     ⚠️ The full e2e run flaked on `shared-spz`/`clients-search` (the **pre-existing trigram-
     search flake** — fail/fail/pass in isolation; untouched code, only `<main>`→`<div>` on
     `/clients`). Not a spec-12 regression.
   - **Spec 13 — DONE + merged to `main`** (commit `feat: implement spec 13 (theme reskin
     — Nova preset, fonts, STATE_COLOR)` `638e141`, merged via `16220b6`; branch deleted;
     push from your own terminal). New **`types/index.ts`** = single home for order-status
     presentation: `STATE_LABEL` (Slovak) + `STATE_COLOR` (bg/border/text/badge per status,
     **with `dark:` variants**), palette remapped vytvorená→red, hotová→orange, zaplatená→
     green, nedostavil sa→gray. All 5 call sites migrated off the **deleted**
     `lib/orders/colors.ts` (`STATUS_STYLE`): `calendar.tsx`, `order-detail.tsx`,
     `client-detail.tsx` (its bespoke `HISTORY_STATUS_BADGE` folded into the shared source —
     safe now that `STATE_COLOR.nedostavil_sa` is clean, no strike-through/opacity),
     `lib/audit/labels.ts` (`statusLabel` → `STATE_LABEL[v] ?? v`). `globals.css`: `:root` +
     `.dark` swapped to **neutral (Nova base) oklch** tokens (dark mode stays wired —
     `.dark` block + `@custom-variant dark` kept; **activation toggle deferred**); fonts
     mapped in `@theme inline` to **distinct `next/font` variables**
     (`--font-plus-jakarta-sans`/`--font-jetbrains-mono`) to avoid a self-referential
     `--font-sans: var(--font-sans)` cycle (code-review should-fix); body gets `font-sans`.
     `layout.tsx`: **Plus Jakarta Sans + JetBrains Mono** via `next/font/google`
     (`latin`+`latin-ext` for Slovak diacritics, `display: swap`), `suppressHydrationWarning`.
     `components.json` `baseColor` slate→**neutral** (`style` left `new-york` — `base-nova`
     isn't a CLI style value and has no runtime effect; Nova look comes from the tokens —
     spec §2.3 fallback). Unit `tests/unit/types/state-color.test.ts` (4 keys, palette,
     `dark:` variants). **147 unit + 80 e2e pass.** §4.2/4.3/4.4 acceptance ✓; served CSS
     bundle carries the new palette + `font-family:var(--font-sans)`. Code-reviewer:
     **0 blockers**, applied the font-cycle should-fix + a history-badge intent comment; the
     `StateColor.badge` field is unused until spec 14's `StatusLegend` (intended). ⚠️ The full
     e2e run flaked once on `clients-search` (pre-existing trigram-search flake, baseline-
     confirmed) — not a spec-13 regression.
   - **Spec 14 — DONE + merged to `main`** (commit `feat: implement spec 14 (calendar
     header, date-picker & box filter)` `f02386a`, merged via `5bb987f`; branch deleted;
     push from your own terminal). Rebuilt the calendar header to UI-STRUCTURE §4 and
     **decomposed the ~550-line `components/calendar/calendar.tsx` monolith** (deleted) into
     one-component-per-file: `CalendarView.tsx` (orchestrator — client, state + Realtime),
     `CalendarHeader.tsx`, `DateNav.tsx`, `StatusLegend.tsx`, `BoxFilter.tsx`, `DayView.tsx`,
     `WeekView.tsx`, `BookingBlock.tsx`, `TimeAxis.tsx`. Pure date/grid math + today helpers
     → `lib/calendar/{grid,today,types}.ts` (de-duped from `app/page.tsx`, unit-tested
     `tests/unit/calendar/{grid,today}.test.ts`). New header (top→bottom): actions
     (Nová rezervácia · manager `UnpaidBadge` · **mobile-only identity**, `md:hidden` —
     desktop uses the spec-12 sidebar footer, **user-confirmed**) → centered Deň/Týždeň
     toggle → `DateNav` → legend + mobile box-filter row → grid. **Native `<input type=date>`
     REPLACED** by a shadcn **`Calendar` popover** (`captionLayout="dropdown"` month+year,
     Slovak `sk` locale, Monday start); ◀▶ step day/week; **DNES** pill vs **Späť na dnes**
     via `viewCoversToday`. `StatusLegend` full labels `sm:+` / short labels mobile (first
     consumer of `STATE_COLOR.badge`); `BoxFilter` mobile-only Box 1/Box 2 (no "Obe" — see
     spec §2.5 deviation note). `app/page.tsx` thinned to fetch + `<CalendarView/>`. Added
     shadcn `calendar` + `popover` (**react-day-picker v10 + date-fns v4**); dropped a
     v10-incompatible `table` classNames key from the generated `components/ui/calendar.tsx`.
     Grid/closed-zone/duration math unchanged; block→`/orders/[id]` still a `Link` (popup
     Sheet is spec 15). Code-reviewer: **1 must-fix + 4 should-fix applied** — a **Realtime
     staleness guard** (`currentKeyRef`: a stale pre-navigation channel's refetch can't
     overwrite the new route's blocks — the orchestrator now syncs `blocks` to fresh
     `initialBlocks` on navigation via the render-time key pattern, so the new date-picker
     actually updates the grid), memoized nav callbacks, `md:contents` empty-desktop-row fix,
     cross-month week labels, identity-placement e2e. New e2e `tests/e2e/calendar-header.spec.ts`
     (5); updated `calendar-week-view.spec.ts` (old "Kalendár" h1 gone). **154 unit + 85 e2e
     pass on a clean `pnpm supabase db reset`.** §4.2/4.3 acceptance ✓. ⚠️ Mid-session the
     `shared-spz`/`clients-search` trigram tests failed **deterministically** once the local
     DB accumulated many `TT`-prefixed test clients (4-char ŠPZ-prefix search exceeds the
     result limit) — **all green after `pnpm supabase db reset`**; this is the documented
     accumulated-DB-state flake, not a regression. Carry-over nit: `client-detail.tsx` +
     `booking-form.tsx` still say "Nová objednávka" vs the new "Nová rezervácia" CTA —
     out of spec-14 scope; **spec 16 reworks the booking flow**, fix there.
   - **Spec 15 — DONE + merged to `main`** (commit `feat: implement spec 15 (order detail —
     popup Sheet + page + shared cards)` `706ceb4`, merged via `a0dba67`; branch deleted;
     push from your own terminal). Extracted the 768-line `components/orders/order-detail.tsx`
     into **10 one-per-file cards** under `components/orders/sections/`
     (`BookingStatusBadge`/`BookingStatusActions`/`BookingClientCard`/`BookingCarCard`/
     `BookingServicesList`/`BookingWorkerCard`/`BookingNotes`/`SmsStatusCard`/`ChangeTimeDialog`
     [was MoveDialog]/`DeleteOrderDialog`) — **all `data-*` attrs + labels preserved** so the
     existing order e2e still pass. New `components/orders/OrderDetailBody.tsx` renders the cards
     in **§7 order** (Stav→Akcie→Klient→Auto→Služby→Pracovníci→Poznámka→SMS→status actions),
     owns the `call()` mutation flow (toast + **injected `onRefresh`** — `router.refresh()` on
     the page, **refetch** in the Sheet). `order-detail.tsx` is now the thin page wrapper
     `OrderDetailView` (title/back/audit link + body); heading **"Objednávka"→"Rezervácia"**.
     New `components/orders/BookingDetailSheet.tsx` — **responsive Sheet** (right desktop /
     bottom mobile via `lib/hooks/use-media-query.ts` `useSyncExternalStore`), fetches the new
     read-only **`getOrderDetailBundle({id})`** (`lib/actions/orders.ts` — composes
     `getOrder` + active workers + `listServices` + `getOrderSms`; `getOrder` already gates on
     `getCurrentStaff`; **no mutation/authz change** — spec §2.4-sanctioned) on open, with
     skeleton + error/retry, rendering the **same** `OrderDetailBody`. Calendar wiring:
     `components/calendar/order-sheet-context.ts` (`OpenOrderSheetContext`); `BookingBlock`
     opens the Sheet via context (`<button>`) or falls back to a `/orders/[id]` `<Link>` when
     no provider; `CalendarView` provides the context + renders the Sheet. Note prominence
     restyled **off amber** (now the hotová status color) to an accent left-bar. Relabel:
     "Presunúť termín"→**"Zmeniť čas"** (trigger), dialog confirm→**"Uložiť"**. Added shadcn
     `sheet`. **"Confirm in review" → kept `components/orders/`** (user-confirmed; cards under
     `sections/`). New e2e `tests/e2e/calendar-sheet.spec.ts` (3); updated
     `order-role-permissions`/`order-move-delete` (label rename). **154 unit + 88 e2e pass on
     a clean `pnpm supabase db reset`.** §4.2 ✓ (10 section files, body used by both surfaces).
     Code-reviewer: **0 must-fix**, applied 3 should-fix (stale-fetch guard on rapid block
     switch via a request ref; `sr-only` `SheetDescription` for a11y; `BookingNotes` resync
     across orders — the Sheet reuses the component without remount) + nits (`cn()`, dialog
     confirm label).
   - **Spec 16 — DONE + merged to `main`** (commit `feat: implement spec 16 (Nová rezervácia
     4-step wizard + Zmeniť-čas edit mode)` `8c6452f`, merged via `2498202`; branch deleted;
     push from your own terminal). Replaced `booking-form.tsx` (**deleted**) with a **4-step
     wizard** in `components/orders/wizard/`: `BookingWizard.tsx` (create + edit state machine),
     `BookingStepper`, `WizardActions`, `Step1Client` (spec-02 `searchClients` + new-client
     `createClient` dialog), `Step2Car` (cars + new-car `addCarToClient` dialog, shared-ŠPZ
     `linkExistingCar`), `Step3Services` (Hlavné/Doplnkové `ServiceGroup` + Σ-min/Σ-€ +
     create-only override), `Step4TimeSlot` (Deň/3-dni date control + **Calendar popover** + ◀▶
     + DNES/Späť na dnes; per-day×box **free-slot picker** from `suggestSlots` `limit:48`, past
     slots greyed = MINULOSŤ; **box implicit** in the pick; `data-free-slot` attr — note
     `data-slot` collides with shadcn). Pure `lib/orders/booking.ts`
     (`resolveSelectionLines`/`totalDurationMin`/`totalPriceCents`/`finishHHMM`) + unit tests;
     `addDays` added to `lib/calendar/grid.ts`. `app/orders/new/page.tsx` **dropped the
     `/clients` redirect**; `?clientId=` prefills → step 2. **Edit mode:** new
     `app/orders/[id]/edit/page.tsx` (manager-gated) mounts the wizard with client/car **locked**,
     opens step 3; finish **applies the diff** (service `addOrderService`/`removeOrderService` +
     `moveOrder`, slot move only if changed so keeping the time isn't a self-conflict; on
     mid-diff failure `router.refresh()` re-syncs `originalLines`). `OrderDetailBody` "Zmeniť čas"
     is now a **`<Link>` to the edit route** (deleted `ChangeTimeDialog`). **No Server-Action/
     schema/authz changes** — create/availability actions reused as-is. `client-detail` "Nová
     objednávka" → **"Nová rezervácia"** (deferred from spec 14). **Confirm-in-review: kept
     `components/orders/`** (user-confirmed). The wizard picker **pre-filters** free/open slots,
     so the old "pick a bad slot → server rejects" e2e is UI-prevented: `orders-create-and-conflict`
     was rewritten to assert the **exclusion** (occupied box+time not offered); `createOrder`'s
     conflict/hours checks remain the backstop. e2e: new `booking-wizard.spec.ts` (5: create flow,
     new-client, prefill→step2, edit move+service, prevádzka 403 on edit); migrated
     `audit-coverage` create step + `order-move-delete` (dropped dialog move, kept delete) +
     `order-role-permissions` + `calendar-sheet` (Zmeniť čas now a link); shared
     `pickAFreeSlot`/`wizardGoToDate`/`seedClientWithCar` in `support.ts`. **159 unit + 92 e2e
     pass on a clean `pnpm supabase db reset`.** §4.3 ✓ (no `/clients` redirect). Code-reviewer:
     **2 blockers + 4 should-fix + nits, all applied + verified** — edit apply-diff re-sync,
     override hidden in edit (it wasn't persisted), `Ďalej` gated on pending, 3-day `coversToday`,
     clear `picked` on service-change in edit, lock client step in edit, a11y labels.
     ⚠️ Edit apply-diff is **non-transactional** (several actions); on mid-diff failure it
     re-syncs and the manager retries — documented in `BookingWizard.submit()`.
     - **Follow-up (merged to `main`): interactive day-grid Termín picker** (commit
       `feat: interactive day-grid slot picker in the booking wizard (step 4)` `a37593e`,
       merged `22dd41f`). Replaced step 4's flat free-slot buttons with a **calendar grid**:
       occupied bookings as colored read-only blocks, free time as dashed-green **VOĽNÉ**
       zones, **click a box column → snaps to a 15-min start** (picks if the duration fits;
       hover ghost + selection bar), **MINULOSŤ** past-greying, closed-hours greying. **Deň**
       = 2 boxes side-by-side + shared time axis; **3 dni** = 3 days × 2 boxes on one axis;
       nearest-free **quick-slots** above each box (also the keyboard/AT path; Enter/Space on
       a column picks the nearest free). New pure `lib/orders/slot-grid.ts`
       (`computeFreeZones`/`fitsAt`/`validStarts`/`nearestFreeStarts`/`offsetToStartMin`) +
       unit tests. `Step4TimeSlot` fetches `getCalendar` per visible day + `getDayOverrides`;
       weekly **`hours`** threaded from `/orders/new` + `/orders/[id]/edit` (`getOpeningHours`)
       through `BookingWizard`. Grid range = union of open intervals AND all booking extents;
       columns `overflow-hidden`. Edit mode passes `excludeOrderId` so the order's own slot is
       pickable (dashed outline, excluded from busy + the rendered block/count). **No
       Server-Action/schema/authz changes** — reads reused. Pages widened to `max-w-4xl`. e2e:
       `pickAFreeSlot` clicks a `[data-quick-slot]`; `wizardGoToDate` navigates until the
       target `[data-day]` column appears (race fix). **166 unit + 92 e2e** on a clean reset;
       both views screenshot-verified vs the reference images.
   - **Spec 17 — DONE + merged to `main`** (commit `aa50cc3`).
     Merged the client search page + detail into one **master-detail** `/clients?id=`:
     `app/clients/page.tsx` (server reads `searchParams.id` → `getClientWithHistory`, renders
     `ClientSearch` master + `ClientDetail` detail; side-by-side `sm:+`, stacked mobile; blank
     prompt before selection, "Klient sa nenašiel" for an unresolved id).
     `app/clients/[id]/page.tsx` reduced to `redirect('/clients?id=' + id)` (KEPT — order/wizard
     links + `revalidatePath` target it). `client-search.tsx`: results **meno + telefón only**
     (matchedSpz badge dropped), **sorted by meno**, active-row highlight, click → `?id=`,
     "Nový zákazník" (all roles) **closes its dialog before same-route nav** (else the Radix
     modal `aria-hide`s the new detail — a real bug found+fixed via e2e). `client-detail.tsx`
     restructured: `ClientHeaderCard` (tel:/sms: links; **Nová rezervácia all-roles, available
     with no cars**; Pridať auto all-roles; **Upraviť klienta manager-only**) + per-car
     **accordion** (`CarRow`, manager-only **Upraviť auto**) with per-car **Poradie** + a
     **nested** order accordion (`ServiceHistoryRow`) whose expanded view shows **box · total € ·
     Pracovníci · Poznámka** + an **"Otvoriť objednávku →"** link to `/orders/[id]`. Status
     badges use spec-13 `STATE_COLOR`/`STATE_LABEL`. New shadcn `accordion` primitive (unified
     `radix-ui` import) + accordion keyframes in `globals.css`.
     ⚠️ **One user-approved additive read-only extension** (spec §2.3 wants "box + total €" but
     §1.3 non-goals + redesign rule 1 forbid action/helper changes — I STOPPED and asked, user
     chose "extend read-only query"): `getClientWithHistory`'s **select** and the pure
     `buildCarHistories` helper (`lib/clients/history.ts`) now carry `box`, `ends_at` (→`endsAt`,
     for "čas od–do") and service `price_cents_snapshot` (→ per-order `totalCents` = sum of
     **non-removed** lines). **Read-only/additive only — no schema/authz/mutation change.** New
     pure `poradieFor` helper (oldest visit = 1). Tests: new `clients-master-detail.spec.ts`
     (inline detail, `?id=` refresh/back, `/clients/[id]` redirect, Nová rezervácia→wizard step 2,
     Poradie, worker create+add car); migrated `client-history`, `client-history-permissions`,
     `clients-search`, `clients-permissions` e2e for the accordion (collapsed by default — tests
     now expand) + `?id=` URL + label changes; `history-aggregation` unit extended with
     box/total/endsAt + `poradieFor`. `support.createClientViaUI` updated for `?id=` + "Nový
     zákazník". **169 unit + 97 e2e pass on a clean `pnpm supabase db reset`**;
     typecheck/lint/build green; both views screenshot-verified (desktop side-by-side + mobile
     stacked). Code-reviewer: **0 blockers**; applied 3 should-fix (`aria-current` boolean,
     dropped the duplicate "Žiadne služby." in empty-car content, `hover:no-underline` on
     badge-bearing accordion triggers). No "confirm in review" item was flagged for 17.
   - **Spec 18 — DONE + merged to `main`** (commit `694b779`, merge `6f136d4`). The last
     redesign spec:
     restyle the manager-only SPRÁVA sections + three structural changes (UI-STRUCTURE
     §10/§11). **(1) Merged hours page** — `app/settings/hours/page.tsx` now `Promise.all`s
     `getOpeningHours` + `getDayOverrides` and renders `OpeningHoursEditor` (top) +
     `DayOverridesEditor` (below) on one page; `app/settings/exceptions/page.tsx` reduced to
     `redirect('/settings/hours')` (KEPT as a deep-link; authz still enforced on the target).
     Removed the two leftover "← Späť" back-links from both editors (pre-shell cruft the
     spec-12 sweep missed because they live inside the editor components) + demoted the
     overrides editor `<h1>`→`<h2>` so the merged page has a single page heading.
     **(2) Services accordions** — `services-manager.tsx` wraps the existing Hlavné/Doplnkové
     sections in a shadcn `Accordion` (type="multiple", **default-expanded**; Radix
     `AccordionHeader` keeps the titles as real `<h3>` headings so existing
     `getByRole("heading")` assertions still pass); border on the `Accordion` wrapper (not
     per-item) per the shadcn divider pattern; `data-section="main"|"addon"`. CRUD +
     soft-delete unchanged. **(3) Audit ◀ ▶ paging** — `audit-view.tsx` replaces the infinite
     "Načítať ďalšie" append with prev/next arrows backed by a **client-side page-cursor
     stack** (push on ▶, pop on ◀) over the **unchanged** `getAuditLog` keyset action; ◀
     disabled on page 1, ▶ disabled at the last page, "Strana N" indicator, filters reset to
     page 1. **(4) SMS šablóny** — no change needed (already restyled by the spec-13 global
     theme; no back-link / no `/menu`) — task satisfied. **Confirm-in-review (user-confirmed):
     hours nav label stays "Otváracie hodiny".** UI-only — no schema/Server-Action/authz
     changes. Tests: new `sprava-sections.spec.ts`; migrated `audit-filters` (load-more → ◀▶
     paging, incl. disabled-at-ends + back-nav + a race fix: await the row count before
     snapshotting after a paged click) and `settings-permissions`/`settings-audit` (scoped
     "Otvorenie/Zatvorenie" to `[data-form="override"]` and used **exact** "Uložiť" now that
     both editors share the merged page). **169 unit + 100 e2e pass on a clean `pnpm supabase
     db reset`**; typecheck/lint/build green; `/services` + `/settings/hours`
     screenshot-verified. Code-reviewer: **0 blockers**, 2 should-fix (single page `<h1>`
     applied; SMS task confirmed a no-op) + nits (accordion border on wrapper; precise test
     trigger selector). Acceptance §4.2 greps: exceptions redirect = 1, `/menu` links = 0. ✅
   - **Post-redesign refinements — DONE + committed to `main`** (folded into specs
     **12/14/15/16**, not a separate file; push from your own terminal). Recap of what
     changed:
     **Calendar:** axis labels only at `:00`/`:30` but **all** 15-min lines kept at higher
     contrast (`/25` vs `/40`); `ROW_PX` compressed to **20**; new shared
     **`components/calendar/BookingCard.tsx`** (densities **rich**/**compact**/**line**, +
     `CATEGORY_BADGE` in `types/`) replacing the deleted `BookingBlock`; **`DayView` rewritten
     to a single CSS grid** (`gridTemplateRows: auto repeat(N, minmax(ROW_PX, auto))`,
     bookings as row-spanning grid items) so a single-slot card **grows its rows and pushes
     the grid** while the axis stays aligned (Step-4 keeps a uniform grid — its click-to-pick
     maps Y→time — and truncates instead). `WeekView` uses compact cards; `Step4TimeSlot`
     occupied blocks use **line** density, the **3-day** grid no longer side-scrolls on
     desktop (`useMediaQuery` → `minmax(0,1fr)`), and a box-header row shows `Box N` + the
     reservation count (`skPlural`). The booking card shows time (2 rows, 20px) · `model –
     services` (20px, one row, model semibold) · category badge · `Pozn: …` (20px) when set.
     **Order-detail panel:** Sheet widened to `sm:max-w-lg xl:max-w-xl`, **full-height on
     desktop** (dropped the `90dvh` cap that was cutting it off); shared `OrderDetailBody`
     `space-y-5`, section cards `p-4`, `break-words` on client/car/notes — **section order
     left unchanged** (user-confirmed). **Shell:** `CalendarHeader` is now **`md:hidden`**
     (mobile-only); the manager **`UnpaidBadge` moved to the desktop `Sidebar`** above SPRÁVA
     (`AppShell` mints the Realtime JWT + `getUnpaidCount` for managers and passes them in) —
     the badge now lives in two breakpoint slots (mobile header / desktop sidebar), one
     visible at a time. **Wizard:** live **non-blocking** duplicate-phone (Step 1) and
     duplicate-vehicle (Step 2) hints (debounced `searchClients`, exact `normalizePhone` /
     `normalizeSpz` match — submit stays enabled, the actions de-dupe/link); **zdieľané-auto**
     badge on Step-2 car rows via **`getClientWithCars.sharedCarIds`** (one extra read-only
     query — additive, like spec 17; threaded through `/orders/new` + `/orders/[id]/edit` +
     `BookingWizard`); **Doplnkové** wrapped in a shadcn `Accordion` (**collapsed by default**,
     force-open + `N vybraté` badge when any add-on selected) with **Tepovanie/Čistenie/
     Ostatné** sub-headers via the pure `addonGroup` helper (`lib/orders/booking.ts`, name-
     prefix heuristic, unit-tested); a **Poznámka** field at the bottom of step 3 →
     `createOrder.note` (create) / `setNote` (edit, via `EditContext.originalNote`);
     `BookingStepper` shows the **client name** under Klient
     and **car brand** under Auto. **170 unit + e2e green** (`calendar-header`,
     `calendar-sheet`, `calendar-week-view`, `navigation`, `unpaid-*`, `booking-wizard`, order
     suites) on a clean `pnpm supabase db reset`; typecheck/lint/build clean. E2e touched:
     `unpaid-alerts` badge locator scoped to `:visible`; `calendar-header` "Nová rezervácia"
     assertion repointed to the sidebar nav (the header button was already commented out).
     **Gotcha learned:** keep `pnpm dev` stopped during e2e — Playwright `reuseExistingServer`
     reuses port 3000, and a dev server's HMR websocket fails in the sandbox and **blocks
     hydration** (interaction tests then fail spuriously).
   - **Client-history & order-flow tweaks — DONE + committed to `main`** (commits `cc0c2b2`,
     `a842351`; specs 16/17 updated in place; push from your own terminal): **(1)** client
     history now renders **each vehicle as its own grouped block** (own card + alternating
     `bg-muted/30`↔`bg-muted/60` tint + spacing, `data-car-block`) instead of one shared
     accordion — `components/clients/client-detail.tsx` (spec 17). **(2)** editing an order's
     **time** and confirming now **redirects to the calendar** at the new date (`/?date=…`)
     instead of back to the order detail — `BookingWizard` edit submit; e2e assertion
     repointed (spec 16 §2.9/§4.4). **(3)** the **persistent-client-on-existing-phone**
     requirement needed **no code** — `phoneSchema` normalizes and `clients.phone` is
     `UNIQUE`, so `createClient` returns the existing client (the wizard/page selects it);
     documented in spec 16 non-goals. **(4)** the Clients-page **Nový zákazník** dialog now
     shows the same **non-blocking duplicate-phone hint** as the wizard (debounced
     `searchClients`+`normalizePhone`, `data-dup-phone`) — `components/clients/client-search.tsx`
     (spec 17). Verified: typecheck/lint clean; `booking-wizard` (5/5), `client-history`,
     `clients-master-detail`, `clients-search` e2e green on clean prod builds.
   - **Exceptions date picker — DONE + committed to `main`** (commit `fde175c`; spec 18
     updated; push from your own terminal): the day-overrides (Výnimky) "Dátum" field now
     uses a new shared **`DateField`** (`components/settings/date-field.tsx`) wrapping the
     **same shadcn `Calendar` popover as the main calendar** (`DateNav`) — month + year
     dropdowns, Slovak locale, Monday start — so all date pickers behave identically
     (replaces the native `<input type="date">`). The Otvorenie/Zatvorenie **time** inputs
     stay native `type="time"` + `lang="sk-SK"` (user's choice — native time inputs render
     12h/24h per browser/OS locale and can't be reliably forced to 24h). New e2e helper
     `fillOverrideDate()` drives the popover; `settings-audit`/`settings-permissions`
     repointed. **Full suite green** on a clean `pnpm supabase db reset`: 170 unit + 100 e2e
     (one `clients-search` full-run timeout that passes in isolation — load flake, not a
     regression).

   > **⚠️ RULES — read before touching any code (non-negotiable for this redesign):**
   > 1. **UI-layer only.** Do **not** change the database schema, migrations, Server
   >    Actions, their zod schemas, or authz. If a spec *seems* to need a backend change,
   >    **STOP and ask the user** — don't improvise one. (The actions, RLS, and audit are
   >    done and verified in specs 01–11; the redesign only re-skins/re-arranges the UI.)
   > 2. **Confirm the "confirm in review" defaults with the user BEFORE building the
   >    affected spec** — don't silently accept them. They are: PREVÁDZKA nav icons
   >    (Calendar / CalendarPlus / Users — spec 12), identity placement (sidebar on
   >    desktop vs header on mobile — spec 14), and keeping `components/orders/` rather than
   >    renaming to `booking/` (specs 15/16). Grep the specs for `confirm in review`.
   > 3. **One spec at a time; keep `main` releasable.** Finish + verify + (with the user)
   >    merge a spec before starting the next. Don't batch multiple specs into one branch.
   > 4. **Every Acceptance check must pass** (they're runnable shell/e2e), and run the
   >    **`code-reviewer`** subagent before declaring a spec done.
   > 5. **Don't re-run `spec-writer`** for 12–18 — they already exist.
   > 6. **Slovak** for all user-visible text; **English** identifiers (see spec 13).

   - **Build order:** **12 → 13 → 14 → 15 → 16 → 17 → 18.** Deps are in
     `docs/ui-specs/README.md`. Note **16 builds after 15** (it repoints spec-15's
     "Zmeniť čas" button into the wizard edit mode).
   - **Per spec:** read `docs/ui-specs/NN-*.md` + the cited `UI-STRUCTURE.md` section;
     follow its Tasks; satisfy every Acceptance check; `pnpm typecheck/lint/test/build`;
     `code-reviewer`; commit.
   - **Deferred (don't build yet):** dark-mode **activation** UI (toggle vs follow-OS) —
     spec 13 keeps dark wired but leaves the switch for later.
   - New shadcn primitives several specs add: `dropdown-menu` (12), `calendar`+`popover`
     (14), `sheet` (15), `accordion` (17).

3. **Production deploy — TEST box done, PROD (Phase 4) pending.** A test environment is
   live (Coolify + Supabase Cloud EU + Cloudflare Access) — see the **Deployment status**
   section above and the runbook `docs/deployment.md`. Remaining for real production:
   (a) the **origin hardening** that was deliberately skipped on the shared test VPS —
   Cloudflare **Tunnel** (preferred) or firewall-to-CF-IPs + Authenticated Origin Pulls,
   ideally + in-app `Cf-Access-Jwt-Assertion` verification; (b) set the pg_cron reminder
   GUCs `app.reminder_url` / `app.reminder_secret` (deployment.md §8); (c) stand up the
   dedicated prod VPS + env store. Cloudflare Access bypasses for `/api/sms/webhook` and
   `/api/reminders` are already in place on the test box.
4. **Pick + pin the real Slovak SMS provider** (PRD §13#4 — provider AND final
   wording both still open; `fake` adapter is the default in dev).
5. **Resolve the client's open questions** (below) and tune where flagged.

The redesign specs already exist — **do not re-run `spec-writer` for them.** Use
**`spec-writer`** only if a genuinely new feature is requested; use **`code-reviewer`**
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
- **Known limitation — box-overlap TOCTOU race (accepted, NOT a bug to fix).** Since
  migration 0016 dropped the `orders_no_box_overlap` exclusion constraint, overlap
  detection is a soft app-level *check-then-insert* (`findBoxOverlaps`), not atomic. Two
  simultaneous `createOrder`s can both pass the check and insert with no warning shown.
  Accepted because it's a single-operator wash and overlaps are allowed by design (only the
  warn dialog is lost). Don't re-add a hard DB constraint to "fix" it — that would re-block
  the intended overlaps; use tx + row locking if real concurrency ever appears. Documented
  in spec 05 §2.4 and the `order-duration-conflict` skill.
