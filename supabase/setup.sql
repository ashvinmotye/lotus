-- Lotus v2 stores only anonymous push-device subscriptions in Supabase.
-- Health records and backups remain on the device. Run once in SQL Editor.
create table if not exists public.lotus_push_v2 (
  id uuid primary key,
  secret_hash text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  timezone text not null default 'UTC',
  enabled boolean not null default true,
  last_sent_date date,
  last_sent_hour smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lotus_push_v2 enable row level security;
revoke all on public.lotus_push_v2 from public, anon, authenticated;
grant select, insert, update, delete on public.lotus_push_v2 to service_role;

-- Claim each date/hour atomically so overlapping cron runs cannot double-send.
create or replace function public.lotus_v2_claim_slot(p_id uuid, p_date date, p_hour smallint)
returns boolean
language sql security invoker set search_path = ''
as $$
  with claimed as (
    update public.lotus_push_v2
    set last_sent_date = p_date, last_sent_hour = p_hour, updated_at = now()
    where id = p_id and enabled = true
      and (last_sent_date is distinct from p_date or last_sent_hour is distinct from p_hour)
    returning id
  )
  select exists(select 1 from claimed);
$$;
revoke execute on function public.lotus_v2_claim_slot(uuid, date, smallint) from public, anon, authenticated;
grant execute on function public.lotus_v2_claim_slot(uuid, date, smallint) to service_role;
notify pgrst, 'reload schema';

-- Deploy lotus-push-send-v2 with JWT verification OFF and a matching
-- LOTUS_CRON_SECRET. Reuse the existing Vault secrets if present:
-- lotus_project_url, lotus_service_role_key and lotus_cron_secret.
-- Then enable pg_cron and pg_net and schedule:
select cron.schedule(
  'lotus-push-v2',
  '*/15 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'lotus_project_url') || '/functions/v1/lotus-push-send-v2',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'lotus_service_role_key'),
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lotus_cron_secret')
      ),
      body := '{"source":"lotus-v2-cron"}'::jsonb,
      timeout_milliseconds := 10000
    ) as request_id;
  $$
);
