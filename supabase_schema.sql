create table if not exists public.banxuexing_storage (
  id text primary key,
  storage jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_banxuexing_storage_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_banxuexing_storage_updated_at on public.banxuexing_storage;
create trigger trg_banxuexing_storage_updated_at
before update on public.banxuexing_storage
for each row
execute function public.set_banxuexing_storage_updated_at();

alter table public.banxuexing_storage enable row level security;

drop policy if exists "banxuexing_storage_select_all" on public.banxuexing_storage;
create policy "banxuexing_storage_select_all"
on public.banxuexing_storage
for select
using (true);

drop policy if exists "banxuexing_storage_insert_all" on public.banxuexing_storage;
create policy "banxuexing_storage_insert_all"
on public.banxuexing_storage
for insert
with check (true);

drop policy if exists "banxuexing_storage_update_all" on public.banxuexing_storage;
create policy "banxuexing_storage_update_all"
on public.banxuexing_storage
for update
using (true)
with check (true);

insert into public.banxuexing_storage (id)
values ('global')
on conflict (id) do nothing;
