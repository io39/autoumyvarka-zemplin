-- 0009_workers.sql — split order-assignable workers out of `staff` (spec 11).
-- `staff` stays the login identity (email -> role). A new `workers` table holds
-- the names assignable to an order. `order_staff` is repointed from `staff` to
-- `workers`; `assigned_by` stays a `staff` reference (the account that assigned).
-- On a fresh `supabase db reset` the seed runs AFTER migrations and seeds no
-- `order_staff` rows, so the table is empty here — no data migration needed.

-- ---------------------------------------------------------------------------
-- workers — order-assignable people (name + active). Soft-disable via active;
-- never hard-delete (history integrity, like staff/services).
-- ---------------------------------------------------------------------------
create table workers (
  id           uuid primary key default gen_random_uuid(),
  display_name text not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

comment on table workers is 'Order-assignable people (Zamestnanci). Soft-disable via active; never hard-delete (history integrity). Distinct from staff (login identities).';

create index workers_active_idx on workers (active) where active;

-- Deny-by-default RLS (data-model §3): no anon/authenticated policies; the
-- service_role server client bypasses RLS. The order-detail dropdown reads
-- workers server-side, so no browser read policy is needed.
alter table workers enable row level security;

-- ---------------------------------------------------------------------------
-- Repoint order_staff: staff_id -> worker_id (FK -> workers). Keep the table
-- name, RLS policy, realtime publication entry, and assigned_by (-> staff).
-- ---------------------------------------------------------------------------
alter table order_staff drop constraint order_staff_staff_id_fkey;
alter table order_staff rename column staff_id to worker_id;
alter table order_staff add constraint order_staff_worker_id_fkey
  foreign key (worker_id) references workers (id);
alter index order_staff_staff_idx rename to order_staff_worker_idx;
