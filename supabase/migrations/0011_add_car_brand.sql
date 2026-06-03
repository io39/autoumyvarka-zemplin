-- Optional car brand (značka). Free text at the DB level; the UI offers a
-- curated dropdown plus an "Iné" free-text fallback. Nullable, no index — brand
-- is descriptive, not a lookup key (ŠPZ remains the car key).
alter table cars add column brand text;
