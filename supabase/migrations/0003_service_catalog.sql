-- 0003_service_catalog.sql — service catalog (spec 03).
-- Two tables: `services` (catalog entries) and `service_prices` (per-category
-- duration + price rows). Soft active/inactive on services (PRD §9.1). Per-(service,
-- category) uniqueness lets add-ons store a single NULL-category "flat" row.
-- RLS deny-by-default, consistent with the baseline.

-- ---------------------------------------------------------------------------
-- services — catalog of bookable services (data-model §2.5)
-- ---------------------------------------------------------------------------
create table services (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  kind         service_kind not null,
  is_per_unit  boolean not null default false,
  active       boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

comment on table services is 'Service catalog (PRD §9). Soft active/inactive; never hard-delete (history integrity).';

create index services_kind_sort_idx on services (kind, sort_order);

-- ---------------------------------------------------------------------------
-- service_prices — per-(service x category) duration + price (data-model §2.6)
-- ---------------------------------------------------------------------------
create table service_prices (
  id                uuid primary key default gen_random_uuid(),
  service_id        uuid not null references services (id),
  pricing_category  pricing_category,             -- NULL = flat add-on (any category)
  duration_min      int,                          -- NULL = no scheduled duration
  price_cents       int not null check (price_cents >= 0),
  price_from        boolean not null default false,
  check (duration_min is null or duration_min > 0),
  -- NULLS NOT DISTINCT so a NULL-category row is unique per service too.
  constraint service_prices_service_category_uq
    unique nulls not distinct (service_id, pricing_category)
);

comment on table service_prices is 'Per-(service, category) duration + price; NULL category = flat add-on.';

create index service_prices_service_idx on service_prices (service_id);

-- ---------------------------------------------------------------------------
-- RLS: deny-by-default (no anon/authenticated policies). service_role bypasses.
-- ---------------------------------------------------------------------------
alter table services       enable row level security;
alter table service_prices enable row level security;
