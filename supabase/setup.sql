-- LRC members area — run once in Supabase: SQL Editor → New query → paste all → Run.
-- Members (anyone signed in) can READ the Top Picks. Only the website's automation (service key) can WRITE them.

create table if not exists public.top_picks (
  kind        text not null check (kind in ('trading','investment')),
  market      text not null,
  ticker      text not null,
  rank        int  not null,
  data        jsonb not null,
  added_on    date not null default current_date,
  added_price numeric,
  updated_at  timestamptz not null default now(),
  primary key (kind, market, ticker)
);

create table if not exists public.picks_history (
  id            bigserial primary key,
  kind          text not null,
  market        text not null,
  ticker        text not null,
  name          text,
  added_on      date not null,
  added_price   numeric,
  removed_on    date,
  removed_price numeric
);
create index if not exists picks_history_open on public.picks_history (kind, market, ticker) where removed_on is null;

create table if not exists public.picks_meta (
  id          int primary key default 1 check (id = 1),
  generated   timestamptz,
  scanner_run text,
  rules       jsonb
);

-- Member profiles (one row per account). POPIA: members can read, change and delete their own row only.
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  email         text,
  markets       text[] default array['JSE','US'],
  email_updates boolean not null default false,
  created_at    timestamptz not null default now()
);

alter table public.top_picks     enable row level security;
alter table public.picks_history enable row level security;
alter table public.picks_meta    enable row level security;
alter table public.profiles      enable row level security;

drop policy if exists "members read picks"   on public.top_picks;
drop policy if exists "members read history" on public.picks_history;
drop policy if exists "members read meta"    on public.picks_meta;
create policy "members read picks"   on public.top_picks     for select to authenticated using (true);
create policy "members read history" on public.picks_history for select to authenticated using (true);
create policy "members read meta"    on public.picks_meta    for select to authenticated using (true);

drop policy if exists "own profile read"   on public.profiles;
drop policy if exists "own profile insert" on public.profiles;
drop policy if exists "own profile update" on public.profiles;
drop policy if exists "own profile delete" on public.profiles;
create policy "own profile read"   on public.profiles for select to authenticated using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "own profile delete" on public.profiles for delete to authenticated using (auth.uid() = id);

-- Create the profile automatically when someone signs up.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, email_updates)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', coalesce((new.raw_user_meta_data->>'email_updates')::boolean, false))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Let a member delete their own account (POPIA right to deletion) from the My account page.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
