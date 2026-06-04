-- 0012_role_grants.sql — explicit table/role privilege grants.
--
-- Migrations 0001–0011 rely on Supabase auto-granting table privileges to
-- service_role / authenticated when a table is created. The local stack does
-- this, but the Cloud project did not — so the backend (service_role) hit
-- "permission denied for table staff", and the browser Realtime role
-- (authenticated) would read zero rows. Grant explicitly so the schema is
-- self-contained and environment-independent. RLS stays the row-level gate;
-- anon is granted nothing (deny-by-default preserved — CLAUDE.md, data-model §3).

-- ---------------------------------------------------------------------------
-- service_role — the privileged server-side role (bypasses RLS). It backs every
-- Server Action, so it needs full access to the domain tables. Server-side only;
-- never exposed to the browser.
-- ---------------------------------------------------------------------------
grant usage on schema public to service_role;
grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
-- (EXECUTE on functions is granted per-function where needed — e.g. search_clients
-- in 0002; a blanket grant only spams warnings on extension-owned functions.)

-- Cover tables/sequences/functions created by future migrations (run as the same
-- migration role) so this never has to be repeated.
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

-- ---------------------------------------------------------------------------
-- authenticated — the browser Realtime role (server-minted JWT, data-model §3.1).
-- It has SELECT RLS policies only on the live-calendar tables (0006/0007); grant
-- the matching table-level SELECT so those policies can return rows. RLS still
-- decides which rows. No INSERT/UPDATE/DELETE — writes go through service_role.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select on orders, order_services, order_staff to authenticated;
