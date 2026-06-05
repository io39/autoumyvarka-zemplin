-- ---------------------------------------------------------------------------
-- Soft-delete for clients. A manager can remove a client; the row is kept
-- (FK references from orders/cars history stay intact — CLAUDE.md soft-delete
-- rule, PRD §9.1/§10) and simply hidden from search, browse, and lookup.
-- Supersedes the 0002 "No Phase-1 delete" note.
-- ---------------------------------------------------------------------------

alter table clients add column deleted_at timestamptz;

comment on table clients is
  'Clients keyed by E.164 phone. Soft-deleted via deleted_at (history preserved).';

-- Exclude soft-deleted clients from the unified fuzzy search.
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
  where c.deleted_at is null
    and length(p.ql) >= 2
    and (
         word_similarity(p.ql, unaccent(lower(coalesce(c.name, '')))) > 0.3
      or (best_car.spz is not null and best_car.spz_score > 0.3)
      or (p.qd is not null and length(p.qd) >= 2
          and position(p.qd in regexp_replace(c.phone, '\D', '', 'g')) > 0)
    )
  order by score desc, c.name nulls last
  limit greatest(lim, 1);
$$;

revoke execute on function search_clients(text, int) from anon, authenticated;
grant execute on function search_clients(text, int) to service_role;
