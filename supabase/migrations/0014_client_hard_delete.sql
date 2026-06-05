-- ---------------------------------------------------------------------------
-- Client HARD delete (supersedes the 0013 soft-delete).
--
-- A manager may permanently erase a client: the client row, the orders they
-- booked (and those orders' services / SMS log / worker assignments), and the
-- cars that belong ONLY to them. A car shared with another client (still linked
-- via client_cars, or still referenced by another client's orders) is kept —
-- only this client's link to it is removed.
--
-- This intentionally overrides the project-wide "soft-delete domain history"
-- rule for clients: the delete is irreversible. The append-only `audit_log` is
-- NOT touched (its rows carry no FK to clients/orders), so the deletion stays
-- recorded.
-- ---------------------------------------------------------------------------

-- Recreate the unified search WITHOUT the soft-delete predicate before dropping
-- the column it referenced (revert to the 0006 definition).
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

revoke execute on function search_clients(text, int) from public, anon, authenticated;
grant execute on function search_clients(text, int) to service_role;

-- The soft-delete column is gone — clients are now removed for real.
alter table clients drop column if exists deleted_at;

comment on table clients is
  'Clients keyed by E.164 phone. Hard-deleted via delete_client_cascade (irreversible).';

-- ---------------------------------------------------------------------------
-- delete_client_cascade(client) — transactional hard delete.
-- Returns how many orders and cars were removed so the caller can report it.
-- Runs as service_role (RPC behind the edge gate); RLS deny-by-default keeps
-- every other path out.
-- ---------------------------------------------------------------------------
create or replace function delete_client_cascade(p_client_id uuid)
returns table (deleted_orders int, deleted_cars int)
language plpgsql
as $$
declare
  v_order_ids     uuid[];
  v_car_ids       uuid[];
  v_orphan_cars   uuid[];
begin
  -- Orders booked BY this client (orders.client_id), and the cars linked to them.
  select array_agg(id)     into v_order_ids from orders      where client_id = p_client_id;
  select array_agg(car_id) into v_car_ids   from client_cars where client_id = p_client_id;

  -- Tear down each order's dependents, then the orders. order_services and
  -- sms_messages have NO ACTION / RESTRICT FKs so they must go first;
  -- order_staff would cascade, but we delete it explicitly for clarity.
  if v_order_ids is not null then
    delete from order_services where order_id = any(v_order_ids);
    delete from sms_messages   where order_id = any(v_order_ids);
    delete from order_staff    where order_id = any(v_order_ids);
    delete from orders         where id       = any(v_order_ids);
  end if;

  -- Drop this client's car links.
  delete from client_cars where client_id = p_client_id;

  -- A car is this client's alone — and therefore deletable — only when no other
  -- client_cars link and no remaining order reference it. Shared cars stay.
  if v_car_ids is not null then
    select array_agg(c) into v_orphan_cars
    from unnest(v_car_ids) as c
    where not exists (select 1 from client_cars cc where cc.car_id = c)
      and not exists (select 1 from orders o     where o.car_id  = c);
    if v_orphan_cars is not null then
      delete from cars where id = any(v_orphan_cars);
    end if;
  end if;

  -- Finally the client row itself.
  delete from clients where id = p_client_id;

  deleted_orders := coalesce(array_length(v_order_ids, 1), 0);
  deleted_cars   := coalesce(array_length(v_orphan_cars, 1), 0);
  return next;
end;
$$;

revoke execute on function delete_client_cascade(uuid) from public, anon, authenticated;
grant execute on function delete_client_cascade(uuid) to service_role;
