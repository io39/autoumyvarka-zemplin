-- 0007_order_staff.sql — M:N order ⇄ staff assignment (spec 06).
-- An order may have several assigned workers; either role may add/remove
-- self or others (PRD §3, data-model §2.14). Assignments are hard add/remove;
-- audit_log preserves the history (`order.assign` / `order.unassign`).

create table order_staff (
  order_id     uuid not null references orders (id) on delete cascade,
  staff_id     uuid not null references staff (id),
  assigned_by  uuid not null references staff (id),
  assigned_at  timestamptz not null default now(),
  primary key (order_id, staff_id)
);

create index order_staff_order_idx on order_staff (order_id);
create index order_staff_staff_idx on order_staff (staff_id);

-- Deny-by-default; grant authenticated SELECT for the live calendar/detail
-- subscription. Writes only happen via Server Actions on service_role
-- (which bypasses RLS).
alter table order_staff enable row level security;

create policy "order_staff authenticated read"
  on order_staff for select
  to authenticated
  using (true);

-- Realtime broadcast so assignment changes propagate to open detail views.
alter publication supabase_realtime add table order_staff;
