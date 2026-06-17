-- Optional ŠPZ: a car may be registered without a plate (e.g. a brand-new car
-- with no plate yet). ŠPZ stays the car's *linking* key — the shared-car merge
-- (PRD §13#1) only fires when a plate is actually present — but it is no longer
-- mandatory.
--
-- Storage rule: a missing plate is stored as NULL, never as an empty/whitespace
-- string. NULLs are distinct under the existing UNIQUE index, so two plateless
-- cars never collide and never auto-link to each other (which would otherwise
-- bleed one client's history into another's). The CHECK below is a defensive
-- backstop: even if some future code path skips `normalizeSpz`, a blank plate
-- can never land in the column — it must be NULL.
alter table cars alter column spz drop not null;

alter table cars
  add constraint cars_spz_not_blank check (spz is null or btrim(spz) <> '');

comment on column cars.spz is
  'License plate, normalized (uppercase, no spaces); the shared linking key. NULL = plateless car (no dedup/link). Never an empty string (cars_spz_not_blank).';
