-- 0001_foundation.sql — walking-skeleton foundation (spec 01).
-- Creates ALL domain enums once (data-model §1), the two foundation tables
-- (staff, audit_log — data-model §2.1, §2.11), their indexes, and the
-- deny-by-default RLS baseline (data-model §3). Later migrations add the rest of
-- the schema. Migrations are immutable once pushed — fix forward, never edit.

-- ---------------------------------------------------------------------------
-- Enums (all of them, created here once; later tables reference these)
-- ---------------------------------------------------------------------------
create type pricing_category as enum ('os', 'suv', 'van', 'dod', 'motorka', 'stavba');
create type staff_role       as enum ('manazer', 'prevadzka');
create type order_status      as enum ('vytvorena', 'hotova', 'zaplatena', 'nedostavil_sa');
create type service_kind      as enum ('main', 'addon');
create type sms_type          as enum ('reminder', 'ready');
create type sms_status        as enum ('pending', 'sent', 'delivered', 'failed');

-- ---------------------------------------------------------------------------
-- staff — maps an edge-authenticated identity (email) to a role (data-model §2.1)
-- ---------------------------------------------------------------------------
create table staff (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique,
  display_name text not null,
  role         staff_role not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

comment on table staff is 'Edge identity (email) -> role mapping. Soft-disable via active; never hard-delete (history integrity).';

-- Email is hit on every authorization query (the hot path); UNIQUE already
-- provides the index. A partial index speeds the active-lookup path.
create index staff_active_idx on staff (active) where active;

-- ---------------------------------------------------------------------------
-- audit_log — append-only audit trail (data-model §2.11, PRD §11)
-- ---------------------------------------------------------------------------
create table audit_log (
  id             uuid primary key default gen_random_uuid(),
  actor_email    text not null,
  actor_staff_id uuid references staff (id),
  action         text not null,
  entity_type    text not null,
  entity_id      uuid not null,
  order_id       uuid,
  details        jsonb,
  created_at     timestamptz not null default now()
);

comment on table audit_log is 'Append-only audit trail. Manager-only read; retained >= 3 months (PRD §11.2).';

create index audit_log_created_at_idx on audit_log (created_at);
create index audit_log_entity_idx     on audit_log (entity_type, entity_id);
create index audit_log_order_idx      on audit_log (order_id);

-- ---------------------------------------------------------------------------
-- RLS baseline: deny-by-default on every table (data-model §3).
-- No anon/authenticated policies are created -> the public anon key grants
-- nothing. service_role (server-side only) bypasses RLS by design, so all app
-- reads/writes via the server clients are unaffected. Realtime read policies
-- (gated on an authenticated claim) are added by the spec that introduces the
-- live calendar — not here.
-- ---------------------------------------------------------------------------
alter table staff     enable row level security;
alter table audit_log enable row level security;
