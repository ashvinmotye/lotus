-- Run this in the Supabase SQL Editor after deploying the
-- lotus-reminders Edge Function and enabling the pg_cron and pg_net
-- extensions in Dashboard > Database > Extensions.
--
-- Replace the two placeholder values before running these statements.
-- The service-role key stays in Supabase Vault and is never placed in Lotus.

select vault.create_secret(
  'https://YOUR_PROJECT_REF.supabase.co',
  'lotus_project_url'
);

select vault.create_secret(
  'YOUR_SUPABASE_SERVICE_ROLE_KEY',
  'lotus_service_role_key'
);

-- Run once. If a job with this name already exists, remove it first from
-- Dashboard > Integrations > Cron Jobs, then run this statement again.
select cron.schedule(
  'lotus-push-reminders',
  '*/15 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'lotus_project_url') || '/functions/v1/lotus-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'lotus_service_role_key'),
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'lotus_service_role_key')
      ),
      body := '{"source":"lotus-cron"}'::jsonb
    ) as request_id;
  $$
);
