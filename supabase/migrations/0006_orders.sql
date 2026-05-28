-- 0006_orders.sql — orders + order_services (spec 05).
-- The central entity. One car, one box, one time slot, a status lifecycle.
-- Conflict prevention is at the DB level via a btree_gist exclusion constraint
-- so the application code cannot violate it (PRD §15#3, data-model §2.7).
-- Realtime read access is granted to the `authenticated` role via RLS; the
-- browser holds a server-minted JWT carrying that claim (data-model §3.1).
-- The bare anon key still reads nothing.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- orders — the central entity (data-model §2.7)
-- ---------------------------------------------------------------------------
create table orders (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients (id),
  car_id        uuid not null references cars (id),
  box           smallint not null check (box in (1, 2)),
  starts_at     timestamptz not null,
  duration_min  int not null check (duration_min > 0),
  -- ends_at is maintained by the trigger below. (`timestamptz + interval`
  -- isn't IMMUTABLE so we can't use a generated column; we keep ends_at as
  -- a regular stored column kept in lock-step with starts_at + duration_min,
  -- so the exclusion constraint sees a stable range.)
  ends_at       timestamptz not null,
  status        order_status not null default 'vytvorena',
  note          text,
  created_by    uuid not null references staff (id),
  reminded_at   timestamptz,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at > starts_at)
);

-- Keep ends_at = starts_at + duration_min on every insert/update. This is the
-- single source of truth for the conflict constraint; the app never has to
-- compute ends_at itself.
create or replace function orders_sync_ends_at()
returns trigger language plpgsql as $$
begin
  new.ends_at := new.starts_at + (new.duration_min || ' minutes')::interval;
  return new;
end;
$$;

create trigger orders_sync_ends_at
  before insert or update of starts_at, duration_min, ends_at
  on orders
  for each row execute function orders_sync_ends_at();

comment on table orders is 'Central reservation entity. Conflict prevented by orders_no_box_overlap (btree_gist).';

-- No two non-cancelled / non-no-show orders may overlap in the same box.
-- Soft-deleted (deleted_at not null) and `nedostavil_sa` orders free their slot
-- (PRD §6, data-model §2.7).
alter table orders add constraint orders_no_box_overlap
  exclude using gist (
    box with =,
    tstzrange(starts_at, ends_at) with &&
  )
  where (deleted_at is null and status <> 'nedostavil_sa');

-- Calendar range queries hit `(box, starts_at)`; the day view also reads by
-- `(starts_at)` regardless of box.
create index orders_box_starts_idx on orders (box, starts_at);
create index orders_starts_idx     on orders (starts_at);
create index orders_client_idx     on orders (client_id);
create index orders_car_idx        on orders (car_id);
create index orders_status_idx     on orders (status);

-- ---------------------------------------------------------------------------
-- order_services — services on an order (data-model §2.8)
-- Values are snapshotted at add time so later catalog edits never rewrite
-- history (PRD §10 integrity). Soft-remove via removed_at.
-- ---------------------------------------------------------------------------
create table order_services (
  id                     uuid primary key default gen_random_uuid(),
  order_id               uuid not null references orders (id) on delete restrict,
  service_id             uuid not null references services (id),
  name_snapshot          text not null,
  category_snapshot      pricing_category,
  quantity               int not null default 1 check (quantity > 0),
  duration_min_snapshot  int,
  price_cents_snapshot   int not null check (price_cents_snapshot >= 0),
  paid                   boolean not null default false,
  added_by               uuid not null references staff (id),
  added_at               timestamptz not null default now(),
  removed_at             timestamptz
);

create index order_services_order_idx on order_services (order_id);

-- ---------------------------------------------------------------------------
-- RLS — deny-by-default plus authenticated SELECT for the live calendar
-- (data-model §3.1). All writes go through server actions on service_role
-- (which bypasses RLS); we never grant write to anon/authenticated.
-- ---------------------------------------------------------------------------
alter table orders         enable row level security;
alter table order_services enable row level security;

create policy "orders authenticated read"
  on orders for select
  to authenticated
  using (true);

create policy "order_services authenticated read"
  on order_services for select
  to authenticated
  using (true);

-- Enable Realtime broadcast on the orders table so browser subscriptions
-- receive INSERT/UPDATE/DELETE events for the live calendar.
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table order_services;
