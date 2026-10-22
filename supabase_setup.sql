-- Current salon schema; preserves existing data.
create table if not exists public.salon_data (
 id text primary key check (id='main_salon'),
 state_json jsonb not null,
 updated_at timestamptz not null default now(),
 revision bigint not null default 1
);
alter table public.salon_data add column if not exists revision bigint not null default 1;
create table if not exists public.salon_members (
 user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.salon_data enable row level security;
alter table public.salon_members enable row level security;
revoke all on public.salon_data, public.salon_members from anon, authenticated;
grant select, insert, update on public.salon_data to authenticated;
grant select on public.salon_members to authenticated;
drop policy if exists "Read own salon membership" on public.salon_members;
create policy "Read own salon membership" on public.salon_members for select to authenticated
using (user_id=(select auth.uid()));
insert into public.salon_members(user_id)
select id from auth.users where raw_app_meta_data->>'salon_role'='owner' on conflict do nothing;
drop policy if exists "Salon owner access" on public.salon_data;
create policy "Salon owner access" on public.salon_data for all to authenticated
using (id='main_salon' and exists(select 1 from public.salon_members where user_id=(select auth.uid())))
with check (id='main_salon' and exists(select 1 from public.salon_members where user_id=(select auth.uid())));
create or replace function public.bump_salon_revision() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 new.revision := old.revision+1;
 new.updated_at := clock_timestamp();
 return new;
end;
$$;
drop trigger if exists bump_salon_revision on public.salon_data;
create trigger bump_salon_revision before update on public.salon_data
for each row execute function public.bump_salon_revision();
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='salon_data') then
  alter publication supabase_realtime add table public.salon_data;
 end if;
end $$;

create or replace function public.bump_salon_revision() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if current_user = 'authenticated' and coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-client-info','') <> 'rabab-salon-sync/3' then
  raise exception 'نسخة الموقع قديمة. حدّث الصفحة قبل الحفظ (Ctrl+Shift+R).' using errcode='P0001';
 end if;
 new.revision := old.revision+1;
 new.updated_at := clock_timestamp();
 return new;
end;
$$;