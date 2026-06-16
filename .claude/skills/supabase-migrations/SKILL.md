---
name: supabase-migrations
description: Use when writing or changing the database schema — creating tables, columns, enums, indexes, RLS policies, or constraints. Encodes this project's migration conventions (checked-in SQL, deny-by-default RLS, the box-overlap exclusion constraint, soft-delete).
---

# Supabase migration conventions

Schema changes in this project are **checked-in SQL migrations only**. Never modify
the live schema through the Supabase dashboard — write a migration, check it in,
`supabase db push`. Authoritative schema: `docs/data-model.md`.

## Workflow

1. Create a migration: `supabase migration new <kebab_description>` →
   `supabase/migrations/<timestamp>_<desc>.sql`.
2. Write idempotent-friendly DDL. Apply locally with `supabase db reset` (re-runs all
   migrations + `supabase/seed.sql`) and verify before committing.
3. Commit the migration file with a `feat:`/`chore:` message. Migrations are immutable
   once pushed — fix forward with a new migration, never edit a pushed one.
4. `supabase db push` applies to the linked project. **Never** run
   `supabase db reset --linked` (blocked by hook — it wipes prod data).

## Required patterns

**RLS deny-by-default on every table.** The primary gate is edge auth + Server-Action
role checks; RLS is defense-in-depth. Enable RLS and add **no `anon` policies** so the
public anon key grants nothing. `service_role` (server-side only) bypasses RLS.

```sql
alter table <t> enable row level security;
-- no anon policies; reads for the browser go through a minted JWT (data-model §3.1)
```

**Box-overlap is NOT a DB constraint** (migration 0016 dropped `orders_no_box_overlap`).
Overlapping reservations are allowed; collision is a **soft, confirmable** check in the
action layer (`findBoxOverlaps` + `allowOverlap`, see the order-duration-conflict skill).
The original `0006` exclusion constraint (`exclude using gist (box with =,
tstzrange(starts_at, ends_at) with &&)`) is **historical** — don't re-create it. The
`btree_gist` extension stays installed (cheap; may be reused). Opening-hours enforcement is
unchanged (app-level).

**Soft-delete, never hard-delete domain history.** Use `deleted_at timestamptz` (orders,
order_services) or `active boolean` (staff, services). Preserve FK references for history
integrity (PRD §9.1, §10). **One documented exception:** a manager **client** delete is a
permanent cascade (`delete_client_cascade`, migration `0014`) that erases the client + their
orders/history + non-shared cars; the append-only `audit_log` is kept (spec 17 §2.6).

**Money** as integer cents. **Timestamps** as `timestamptz`. **PKs** `uuid default
gen_random_uuid()` unless a natural key fits (e.g. `opening_hours.day_of_week`).

**Index authorization-hot columns.** Always index columns used in lookup/authz paths —
notably `staff.email` (unique), `clients.phone` (unique), `cars.spz` (unique), and the
calendar range columns `orders(box, starts_at)`.

## Don't

- Don't put secrets or data-dependent values in migrations.
- Don't disable RLS to "make it work" — fix the access path instead.
- Don't hard-delete rows that appear in client history or the audit log.
