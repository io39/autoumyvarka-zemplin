-- 0005_audit_entity_nullable.sql — relax audit_log.entity_id to nullable.
-- Rationale: config tables introduced in spec 04 (`opening_hours`,
-- `day_overrides`) have non-uuid PKs (smallint, date). Forcing a sentinel
-- uuid degenerates the `(entity_type, entity_id)` index and conflates
-- distinct settings under one meaningless id. For these audit rows the
-- meaningful key is now carried in `details` and entity_id is NULL.
alter table audit_log alter column entity_id drop not null;

comment on column audit_log.entity_id is 'UUID PK of the audited row; NULL when the audited entity has a non-uuid PK (e.g. config tables — see entity_type/details).';
