# Spec 09 — Audit log view

> **Status:** draft · **PRD refs:** §11 (audit log & logging), §15#9 · **Depends on:**
> 01 (audit write path + auth), 06 (most audited events live on orders) · **Architecture
> refs:** §2 (authz) · **Data-model refs:** §2.11 `audit_log`, §3 (RLS)

The manager-only **read surface** over the audit log. The *write* path ships
incrementally across earlier specs (01 staff, 02 clients/cars, 03 catalog, 04 settings,
06 orders, 07 SMS); this spec adds the browsable, filterable view and confirms the
≥3-month retention requirement (PRD §11.2).

---

## 1. Requirements

### 1.1 What this feature does

1. A **manager-only** page listing `audit_log` entries newest-first: when, who
   (`actor_email`), action, entity, and a human-readable summary of `details`
   (e.g. `vytvorená → hotová`).
2. **Filters:** by date range, by action type, by entity (and by a specific order).
3. **Retention** ≥ 3 months (PRD §11.2) — documented + a check; no purge job in Phase 1
   (data grows slowly), but retention is verifiable.
4. Confirms coverage (PRD §11.1 / §15#9): creation, status change, deletion, note edit,
   worker (re)assignment are all present — the writes were defined in their own specs.

### 1.2 User stories (PRD §11)

- As the **manager**, I can see who created an order and who changed its status and
  when, to resolve "who did this?" questions (PRD §11.1).
- As the **manager**, I can filter to a day, an action type, or a single order to audit
  a specific incident.
- As a **worker**, I cannot access the audit log at all (PRD §11.2).

### 1.3 Non-goals

- No audit **writing** here — that's done at each mutation in specs 01–07. This spec
  only reads.
- No editing/deleting audit entries (append-only — data-model §4).
- No export/reporting beyond on-screen filtering in Phase 1 (could add CSV later).
- No external log shipping / SIEM (out of scope).

### 1.4 Roles (PRD §3, §11.2)

**Manager only.** "Audit log je dostupný iba manažérovi" (PRD §11.2). `prevadzka` gets
the 403 view; the read action also asserts `requireManager()`.

---

## 2. Design

### 2.1 Route & UI

| Route | Access | Purpose |
| --- | --- | --- |
| `/audit` | **manager** | filterable, paginated audit list |

- Table: timestamp (Europe/Bratislava), `actor_email`, action (Slovak label), entity
  type + id (link to the entity where one exists, e.g. order → `/orders/[id]`), and a
  rendered `details` summary.
- Filters: **Od/Do date pickers** (the shared `DateField` — same shadcn `Calendar` popover
  as the calendar/Výnimky, for app-wide consistency), action select, entity-type select,
  optional order id (deep-link from an order detail "história zmien" link).
- Action codes → Slovak labels via a small map (`order.status_change` → "Zmena stavu",
  `order.note_edit` → "Úprava poznámky", `order.assign`/`unassign` → "Priradenie/
  odobratie pracovníka", `order.delete` → "Vymazanie objednávky", `staff.*`, `service.*`,
  `settings.*`, `sms.resend`, …).
- shadcn/ui: `Table`, `DateRangePicker`/`Calendar`, `Select`, `Badge`, pagination.
  Mobile-first ≥360px (table collapses to stacked rows); Slovak copy.

### 2.2 Server Action (`lib/actions/audit.ts`)

| Action | Input (zod) | Authz | Notes |
| --- | --- | --- | --- |
| `getAuditLog` | `{ from?, to?, actions?[], entityType?, orderId?, cursor?, limit? }` | **manager** | paginated, newest-first |

- `requireManager()` first. Query uses the indexes `audit_log(created_at)`,
  `(entity_type, entity_id)`, `(order_id)` (data-model §2.11) for the filter paths.
- **Keyset pagination** on `(created_at, id)` (cursor) rather than offset — stable as new
  rows arrive and efficient for a growing table.
- Read via `service_role` server-side behind the edge gate; RLS deny-by-default means no
  other path can read it.

### 2.3 Retention

- PRD §11.2 requires ≥ 3 months. Phase 1: **retain indefinitely** (volume is tiny —
  a handful of users), so the requirement is satisfied by simply not deleting. Documented
  here; a pruning job is explicitly **not** built (and would risk dropping data still in
  the window). If volume ever warrants, add a scheduled prune that keeps ≥ 3 months.

### 2.4 Error handling & loading states

- `getAuditLog` for `prevadzka` → `ForbiddenError` → 403 view (Slovak).
- Loading skeleton; empty-state "Žiadne záznamy pre zvolený filter".

---

## 3. Tasks

1. **(S)** Action-code → Slovak-label map + `details` summary renderer (per action
   shape) + unit tests. (dep: specs 01–07 action names)
2. **(M)** `getAuditLog` action with zod, `requireManager`, filters, keyset pagination.
   (dep: 1)
3. **(M)** `/audit` page: table, filters, pagination, entity links. (dep: 2)
4. **(S)** "História zmien" link from order detail (spec 06) → `/audit?orderId=…`. (dep: 3)
5. **(M)** Tests: unit (label/summary render, keyset pagination) + e2e (manager filters
   by date/action/order; worker 403; coverage assertion). (dep: 3)

---

## 4. Acceptance criteria

### 4.1 Build, types, lint, tests

```bash
pnpm typecheck   # exits 0
pnpm lint        # exits 0
pnpm test        # exits 0
pnpm build       # exits 0
```

### 4.2 Authorization (e2e, must pass — PRD §11.2)

- As **prevádzka**: `/audit` → 403; `getAuditLog` rejected with `ForbiddenError`.
- As **manažér**: `/audit` renders entries newest-first.

```bash
pnpm test e2e/audit-permissions   # exits 0
```

### 4.3 Filters & pagination (e2e, must pass)

- Filtering by date range returns only entries in that range; by action type returns
  only that action; by `orderId` returns only that order's entries.
- Keyset pagination returns the next page with no duplicates/gaps when new rows are
  inserted between page loads.

```bash
pnpm test e2e/audit-filters   # exits 0
```

### 4.4 Coverage of audited events (e2e, must pass — PRD §15#9, §11.1)

- After performing: create order, status change `vytvorená→hotová`, delete order, note
  edit, worker assignment — `getAuditLog` returns one entry for **each**, with the
  correct `actor_email` and a non-empty rendered summary (`{from,to}` shown for status).

```bash
pnpm test e2e/audit-coverage   # exits 0
```

### 4.5 Retention (check)

```bash
# Append-only: no UPDATE/DELETE policy or trigger mutates audit_log (expect 0 anon
# policies; service_role is the only writer, append-only by app convention):
psql "$LOCAL_DB_URL" -c \
  "select count(*) from pg_policies where tablename='audit_log' and 'anon' = any(roles);"
# Index supporting time-range + entity filters present (expect >=2):
psql "$LOCAL_DB_URL" -c \
  "select count(*) from pg_indexes where tablename='audit_log';"
```

### 4.6 Manual checks

- [ ] `/audit` readable at 360px (rows stack); timestamps in Europe/Bratislava.
- [ ] Action labels and `details` summaries are Slovak and human-readable.
- [ ] Entity links resolve (order entries link to `/orders/[id]`).
- [ ] From an order detail, "história zmien" opens `/audit` pre-filtered to that order.
