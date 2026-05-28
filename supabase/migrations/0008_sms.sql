-- 0008_sms.sql — SMS notifications (spec 07).
-- Outbound SMS log (sms_messages) and editable Slovak message templates
-- (sms_templates). Plus the pg_cron + pg_net wiring that drives the
-- 30-minute reminder Route Handler (architecture §6). Sends themselves are
-- performed by the Next app via Server Actions / Route Handlers; the DB only
-- holds the log, the templates, and the cron trigger.

-- ---------------------------------------------------------------------------
-- sms_templates — editable message bodies (data-model §2.10).
-- One row per sms_type. Wording is changed by the manager; placeholders
-- like {cas}, {spz} are substituted at render time (lib/sms/render.ts).
-- ---------------------------------------------------------------------------
create table sms_templates (
  type        sms_type primary key,
  body        text not null,
  updated_at  timestamptz not null default now()
);

comment on table sms_templates is 'Editable SMS templates (PRD §8). Phase-1 placeholder wording — final text per client (PRD §13#4).';

-- ---------------------------------------------------------------------------
-- sms_messages — append-only outbound SMS log (data-model §2.9, PRD §8).
-- Each send attempt — including failures and resends — is one row. Failures
-- are visible on the order; a resend creates a NEW attempt rather than
-- mutating the failed row, preserving history.
-- ---------------------------------------------------------------------------
create table sms_messages (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references orders (id),
  type                 sms_type not null,
  phone                text not null,
  body                 text not null,
  status               sms_status not null default 'pending',
  provider_message_id  text,
  error                text,
  sent_at              timestamptz,
  delivered_at         timestamptz,
  created_at           timestamptz not null default now()
);

comment on table sms_messages is 'Outbound SMS log. Append-only; failed sends are visible on the order and retryable (PRD §8).';

create index sms_messages_order_idx   on sms_messages (order_id);
create index sms_messages_status_idx  on sms_messages (status);
create index sms_messages_provider_idx on sms_messages (provider_message_id);

-- ---------------------------------------------------------------------------
-- RLS — deny-by-default (data-model §3, supabase-migrations skill).
-- All access goes through the server (service_role bypasses RLS). The
-- webhook is a Route Handler too — no anon policy is needed.
-- ---------------------------------------------------------------------------
alter table sms_templates enable row level security;
alter table sms_messages  enable row level security;

-- ---------------------------------------------------------------------------
-- Seed Slovak placeholder templates (PRD §8, §13#4 — final wording TBD).
-- 70-char-with-diacritics limit applies (PRD §8); the editor warns past it.
-- ---------------------------------------------------------------------------
insert into sms_templates (type, body) values
  ('reminder', 'Dobrý deň, pripomíname termín umytia auta o {cas}. Autoumyváreň Zemplín.'),
  ('ready',    'Vaše auto {spz} je umyté a pripravené na vyzdvihnutie. Autoumyváreň Zemplín.');

-- ---------------------------------------------------------------------------
-- pg_cron + pg_net — every minute, POST to the reminder Route Handler
-- (architecture §6). The handler is idempotent via orders.reminded_at, so a
-- duplicate fire is harmless. URL + secret are read from per-database GUCs
-- so production sets them via `alter database … set app.reminder_url = …`;
-- local dev defaults to host.docker.internal (the Next app on the host).
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- The cron body checks the GUC explicitly. With NULL/empty `app.reminder_url`
-- or `app.reminder_secret` the job logs a NOTICE and exits — instead of
-- POSTing an empty secret to the handler, which would 401 every minute. A
-- production deploy must run `alter database <db> set app.reminder_url = …;`
-- and `alter database <db> set app.reminder_secret = …;` once.
select cron.schedule(
  'sms-reminders',
  '* * * * *',
  $cron$
    do $do$
    declare
      url  text := current_setting('app.reminder_url', true);
      sec  text := current_setting('app.reminder_secret', true);
    begin
      if url is null or url = '' or sec is null or sec = '' then
        raise notice 'sms-reminders: app.reminder_url/app.reminder_secret unset; skipping';
        return;
      end if;
      perform net.http_post(
        url := url,
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-reminder-secret', sec
        ),
        body := '{}'::jsonb
      );
    end
    $do$;
  $cron$
);
