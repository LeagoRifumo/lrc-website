-- LRC Workplace (private staff page: /workplace.html) — run once in Supabase: SQL Editor → New query → paste all → Run.
--
-- Staff sign in with a USERNAME and password. Behind the scenes the username is an email at the LRC domain:
--   username "prayer.nkuna"  →  sign-in email "prayer.nkuna@leagorifumocapital.co.za" (no real mailbox needed).
--
-- FIRST ADMIN (once):
--   1. Supabase → Authentication → Users → Add user → Create new user:
--        email  prayer.nkuna@leagorifumocapital.co.za   password  (your choice)   tick "Auto Confirm User".
--   2. Run this whole file.
--   3. Run:  select public.wp_bootstrap_admin('prayer.nkuna', 'Prayer Nkuna');
-- ADDING STAFF later: create the user the same way (username@leagorifumocapital.co.za, a temporary password,
-- Auto Confirm), then add them on the Workplace's Team page. They change the password themselves after signing in.
--
-- Data: one table of documents (wp_docs), one row per item (a handover, a flag, a show...). Staff read everything.
-- Staff write handovers, flags, prices; only admins write settings, picks, shows and forecasts. The website's
-- automation (service key, GitHub Actions) loads the AI agents' work.

create extension if not exists pgcrypto;

create table if not exists public.wp_staff (
  uid       uuid primary key references auth.users(id) on delete cascade,
  username  text not null unique,
  name      text not null,
  admin     boolean not null default false,
  desks     jsonb not null default '{}'::jsonb,
  added_at  timestamptz not null default now()
);

create table if not exists public.wp_docs (
  path        text primary key,
  coll        text not null,
  id          text not null,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create index if not exists wp_docs_coll on public.wp_docs (coll);

alter table public.wp_staff enable row level security;
alter table public.wp_docs  enable row level security;
grant select on public.wp_staff to authenticated;
grant select, insert, update, delete on public.wp_docs to authenticated;
revoke all on public.wp_staff, public.wp_docs from anon;

create or replace function public.wp_is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.wp_staff where uid = auth.uid()) $$;
create or replace function public.wp_is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.wp_staff where uid = auth.uid() and admin) $$;
grant execute on function public.wp_is_staff(), public.wp_is_admin() to authenticated;

-- which collections staff may write; the rest are admin-only (and the automation)
create or replace function public.wp_staff_coll(c text) returns boolean language sql immutable as $$
  select c in ('ideas', 'flags', 'marks') $$;

drop policy if exists "wp staff read staff" on public.wp_staff;
create policy "wp staff read staff" on public.wp_staff for select to authenticated using (public.wp_is_staff());
drop policy if exists "wp read" on public.wp_docs;
create policy "wp read" on public.wp_docs for select to authenticated using (public.wp_is_staff());
drop policy if exists "wp insert" on public.wp_docs;
create policy "wp insert" on public.wp_docs for insert to authenticated with check (public.wp_is_admin() or (public.wp_is_staff() and public.wp_staff_coll(coll)));
drop policy if exists "wp update" on public.wp_docs;
create policy "wp update" on public.wp_docs for update to authenticated using (public.wp_is_admin() or (public.wp_is_staff() and public.wp_staff_coll(coll)))
  with check (public.wp_is_admin() or (public.wp_is_staff() and public.wp_staff_coll(coll)));
drop policy if exists "wp delete" on public.wp_docs;
create policy "wp delete" on public.wp_docs for delete to authenticated using (public.wp_is_admin() or (public.wp_is_staff() and coll = 'ideas' and data->>'status' in ('draft', 'watchlist')));

-- keep coll/id in step with the path and stamp who changed it
create or replace function public.wp_docs_stamp() returns trigger language plpgsql as $$
begin
  new.coll := regexp_replace(new.path, '/[^/]+$', '');
  new.id := regexp_replace(new.path, '^.*/', '');
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists wp_docs_stamp on public.wp_docs;
create trigger wp_docs_stamp before insert or update on public.wp_docs for each row execute function public.wp_docs_stamp();

-- merge fields into a document (shallow), creating it if needed; RLS still applies
create or replace function public.wp_merge(p_path text, p_patch jsonb) returns void language plpgsql security invoker set search_path = public as $$
begin
  insert into public.wp_docs (path, coll, id, data) values (p_path, '', '', p_patch)
  on conflict (path) do update set data = public.wp_docs.data || excluded.data;
end $$;
grant execute on function public.wp_merge(text, jsonb) to authenticated;

-- who am I
create or replace function public.wp_me() returns setof public.wp_staff language sql stable security definer set search_path = public as $$
  select * from public.wp_staff where uid = auth.uid() $$;
grant execute on function public.wp_me() to authenticated;

-- admin: add / change / remove staff (the sign-in account must already exist in Authentication → Users)
create or replace function public.wp_add_staff(p_username text, p_name text, p_desks jsonb, p_admin boolean default false) returns void
language plpgsql security definer set search_path = public, auth as $$
declare u uuid; e text := lower(trim(p_username)) || '@leagorifumocapital.co.za';
begin
  if not public.wp_is_admin() then raise exception 'Only an admin can add staff.'; end if;
  select id into u from auth.users where lower(email) = e;
  if u is null then raise exception 'No sign-in account for %. Create it first in Supabase → Authentication → Users (email %, Auto Confirm).', p_username, e; end if;
  insert into public.wp_staff (uid, username, name, admin, desks) values (u, lower(trim(p_username)), trim(p_name), coalesce(p_admin, false), coalesce(p_desks, '{}'::jsonb))
  on conflict (uid) do update set name = excluded.name, desks = excluded.desks, admin = excluded.admin;
end $$;
create or replace function public.wp_set_desks(p_uid uuid, p_desks jsonb) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.wp_is_admin() then raise exception 'Only an admin can change desk access.'; end if;
  update public.wp_staff set desks = p_desks where uid = p_uid;
end $$;
create or replace function public.wp_remove_staff(p_uid uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.wp_is_admin() then raise exception 'Only an admin can remove staff.'; end if;
  if p_uid = auth.uid() then raise exception 'You can''t remove yourself.'; end if;
  delete from public.wp_staff where uid = p_uid;
end $$;
-- admin: set a temporary password for a staff member who forgot theirs
create or replace function public.wp_reset_password(p_uid uuid, p_password text) returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not public.wp_is_admin() then raise exception 'Only an admin can reset passwords.'; end if;
  if not exists (select 1 from public.wp_staff where uid = p_uid) then raise exception 'Not a staff member.'; end if;
  if length(p_password) < 8 then raise exception 'Use at least 8 characters.'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_uid;
end $$;
revoke all on function public.wp_add_staff(text, text, jsonb, boolean), public.wp_set_desks(uuid, jsonb), public.wp_remove_staff(uuid), public.wp_reset_password(uuid, text) from public, anon;
grant execute on function public.wp_add_staff(text, text, jsonb, boolean), public.wp_set_desks(uuid, jsonb), public.wp_remove_staff(uuid), public.wp_reset_password(uuid, text) to authenticated;

-- first admin (run once from the SQL editor, after creating the sign-in account)
create or replace function public.wp_bootstrap_admin(p_username text, p_name text) returns text
language plpgsql security definer set search_path = public, auth as $$
declare u uuid; e text := lower(trim(p_username)) || '@leagorifumocapital.co.za';
begin
  if exists (select 1 from public.wp_staff where admin) then return 'An admin already exists; add staff from the Workplace Team page.'; end if;
  select id into u from auth.users where lower(email) = e;
  if u is null then raise exception 'Create the sign-in account % first (Authentication → Users, Auto Confirm).', e; end if;
  insert into public.wp_staff (uid, username, name, admin, desks)
  values (u, lower(trim(p_username)), p_name, true, '{"eq_fund":true,"eq_tech":true,"fx_fund":true,"fx_tech":true,"cm_fund":true,"cm_tech":true}'::jsonb)
  on conflict (uid) do update set admin = true;
  return 'Admin ready: ' || p_name;
end $$;
revoke all on function public.wp_bootstrap_admin(text, text) from public, anon, authenticated;

-- live updates on the page
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'wp_docs') then
    execute 'alter publication supabase_realtime add table public.wp_docs';
  end if;
exception when undefined_object then null; end $$;
