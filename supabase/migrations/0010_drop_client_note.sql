-- Drop the unused client-level note column. The per-order note (orders.note,
-- shown in client history) is unaffected; only the free-text note on the client
-- record itself is removed.
alter table clients drop column if exists note;
