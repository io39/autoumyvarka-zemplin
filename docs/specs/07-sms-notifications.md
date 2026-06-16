# Spec 07 — SMS notifications

> **Status:** draft · **PRD refs:** §8 (SMS), §6 (transitions), §15#7 ·
> **Depends on:** 05 (orders), 06 (the `ORDER_READY` hook) · **Architecture refs:** §1
> (Route Handlers for webhook + reminder), §6 (pg_cron scheduler), §3.2 (env) ·
> **Data-model refs:** §2.9 `sms_messages`, §2.10 `sms_templates`, §2.7 `orders`
> (`reminded_at`), §3 (RLS)

Two automated SMS per order (PRD §8): a **30-minute reminder** before the slot, and a
**"car ready"** message when the order moves to `hotová`. Plus the provider **delivery
webhook**, **failure logging + retry** visible on the order, and editable Slovak
templates. The two Route Handlers in the architecture (webhook + reminder trigger) are
introduced here — everything else is Server Actions.

---

## 1. Requirements

### 1.1 What this feature does

1. **"Ready" SMS:** on the `vytvorena → hotova` transition (the `ORDER_READY` event,
   spec 06), send the "auto je pripravené" message (PRD §8) — **unless the operator
   unchecked the "Odoslať SMS o dokončení" toggle** on the status actions (spec 06 §2.2):
   `setStatus({ sendSms: false })` suppresses the emit, so no `ready` SMS is sent.
   Default is to send.
2. **30-minute reminder:** ~30 min before `starts_at`, send the reminder — unless the
   order was deleted or is no longer `vytvorena` (PRD §8). Fired by `pg_cron` →
   reminder Route Handler (architecture §6); idempotent via `orders.reminded_at`.
3. **Delivery webhook:** the provider posts delivery status to a Route Handler; update
   the `sms_messages` row. zod-validated, secret-verified.
4. **Failure visibility + retry:** failed sends are logged and shown on the order
   detail; the manager can **retry** or knows to call the client (PRD §8).
5. **Editable templates** (`sms_templates`): simple Slovak placeholders now, replaced by
   the client's final wording later (PRD §13#4); 70-char diacritics limit respected.
6. SMS sends/failures are recorded; status changes already audited by spec 06.

### 1.2 User stories (PRD §8)

- As a **client**, I get a reminder 30 minutes before my slot and a message when my car
  is ready — without anyone calling me.
- As the **manager**, when an SMS fails I see it on the order and can resend or phone the
  client, so no one is left uninformed.
- As the **manager**, I can edit the message wording when the client finalizes it.

### 1.3 Non-goals

- No marketing/bulk SMS, no two-way SMS conversations.
- No automatic pricing in messages (Phase 2 / POS).
- No provider selection in this spec beyond an **adapter interface** — the concrete
  Slovak provider + SDK is chosen and its minor pinned at implementation (architecture
  §1); the spec is written provider-agnostic.
- No reminder for orders already past `vytvorena` or deleted.

### 1.4 Roles (PRD §3)

Editing templates and retrying a failed SMS are **manager-only** (administrative).
Sending is automatic (system-triggered), not a user action. Workers see SMS status on
the order detail but don't manage it.

---

## 2. Design

### 2.1 Provider adapter

- `lib/sms/provider.ts` — a minimal interface: `send({ to, body }) →
  { providerMessageId } | throws`. One concrete implementation for the chosen Slovak
  provider; a `fake` implementation for local/dev/tests (logs, never sends).
- Selected via env (`SMS_PROVIDER`, `SMS_PROVIDER_API_KEY`). In local/dev the `fake`
  adapter is the default so no real SMS is ever sent during development.

### 2.2 Templates & rendering

- `sms_templates` (data-model §2.10): one row per `sms_type` (`reminder`, `ready`),
  `body` with placeholders (e.g. `{cas}`, `{spz}`, `{nazov}`).
- `lib/sms/render.ts` — `render(type, order) → string`, substituting placeholders;
  **warns/validates** against the **70-char** GSM-with-diacritics limit (PRD §8) — over
  the limit is flagged in the template editor and counted (1 SMS = 70 chars w/ diacritics
  vs 160 without).
- Seed simple Slovak placeholders (replaced later, PRD §13#4), e.g.
  - reminder: `Dobrý deň, pripomíname termín umytia auta o {cas}. Autoumyváreň Zemplín.`
  - ready: `Vaše auto {spz} je umyté a pripravené na vyzdvihnutie. Autoumyváreň Zemplín.`
  (final wording + signature per client; the editor shows the char count.)

### 2.3 "Ready" SMS (Server Action path)

- Spec 06's `setStatus(vytvorena → hotova)` emits `ORDER_READY` after commit **unless
  the call carried `sendSms: false`** (the operator unchecked the toggle) — in that case
  no event fires and no `ready` SMS row is created. A handler
  in `lib/sms/dispatch.ts` (called in the same Server Action flow) renders the `ready`
  template, inserts an `sms_messages` row (`type='ready'`, `status='pending'`), calls the
  provider adapter, and updates the row to `sent` (+ `provider_message_id`) or `failed`
  (+ `error`). The status transition succeeds regardless of SMS outcome — a failed SMS
  never blocks marking the car ready; it surfaces as a failure on the order.

### 2.4 30-minute reminder (Route Handler + pg_cron)

- **Route Handler** `app/api/reminders/route.ts` (POST): authenticated by
  `REMINDER_TRIGGER_SECRET` (architecture §6). Selects orders where
  `starts_at` is within the next ~30 min window, `status='vytvorena'`,
  `deleted_at IS NULL`, and `reminded_at IS NULL`; for each: render `reminder`, insert
  `sms_messages` (`type='reminder'`), send via adapter, set the row status, and stamp
  `orders.reminded_at` (idempotency — architecture §6). zod-validate any payload.
- **pg_cron** job (in a migration): every minute, `pg_net` POST to the Route Handler
  with the secret. A duplicate fire is harmless because `reminded_at` gates re-send.
- **Window choice** documented: select `starts_at BETWEEN now()+30min-ε AND
  now()+30min+ε` (ε = cron period) so each order is caught exactly once; `reminded_at`
  is the hard guard against doubles.

### 2.5 Delivery webhook (Route Handler)

- `app/api/sms/webhook/route.ts` (POST): the provider posts delivery status. **Verify**
  the shared `SMS_WEBHOOK_SECRET` (and/or provider signature); **zod-validate** the body
  at the boundary (CLAUDE.md). Map `provider_message_id` → `sms_messages` row, update
  `status` (`delivered`/`failed`), `delivered_at`, `error`. Unknown id → 200 + log (no
  crash); bad signature → 401.

### 2.6 Failure visibility & retry

- Order detail (spec 06) shows each `sms_messages` row: type, status, time, error.
- `resendSms({ smsId })` Server Action (manager-only): re-renders + re-sends a `failed`
  (or any) message, inserting a **new** `sms_messages` attempt (keeps the failure
  history) rather than mutating the old row. Audited as `sms.resend`.
- **Suppressed "ready" SMS** (spec 06 §2.2): a `hotova` order with **no `ready` row** is
  rendered in the SMS block as a synthetic **Neodoslaná** entry (no DB row — derived) with
  an **Odoslať** button. `sendOrderSms({ orderId, type: "ready" })` Server Action (**both
  roles**, mirroring the automatic ready-send which either role triggers) dispatches it via
  the same `lib/sms/dispatch.ts` path, creating a real `sms_messages` row that then replaces
  the synthetic entry. Audited as `sms.send`. It is **restricted to `ready`** (no manual
  reminder — reminders stay gated behind the cron `reminded_at` idempotency) and is itself
  **idempotent**: if a `ready` row already exists it returns the existing one without
  re-dispatching, so a double-tap can't send twice. (Distinct from `resendSms`, which is
  manager-only and acts on an existing attempt row.)

### 2.7 Server Actions & Route Handlers summary

| Endpoint | Kind | Auth | Purpose |
| --- | --- | --- | --- |
| `getOrderSms({ orderId })` | Server Action | both | list SMS attempts for an order |
| `getSmsTemplates` / `saveSmsTemplate` | Server Action | manager (save) | view/edit templates |
| `resendSms({ smsId })` | Server Action | manager | manual resend; audit `sms.resend` |
| `sendOrderSms({ orderId, type: "ready" })` | Server Action | both | send a suppressed `ready` SMS (idempotent); audit `sms.send` |
| `POST /api/reminders` | Route Handler | `REMINDER_TRIGGER_SECRET` | pg_cron → send due reminders |
| `POST /api/sms/webhook` | Route Handler | `SMS_WEBHOOK_SECRET` | provider delivery callbacks |

### 2.8 Data & migrations

Migration `0008_sms.sql`:
- `sms_messages` + `sms_templates` per data-model §2.9–§2.10, indexes
  (`sms_messages(order_id)`, `(status)`, `(provider_message_id)`).
- Seed the two `sms_templates` rows (placeholder Slovak text above).
- RLS deny-by-default (supabase-migrations skill). Route Handlers use `service_role`
  server-side; the webhook is unauthenticated-to-Cloudflare (it's a provider callback)
  so it must be reachable — exposed as a public route but **secret-verified** in-handler.
- pg_cron + pg_net setup for the reminder trigger (architecture §6).

> **Note (webhook ingress):** the delivery webhook is the one path that bypasses
> Cloudflare Access (external provider can't authenticate to Access). It is exposed via
> a Cloudflare Access **service token / bypass policy** for that route only, and the
> handler verifies `SMS_WEBHOOK_SECRET`. Confirm the exact bypass mechanism at deploy.

### 2.9 Error handling

- Provider/adapter errors → `sms_messages.status='failed'` + `error`; never throw out of
  the status-transition flow (ready SMS) or the cron handler (one failed order doesn't
  abort the batch).
- All Route Handler inputs zod-validated; bad secret → 401; malformed body → 400.

---

## 3. Tasks

1. **(M)** Migration `0007_sms.sql` (tables, indexes, RLS, template seed) + pg_cron/
   pg_net reminder job. (dep: 05, 06 migrations)
2. **(M)** `lib/sms/provider.ts` adapter interface + `fake` impl + one real provider
   impl (pinned minor); env wiring. (dep: 1)
3. **(M)** `lib/sms/render.ts` (placeholder substitution + 70-char diacritics
   counter/validation) + unit tests. (dep: 1)
4. **(M)** `lib/sms/dispatch.ts` + wire `ORDER_READY` (spec 06) → ready SMS. (dep: 2, 3)
5. **(M)** `POST /api/reminders` Route Handler (window query, idempotent via
   `reminded_at`, batch-safe) + secret auth. (dep: 2, 3)
6. **(M)** `POST /api/sms/webhook` Route Handler (secret verify + zod + status update).
   (dep: 1)
7. **(S)** Template editor UI (manager) with live char count; SMS status list + resend
   button on order detail (spec 06). (dep: 3, 4)
8. **(M)** Tests: unit (render/limit, reminder window selection, idempotency) + e2e/
   integration (ready SMS on hotová via fake adapter; reminder skips deleted/non-
   `vytvorena`; webhook updates status; resend creates new attempt; worker can't edit
   templates/resend). (dep: 4–7)

---

## 4. Acceptance criteria

### 4.1 Build, types, lint, tests

```bash
pnpm typecheck   # exits 0
pnpm lint        # exits 0
pnpm test        # exits 0
pnpm build       # exits 0
```

### 4.2 Migration, seed, RLS, scheduler

```bash
supabase db reset   # applies 0007 + template seed, exits 0
# Two templates seeded (expect 2: reminder, ready):
psql "$LOCAL_DB_URL" -c "select type from sms_templates order by type;"
# RLS deny-by-default (rowsecurity=t, 0 anon policies):
psql "$LOCAL_DB_URL" -c \
  "select tablename, rowsecurity from pg_tables \
   where tablename in ('sms_messages','sms_templates') order by 1;"
psql "$LOCAL_DB_URL" -c \
  "select count(*) from pg_policies \
   where tablename in ('sms_messages','sms_templates') and 'anon' = any(roles);"
# pg_cron reminder job registered (expect >=1):
psql "$LOCAL_DB_URL" -c "select count(*) from cron.job where command ilike '%reminders%';"
```

### 4.3 Template render & 70-char limit (unit, must pass)

- `render('ready', order)` substitutes `{spz}` etc.; output is a non-empty string.
- A body with diacritics > 70 chars is flagged over-limit; ≤ 70 is single-SMS; the
  counter reports the right segment count.

```bash
pnpm test sms/render   # exits 0
```

### 4.4 "Ready" SMS on transition (integration, fake adapter, must pass — PRD §15#7)

- `setStatus(vytvorena → hotova)` inserts one `sms_messages` row `type='ready'`,
  `status='sent'` (fake adapter), linked to the order.
- If the adapter throws, the row is `status='failed'` with `error`, **and the order is
  still `hotova`** (SMS failure doesn't block the transition).
- With the **"Odoslať SMS o dokončení" toggle unchecked** (`sendSms: false`), the order
  still moves to `hotova` but **no `sms_messages` row is created**, and the
  `order.status_change` audit detail carries `sms_suppressed: true`. The SMS block then
  shows a **Neodoslaná** entry with an **Odoslať** button; clicking it (either role) sends
  the `ready` SMS — a `type='ready'`, `status='sent'` row appears and `sms.send` is audited.

```bash
pnpm test integration/sms-ready   # exits 0
```

### 4.5 Reminder logic (unit + integration, must pass)

- The window query selects an order 30 min out that is `vytvorena`/not-deleted/not-
  reminded; **excludes** deleted, non-`vytvorena`, and already-`reminded_at` orders.
- Calling `POST /api/reminders` twice sends **once** (second run finds nothing —
  `reminded_at` set). Wrong/absent secret → 401.

```bash
pnpm test integration/sms-reminder   # exits 0
curl -s -o /dev/null -w '%{http_code}' -X POST localhost:3000/api/reminders   # 401 without secret
```

### 4.6 Delivery webhook (integration, must pass)

- A valid webhook with a known `provider_message_id` updates the row to
  `delivered`/`failed` + `delivered_at`. Bad secret → 401; unknown id → 200 + logged;
  malformed body → 400.

```bash
pnpm test integration/sms-webhook   # exits 0
```

### 4.7 Failure visibility, resend & authz (e2e, must pass)

- A failed SMS appears on the order detail with its error.
- As **manažér**: `resendSms` creates a **new** attempt (old failure row retained);
  audit `sms.resend`. `saveSmsTemplate` succeeds.
- As **prevádzka**: `resendSms` and `saveSmsTemplate` rejected with `ForbiddenError`;
  SMS status is still visible.

```bash
pnpm test e2e/sms-permissions   # exits 0
```

### 4.8 Manual checks

- [ ] No real SMS is sent in local/dev (fake adapter active).
- [ ] Template editor shows a live diacritics-aware char count and warns past 70.
- [ ] All message text + UI strings are Slovak.
