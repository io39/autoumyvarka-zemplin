-- 0002_clients_cars.sql — clients, cars, and their M:N link (spec 02).
-- Clients are keyed by phone (E.164); cars by ŠPZ and SHARED across clients
-- (PRD §13#1). pg_trgm powers the unified fuzzy search (phone/name/ŠPZ).
-- RLS deny-by-default, consistent with the spec-01 baseline.

create extension if not exists pg_trgm;
-- Diacritic-insensitive matching ("novak" → "Novák") for the unified search.
create extension if not exists unaccent;

-- ---------------------------------------------------------------------------
-- clients — identified by phone number (data-model §2.2)
-- ---------------------------------------------------------------------------
create table clients (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null unique,           -- the client key; E.164-normalized
  name       text,
  note       text,
  created_at timestamptz not null default now()
);

comment on table clients is 'Clients keyed by E.164 phone. No Phase-1 delete (GDPR erasure out of scope).';

-- Trigram GIN for fuzzy autocomplete (typo/diacritic tolerant). The UNIQUE
-- constraint already covers exact phone lookup; the trigram index serves
-- partial/fuzzy phone matching ("0905" → "+421905...").
create index clients_name_trgm  on clients using gin (name gin_trgm_ops);
create index clients_phone_trgm on clients using gin (phone gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- cars — keyed by ŠPZ, shared across clients (data-model §2.3)
-- ---------------------------------------------------------------------------
create table cars (
  id               uuid primary key default gen_random_uuid(),
  spz              text not null unique,      -- normalized: uppercase, no spaces
  model            text,
  pricing_category pricing_category not null, -- drives service duration + price
  created_at       timestamptz not null default now()
);

comment on table cars is 'Cars keyed by ŠPZ, shared across clients (PRD §13#1). Ownership via client_cars.';

create index cars_spz_trgm on cars using gin (spz gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- client_cars — M:N ownership (data-model §2.4)
-- ---------------------------------------------------------------------------
create table client_cars (
  client_id  uuid not null references clients (id),
  car_id     uuid not null references cars (id),
  created_at timestamptz not null default now(),
  primary key (client_id, car_id)
);

comment on table client_cars is 'Client<->car ownership. A shared ŠPZ links to one car row; both owners see its history.';

-- The PK indexes (client_id, car_id); add the reverse for car_id lookups
-- ("which clients own this car", history-by-car).
create index client_cars_car_idx on client_cars (car_id);

-- ---------------------------------------------------------------------------
-- RLS: deny-by-default on every table (no anon policies). service_role bypasses.
-- ---------------------------------------------------------------------------
alter table clients     enable row level security;
alter table cars        enable row level security;
alter table client_cars enable row level security;

-- ---------------------------------------------------------------------------
-- search_clients(q, lim) — unified fuzzy search (spec 02 §2.3, §4.6).
-- Matches a single query against client name, phone, or any linked car's ŠPZ:
--   * name / ŠPZ via diacritic-insensitive trigram word_similarity (typo-
--     tolerant autocomplete: "novak"→"Novák", "novk"→"Novák", "BV12"→"BV123AB"),
--   * phone via a national-digit-fragment substring ("0905" finds "+421905…").
-- Returns ranked client suggestions; matched_spz is set only on a ŠPZ hit.
-- Called server-side via RPC so client PII never reaches the browser.
--
-- Note: unaccent() makes this a seq scan rather than using the trigram GIN
-- indexes. Fine at this scale (one car wash); revisit with a generated
-- unaccented column + index if the client table ever grows large.
-- ---------------------------------------------------------------------------
create or replace function search_clients(q text, lim int default 10)
returns table (client_id uuid, name text, phone text, matched_spz text, score real)
language sql
stable
as $$
  with params as (
    select
      unaccent(lower(trim(q)))                              as ql,
      upper(regexp_replace(q, '[\s\-]', '', 'g'))           as qspz,
      -- national digit fragment: digits only, drop one leading 0
      nullif(regexp_replace(regexp_replace(q, '\D', '', 'g'), '^0', ''), '') as qd
  )
  select
    c.id,
    c.name,
    c.phone,
    case when best_car.spz_score > 0.3 then best_car.spz end as matched_spz,
    greatest(
      word_similarity(p.ql, unaccent(lower(coalesce(c.name, '')))),
      coalesce(best_car.spz_score, 0),
      case
        when p.qd is not null and length(p.qd) >= 2
             and position(p.qd in regexp_replace(c.phone, '\D', '', 'g')) > 0
        then 0.95 else 0
      end
    )::real as score
  from clients c
  cross join params p
  left join lateral (
    select cars.spz,
           word_similarity(p.qspz, cars.spz) as spz_score
    from client_cars cc
    join cars on cars.id = cc.car_id
    where cc.client_id = c.id
    order by word_similarity(p.qspz, cars.spz) desc
    limit 1
  ) best_car on true
  where length(p.ql) >= 2
    and (
         word_similarity(p.ql, unaccent(lower(coalesce(c.name, '')))) > 0.3
      or (best_car.spz is not null and best_car.spz_score > 0.3)
      or (p.qd is not null and length(p.qd) >= 2
          and position(p.qd in regexp_replace(c.phone, '\D', '', 'g')) > 0)
    )
  order by score desc, c.name nulls last
  limit greatest(lim, 1);
$$;

-- Defense-in-depth: the function is only ever called server-side via service_role.
-- Supabase's default privileges grant EXECUTE directly to anon/authenticated (not
-- only via PUBLIC), so revoke from those roles explicitly, then grant to service_role.
revoke execute on function search_clients(text, int) from public, anon, authenticated;
grant execute on function search_clients(text, int) to service_role;
