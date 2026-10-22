create table public.salon_data (
 id text primary key check (id = 'main_salon'),
 state_json jsonb not null,
 updated_at timestamptz not null default now()
);
alter table public.salon_data enable row level security;
revoke all on public.salon_data from anon, authenticated;
grant select, insert, update on public.salon_data to authenticated;
create policy "Salon owner access" on public.salon_data for all to authenticated
using (id = 'main_salon' and (select auth.jwt()->'app_metadata'->>'salon_role') = 'owner')
with check (id = 'main_salon' and (select auth.jwt()->'app_metadata'->>'salon_role') = 'owner');
alter publication supabase_realtime add table public.salon_data;