-- Run in the Supabase SQL Editor before deploying the updated Edge Function.
-- Existing subscriptions and the 15-minute cron job stay in place.
begin;

alter table public.q4n8 add column if not exists last_sent_hour smallint;

-- Claim a single local date/hour atomically. Only the Edge Function's service
-- role may call this function; signed-in app users cannot invoke it.
create or replace function public.n9c4(p_id uuid, p_date date, p_hour smallint)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  with claimed as (
    update public.q4n8
    set last_sent_date = p_date,
        last_sent_hour = p_hour,
        updated_at = now()
    where id = p_id
      and enabled = true
      and (last_sent_date is distinct from p_date or last_sent_hour is distinct from p_hour)
    returning id
  )
  select exists(select 1 from claimed);
$$;

revoke execute on function public.n9c4(uuid, date, smallint) from public, anon, authenticated;
grant execute on function public.n9c4(uuid, date, smallint) to service_role;

notify pgrst, 'reload schema';
commit;
