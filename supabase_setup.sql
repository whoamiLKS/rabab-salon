-- Rabab Salon: secure single-salon database.
-- Existing production data is preserved. Do NOT disable RLS.
create table if not exists public.salon_data (
  id text primary key,
  state_json jsonb not null,
  updated_at timestamptz default now()
);
alter table public.salon_data enable row level security;
revoke all on public.salon_data from anon;
grant select, insert, update on public.salon_data to authenticated;
drop policy if exists "Allow public sync" on public.salon_data;
drop policy if exists "Authenticated salon access" on public.salon_data;
create policy "Authenticated salon access"
on public.salon_data for all to authenticated
using (id = 'main_salon' and (select auth.uid()) is not null)
with check (id = 'main_salon' and (select auth.uid()) is not null);

-- Optional: Enable Realtime replication on table salon_data for instant cross-device updates:
-- alter publication supabase_realtime add table public.salon_data;

-- Create the trusted owner account in Supabase Dashboard → Authentication → Users.
-- Do not enable public sign-up for this private app.
