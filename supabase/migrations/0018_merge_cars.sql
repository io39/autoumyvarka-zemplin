-- ---------------------------------------------------------------------------
-- Car MERGE (spec 02 §2.6).
--
-- When a manager sets a car's ŠPZ to a plate that already belongs to another
-- car row, the two rows are the same physical car and must collapse into one.
-- merge_cars folds the SOURCE car into the TARGET (the pre-existing plated car
-- that survives): the source's orders and client links move to the target, the
-- target's descriptive fields are updated to the manager's edited values, and
-- the now-empty source row is HARD-DELETED.
--
-- This is the SECOND documented exception to the soft-delete rule (after
-- delete_client_cascade, 0014): nothing is lost — every order and link moved to
-- the survivor — and the merge is recorded in the append-only audit_log
-- (`car.merge`, written by the Server Action). Irreversible.
--
-- Runs as service_role (RPC behind the edge gate); RLS deny-by-default keeps
-- every other path out. The whole operation is one transaction (function body),
-- so a concurrent delete of the target fails the FK reassignment and rolls the
-- entire merge back.
-- ---------------------------------------------------------------------------
create or replace function merge_cars(
  p_source   uuid,
  p_target   uuid,
  p_brand    text,
  p_model    text,
  p_category pricing_category
)
returns table (reassigned_orders int, merged_clients int)
language plpgsql
as $$
declare
  v_orders  int;
  v_clients int;
begin
  if p_source = p_target then
    raise exception 'merge_cars: source and target must differ';
  end if;

  -- 1) Reassign the source car's orders (all statuses, incl. history) to the
  --    target. Each order keeps its own service/price snapshots.
  select count(*) into v_orders from orders where car_id = p_source;
  update orders set car_id = p_target where car_id = p_source;

  -- 2) Move the source car's ownership links to the target, deduping when a
  --    client already owns the target.
  select count(*) into v_clients from client_cars where car_id = p_source;
  insert into client_cars (client_id, car_id, created_at)
    select client_id, p_target, created_at from client_cars where car_id = p_source
  on conflict (client_id, car_id) do nothing;
  delete from client_cars where car_id = p_source;

  -- 3) The survivor takes the manager's edited descriptive fields.
  update cars
     set brand = p_brand, model = p_model, pricing_category = p_category
   where id = p_target;

  -- 4) The source row is now empty (no orders, no links) — hard-delete it.
  delete from cars where id = p_source;

  reassigned_orders := v_orders;
  merged_clients    := v_clients;
  return next;
end;
$$;

revoke execute on function merge_cars(uuid, uuid, text, text, pricing_category)
  from public, anon, authenticated;
grant execute on function merge_cars(uuid, uuid, text, text, pricing_category)
  to service_role;
