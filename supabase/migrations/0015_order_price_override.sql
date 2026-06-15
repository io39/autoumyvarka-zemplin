-- 0015_order_price_override.sql
-- Manager-only manual order total override (integer cents). When set, it
-- REPLACES the summed service-line price everywhere the order total is shown
-- (order detail "Cena spolu", client service history, unpaid-alert amount).
-- NULL = use the computed sum of the non-removed service lines (the default).
--
-- This is an order-level field; the per-line price snapshots and the per-line
-- `paid` workflow are unchanged. The effective total is resolved in app code
-- (`effectiveTotalCents`), not in SQL.

alter table orders
  add column price_override_cents integer;

alter table orders
  add constraint orders_price_override_nonneg
  check (price_override_cents is null or price_override_cents >= 0);

comment on column orders.price_override_cents is
  'Manager-entered manual order total in cents; overrides the summed line price everywhere. NULL = use the line sum.';
