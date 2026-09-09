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
