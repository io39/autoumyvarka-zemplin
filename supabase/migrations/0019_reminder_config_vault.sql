-- ---------------------------------------------------------------------------
-- Reminder cron config: read from Supabase Vault, not per-database GUCs.
--
-- Migration 0008 scheduled `sms-reminders` to read `app.reminder_url` /
-- `app.reminder_secret`, set via `alter database ... set`. That works locally
-- (where you can act as `supabase_admin`) but is IMPOSSIBLE on Supabase Cloud:
-- setting a custom `app.*` parameter requires superuser, the dashboard runs as
-- `postgres`, and `supabase_admin` cannot log in there. The result was a job
-- that reported `succeeded` every minute while silently skipping — reminders
-- never fired on Cloud.
--
-- Vault (`supabase_vault`) is the supported way to hold pg_cron/pg_net secrets
-- and is readable by `postgres`, so the same setup works in both environments.
-- GUCs are kept as a fallback so an already-configured local stack keeps working.
--
-- No secret lives in this migration. Per environment, run once:
--   select vault.create_secret('https://<host>/api/reminders', 'reminder_url');
--   select vault.create_secret('<REMINDER_TRIGGER_SECRET>',    'reminder_secret');
-- (to rotate: `select vault.update_secret(id, new_value)`.)
-- ---------------------------------------------------------------------------

-- Drop by id so a missing job is a no-op rather than an error (unlike
-- `cron.unschedule('name')`, which raises when the job does not exist).
select cron.unschedule(jobid) from cron.job where jobname = 'sms-reminders';

select cron.schedule(
  'sms-reminders',
  '* * * * *',
  $cron$
    do $do$
    declare
      url  text;
      sec  text;
    begin
      -- Vault first. Guarded: a stack without the extension falls through to
      -- the GUCs instead of failing the whole job.
      if to_regclass('vault.decrypted_secrets') is not null then
        select decrypted_secret into url
          from vault.decrypted_secrets where name = 'reminder_url';
        select decrypted_secret into sec
          from vault.decrypted_secrets where name = 'reminder_secret';
      end if;

      url := coalesce(nullif(url, ''), current_setting('app.reminder_url', true));
      sec := coalesce(nullif(sec, ''), current_setting('app.reminder_secret', true));

      if url is null or url = '' or sec is null or sec = '' then
        raise notice 'sms-reminders: reminder_url/reminder_secret unset (vault + GUC); skipping';
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
