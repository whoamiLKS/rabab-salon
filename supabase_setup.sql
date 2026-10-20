-- Run this once in Supabase -> SQL Editor -> New Query:
create table if not exists public.salon_data (
  id text primary key,
  state_json jsonb not null,
  updated_at timestamptz default now()
);
alter table public.salon_data disable row level security;
grant all on table public.salon_data to anon, authenticated, service_role;
