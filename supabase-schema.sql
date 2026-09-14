-- Lotus stores one encrypted vault row per authenticated Supabase user.
-- The table name is intentionally non-descriptive. Plaintext period data never enters this table.
create table if not exists public.x7m2 (
  id text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null,
  updated_at timestamptz not null,
  salt text not null,
  iv text not null,
  ciphertext text not null,
  primary key (owner_id, id)
);

alter table public.x7m2 enable row level security;

drop policy if exists x7m2_select_own on public.x7m2;
create policy x7m2_select_own on public.x7m2
  for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists x7m2_insert_own on public.x7m2;
create policy x7m2_insert_own on public.x7m2
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists x7m2_update_own on public.x7m2;
create policy x7m2_update_own on public.x7m2
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists x7m2_delete_own on public.x7m2;
create policy x7m2_delete_own on public.x7m2
  for delete to authenticated
  using (owner_id = auth.uid());

revoke all on table public.x7m2 from anon;
grant select, insert, update, delete on table public.x7m2 to authenticated;

-- Lotus push registrations. This table stores only the browser endpoint and
-- encryption keys needed to deliver a Web Push notification. It never stores
-- period, wellbeing, or other tracker data.
create table if not exists public.q4n8 (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  timezone text not null default 'UTC',
  enabled boolean not null default true,
  last_sent_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, endpoint)
);

alter table public.q4n8 enable row level security;

drop policy if exists q4n8_select_own on public.q4n8;
create policy q4n8_select_own on public.q4n8
  for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists q4n8_insert_own on public.q4n8;
create policy q4n8_insert_own on public.q4n8
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists q4n8_update_own on public.q4n8;
create policy q4n8_update_own on public.q4n8
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists q4n8_delete_own on public.q4n8;
create policy q4n8_delete_own on public.q4n8
  for delete to authenticated
  using (owner_id = auth.uid());

revoke all on table public.q4n8 from anon;
grant select, insert, update, delete on table public.q4n8 to authenticated;

-- Push delivery setup is intentionally completed in the Supabase Dashboard:
-- 1. Deploy supabase/functions/lotus-reminders/index.ts as lotus-reminders.
-- 2. Add LOTUS_VAPID_PUBLIC_KEY, LOTUS_VAPID_PRIVATE_KEY,
--    LOTUS_VAPID_SUBJECT, and LOTUS_CRON_SECRET as Edge Function secrets.
--    Never put private keys in Lotus or in this SQL file.
-- 3. Store the same LOTUS_CRON_SECRET value in Supabase Vault under the name
--    lotus_cron_secret so scheduled calls can authenticate.
-- 4. Schedule lotus-reminders every 15 minutes. The function sends once per
--    subscription on its local day when the local hour is 21.
