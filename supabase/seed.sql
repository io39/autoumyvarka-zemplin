-- seed.sql — applied by `supabase db reset` after migrations. Local dev only.
-- One manager row so the local stack is usable immediately. The email matches
-- the dev-auth shim (DEV_AUTH_EMAIL in .env.example, architecture §2.2).
-- Idempotent: re-running reset re-applies cleanly.

insert into staff (email, display_name, role, active)
values
  ('filicko203@gmail.com', 'Jakub Filicko', 'manazer', true),
  -- Worker row used by local dev and e2e (the prevadzka 403 path, spec 01 §4.4).
  ('pracovnik@autoumyvaren.local', 'Tester Prevádzka', 'prevadzka', true)
on conflict (email) do nothing;
