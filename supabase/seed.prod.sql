-- seed.prod.sql — ONE-TIME production reference-data seed for Supabase Cloud EU.
--
-- This is NOT run by `supabase db push` (only the schema migrations are) and is
-- NOT the local-dev seed (`seed.sql`, which `supabase db reset` runs). Run this
-- once, by hand, against the Cloud database after `db push` — see
-- docs/deployment.md §2.4.
--
--   psql "$SUPABASE_DB_URL" -f supabase/seed.prod.sql
--   # or: pnpm supabase db execute --file supabase/seed.prod.sql
--
-- Contents (vs. the dev seed.sql):
--   • Service catalog (services + service_prices) — COPIED verbatim from seed.sql.
--   • Opening hours — COPIED verbatim (idempotent: on conflict do nothing).
--   • ONE manager bootstrap account in `staff` — fill in the real Cloudflare-Access
--     email below. Without it, an Access-allowed email is denied by the app
--     (authorization lives in `staff`; see docs/deployment.md §4).
-- Deliberately NOT included:
--   • Dev `staff`/`workers` fixtures — the manager adds Zamestnanci in-app (PRD §13#7).
--   • `sms_templates` — already seeded by migration 0008_sms.sql on `db push`.
--
-- ⚠️ RUN ONCE. The catalog inserts have no `on conflict` guard (services have no
-- natural unique key), so re-running this file duplicates the catalog. The
-- opening-hours and staff inserts are idempotent and safe to re-run on their own.

-- ---------------------------------------------------------------------------
-- Manager bootstrap (spec 01 / docs/deployment.md §4).
-- Replace the email + display name with the real manager's Cloudflare-Access
-- identity. This email MUST match the Cloudflare Access allow policy (§5.2).
-- Idempotent. Workers (Zamestnanci) are added later in the app, not here.
-- ---------------------------------------------------------------------------
insert into staff (email, display_name, role, active)
values
  ('filicko203@gmail.com', 'Jakub Filicko', 'manazer', true)
on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- Service catalog (spec 03). Source of truth: docs/services.md.
-- Prices: euros → integer cents (18,90 € → 1890). Durations in minutes.
-- One row per (service, category) for main services; a single NULL-category
-- row for flat add-ons. `price_from` mirrors the "od" rows; `is_per_unit` the
-- "/ks" add-ons; NULL `duration_min` for items without a scheduled time.
-- ---------------------------------------------------------------------------

-- Main services + their per-category prices. Each service is inserted via a
-- CTE so we can reference the generated id in the same statement.
with s as (
  insert into services (name, kind, sort_order) values
    ('Interiér Classic', 'main', 10) returning id
)
insert into service_prices (service_id, pricing_category, duration_min, price_cents, price_from)
select s.id, c.cat, c.dur, c.price, false
from s, (values
  ('os'::pricing_category,  60, 1890),
  ('suv'::pricing_category, 60, 2390),
  ('van'::pricing_category, 75, 3190),
  ('dod'::pricing_category, 75, 2890)
) as c(cat, dur, price);

with s as (
  insert into services (name, kind, sort_order) values
    ('Exteriér Classic', 'main', 20) returning id
)
insert into service_prices (service_id, pricing_category, duration_min, price_cents, price_from)
select s.id, c.cat, c.dur, c.price, false
from s, (values
  ('os'::pricing_category,      45, 1890),
  ('suv'::pricing_category,     60, 2090),
  ('van'::pricing_category,     60, 2290),
  ('dod'::pricing_category,     60, 2890),
  ('motorka'::pricing_category, 30, 1890)
) as c(cat, dur, price);

-- Interiér Premium / Tepovanie. Stavba is "od" (price_from=true).
with s as (
  insert into services (name, kind, sort_order) values
    ('Tepovanie (Interiér Premium)', 'main', 30) returning id
)
insert into service_prices (service_id, pricing_category, duration_min, price_cents, price_from)
select s.id, c.cat, c.dur, c.price, c.pfrom
from s, (values
  ('os'::pricing_category,     360, 13790, false),
  ('suv'::pricing_category,    360, 14790, false),
  ('dod'::pricing_category,    300, 17790, false),
  ('van'::pricing_category,    480, 19790, false),
  ('stavba'::pricing_category, 600, 21790, true)
) as c(cat, dur, price, pfrom);

-- Ochrana laku MM1 — Protector wax 2M. "Dod od" → price_from for dod.
with s as (
  insert into services (name, kind, sort_order) values
    ('Ochrana laku MM1 (Protector wax 2M)', 'main', 40) returning id
)
insert into service_prices (service_id, pricing_category, duration_min, price_cents, price_from)
select s.id, c.cat, c.dur, c.price, c.pfrom
from s, (values
  ('os'::pricing_category,  75, 5790, false),
  ('suv'::pricing_category, 75, 6790, false),
  ('van'::pricing_category, 90, 8790, false),
  ('dod'::pricing_category, 90, 9790, true)
) as c(cat, dur, price, pfrom);

-- Ochrana laku MM2 — Sealant S0.02 3M. "Dod od" → price_from for dod.
with s as (
  insert into services (name, kind, sort_order) values
    ('Ochrana laku MM2 (Sealant S0.02 3M)', 'main', 50) returning id
)
insert into service_prices (service_id, pricing_category, duration_min, price_cents, price_from)
select s.id, c.cat, c.dur, c.price, c.pfrom
from s, (values
  ('os'::pricing_category,   90, 7790, false),
  ('suv'::pricing_category,  90, 8790, false),
  ('van'::pricing_category, 105, 10790, false),
  ('dod'::pricing_category, 105, 11790, true)
) as c(cat, dur, price, pfrom);

-- Ochrana laku MM3 — Karnaubský vosk 5M.
with s as (
  insert into services (name, kind, sort_order) values
    ('Ochrana laku MM3 (Karnaubský vosk 5M)', 'main', 60) returning id
)
insert into service_prices (service_id, pricing_category, duration_min, price_cents, price_from)
select s.id, c.cat, c.dur, c.price, false
from s, (values
  ('os'::pricing_category,  165, 13790),
  ('suv'::pricing_category, 180, 14790),
  ('van'::pricing_category, 195, 16790),
  ('dod'::pricing_category, 240, 22790)
) as c(cat, dur, price);

-- Ochrana laku MM4 — Polymérová ochrana laku.
with s as (
  insert into services (name, kind, sort_order) values
    ('Ochrana laku MM4 (Polymérová ochrana laku)', 'main', 70) returning id
)
insert into service_prices (service_id, pricing_category, duration_min, price_cents, price_from)
select s.id, c.cat, c.dur, c.price, false
from s, (values
  ('os'::pricing_category,  165, 17790),
  ('suv'::pricing_category, 180, 19790),
  ('van'::pricing_category, 240, 22790),
  ('dod'::pricing_category, 240, 24790)
) as c(cat, dur, price);

-- Add-ons (doplnkové služby). Flat: pricing_category = NULL.
-- is_per_unit = true for "/ks" items.
with s as (
  insert into services (name, kind, is_per_unit, sort_order) values
    ('Tepovanie sedadla', 'addon', true, 100) returning id
)
insert into service_prices (service_id, pricing_category, duration_min, price_cents)
select s.id, null, 15, 1500 from s;

with s as (
  insert into services (name, kind, sort_order) values
    ('Tepovanie kufra', 'addon', 110) returning id
)
insert into service_prices (service_id, pricing_category, duration_min, price_cents)
select s.id, null, 30, 3000 from s;

with s as (
  insert into services (name, kind, sort_order) values
    ('Tepovanie stropu', 'addon', 120) returning id
)
insert into service_prices (service_id, pricing_category, duration_min, price_cents)
select s.id, null, 30, 3000 from s;

with s as (
  insert into services (name, kind, is_per_unit, sort_order) values
    ('Tepovanie rohoží', 'addon', true, 130) returning id
)
insert into service_prices (service_id, pricing_category, duration_min, price_cents)
select s.id, null, 5, 500 from s;

with s as (
  insert into services (name, kind, sort_order) values
    ('Tepovanie koberca', 'addon', 140) returning id
)
insert into service_prices (service_id, pricing_category, duration_min, price_cents)
select s.id, null, 60, 3000 from s;

with s as (
  insert into services (name, kind, is_per_unit, sort_order) values
    ('Tepovanie tapacír dverí', 'addon', true, 150) returning id
)
insert into service_prices (service_id, pricing_category, duration_min, price_cents)
select s.id, null, 5, 500 from s;

with s as (
  insert into services (name, kind, sort_order) values
    ('Tepovanie autosedačky', 'addon', 160) returning id
)
insert into service_prices (service_id, pricing_category, duration_min, price_cents)
select s.id, null, 30, 2000 from s;

with s as (
  insert into services (name, kind, is_per_unit, sort_order) values
    ('Čistenie demontovaných kolies', 'addon', true, 170) returning id
)
insert into service_prices (service_id, pricing_category, duration_min, price_cents)
select s.id, null, null, 500 from s;

with s as (
  insert into services (name, kind, sort_order) values
    ('Čistenie okien z vnútra', 'addon', 180) returning id
)
insert into service_prices (service_id, pricing_category, duration_min, price_cents)
select s.id, null, 15, 1000 from s;

with s as (
  insert into services (name, kind, sort_order) values
    ('Čistenie a impregnácia kože', 'addon', 190) returning id
)
insert into service_prices (service_id, pricing_category, duration_min, price_cents)
select s.id, null, 90, 10000 from s;

with s as (
  insert into services (name, kind, sort_order) values
    ('Čistenie motorovej časti', 'addon', 200) returning id
)
insert into service_prices (service_id, pricing_category, duration_min, price_cents)
select s.id, null, 30, 2000 from s;

with s as (
  insert into services (name, kind, sort_order) values
    ('Dezinfekcia ozónom', 'addon', 210) returning id
)
insert into service_prices (service_id, pricing_category, duration_min, price_cents)
select s.id, null, null, 2000 from s;

with s as (
  insert into services (name, kind, is_per_unit, sort_order) values
    ('Leštenie svetiel', 'addon', true, 220) returning id
)
insert into service_prices (service_id, pricing_category, duration_min, price_cents)
select s.id, null, 60, 4000 from s;

with s as (
  insert into services (name, kind, sort_order) values
    ('Aplikácia tekutých stieračov', 'addon', 230) returning id
)
insert into service_prices (service_id, pricing_category, duration_min, price_cents)
select s.id, null, 30, 5000 from s;

with s as (
  insert into services (name, kind, sort_order) values
    ('WAP', 'addon', 240) returning id
)
insert into service_prices (service_id, pricing_category, duration_min, price_cents)
select s.id, null, 15, 1000 from s;

with s as (
  insert into services (name, kind, sort_order) values
    ('Oplach podvozku vysokým tlakom', 'addon', 250) returning id
)
insert into service_prices (service_id, pricing_category, duration_min, price_cents)
select s.id, null, 15, 1000 from s;

with s as (
  insert into services (name, kind, is_per_unit, sort_order) values
    ('Ohrievače', 'addon', true, 260) returning id
)
insert into service_prices (service_id, pricing_category, duration_min, price_cents)
select s.id, null, null, 1000 from s;

-- ---------------------------------------------------------------------------
-- Opening hours (spec 04). 0=Mon … 6=Sun. Defaults: Mon–Fri 08:00–17:00,
-- Sat 08:00–12:00, Sun closed. Confirm real defaults with the client; this
-- is just a starting point and fully editable in /settings/hours.
-- Idempotent.
-- ---------------------------------------------------------------------------
insert into opening_hours (day_of_week, open_time, close_time, is_closed) values
  (0, '08:00', '17:00', false), -- Pondelok
  (1, '08:00', '17:00', false), -- Utorok
  (2, '08:00', '17:00', false), -- Streda
  (3, '08:00', '17:00', false), -- Štvrtok
  (4, '08:00', '17:00', false), -- Piatok
  (5, '08:00', '12:00', false), -- Sobota
  (6, null,    null,    true)   -- Nedeľa (closed)
on conflict (day_of_week) do nothing;
