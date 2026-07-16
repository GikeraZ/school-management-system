-- ============================================================================
-- Weekly fee-reminder automation
-- ----------------------------------------------------------------------------
-- Schedules a pg_cron job that, every day, checks the fee_reminder_settings
-- table and (when enabled and due) invokes the `weekly-fee-reminder` edge
-- function. The edge function performs the actual role check, builds the
-- recipient list from vw_fee_outstanding, sends SMS via Twilio and logs them.
-- ----------------------------------------------------------------------------
-- Requires the `pg_cron` and `pg_net` extensions (enabled in Supabase). The
-- edge function is invoked with the service-role secret, so it bypasses RLS
-- and performs its own authorization.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Run every day at 08:00 UTC; the function only acts when the schedule is due.
select cron.schedule(
  'weekly-fee-reminder',
  '0 8 * * *',
  $$
  select net.http_post(
    url     := current_setting('app.settings.edge_base_url', true) || '/functions/v1/weekly-fee-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- How to set the required settings (run once, with your project values):
--   alter database postgres set app.settings.edge_base_url = 'https://<ref>.supabase.co';
--   alter database postgres set app.settings.service_role_key = '<service-role-key>';
--
-- To disable the schedule entirely:
--   select cron.unschedule('weekly-fee-reminder');
