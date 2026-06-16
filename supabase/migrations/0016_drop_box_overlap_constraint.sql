-- 0016_drop_box_overlap_constraint.sql
-- Client decision (docs/navrh-prekryvajuce-rezervacie.md): allow overlapping
-- reservations in the same box. The hard DB exclusion constraint
-- `orders_no_box_overlap` (migration 0006) is removed; collision is now a
-- *soft* check in the action layer ("warn but allow" — overlap is detected and
-- confirmed by the manager, never rejected outright).
--
-- Trade-off (documented for the client): the DB no longer blocks accidental
-- double-booking; detection lives only in app code. Opening-hours enforcement
-- is unaffected (still checked in the actions).
--
-- The btree_gist extension stays installed (cheap, may be reused). The
-- `(box, starts_at)` index from 0006 remains and now also serves the overlap
-- lookup query.

alter table orders drop constraint if exists orders_no_box_overlap;

comment on table orders is
  'Central reservation entity. Box-time overlaps are ALLOWED (0016); collision is a soft, confirmable check in the action layer, not a DB constraint.';
