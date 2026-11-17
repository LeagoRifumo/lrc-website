-- LRC Trading Desk (private staff page: /desk.html) — run once in Supabase: SQL Editor → New query → paste all → Run.
-- BEFORE running: create the four desk accounts in Supabase → Authentication → Users → Add user → "Create new user",
-- tick "Auto Confirm User", and give each the password you choose for that desk:
--   info+forex-fundamental@leagorifumocapital.co.za    info+forex-technical@leagorifumocapital.co.za
--   info+equity-fundamental@leagorifumocapital.co.za   info+equity-technical@leagorifumocapital.co.za
-- These are "plus" addresses of info@: password-reset links ("Forgot password?" on the desk page) arrive in the info@ inbox.
-- Run this file AFTER creating them (the last block links them to their desks). Running it again is safe.
-- Already created the older forex.fundamental@… style accounts? Keep them: this file renames them to the new addresses.
-- Every change goes through the functions below, so the rules hold even if someone edits the page in their browser:
-- the technical desk can't act until a handover, disagreement = no trade, Low confidence can't be handed over, etc.

create table if not exists public.desk_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  desk    text not null check (desk in ('fx','eq')),
  role    text not null check (role in ('fund','tech')),
  unique (desk, role)
);

create table if not exists public.desk_settings (
  id         int primary key default 1 check (id = 1),
  min_rr     numeric not null default 1.5,
  fx_expiry  int not null default 7,
  eq_expiry  int not null default 14
);
insert into public.desk_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.desk_ideas (
  id             uuid primary key default gen_random_uuid(),
  desk           text not null check (desk in ('fx','eq')),
  status         text not null check (status in ('draft','watchlist','handed_over','waiting','approved','executed','closed','no_trade','withdrawn','cancelled')),
  fund           jsonb not null,
  tech           jsonb,
  verdict        jsonb,
  exec           jsonb,
  close          jsonb,
  expiry         date not null,
  cancel_note    text,
  history        jsonb not null default '[]'::jsonb,
  created_by     text,
  created_at     timestamptz not null default now(),
  handed_over_at timestamptz,
  updated_at     timestamptz not null default now()
);
create index if not exists desk_ideas_desk on public.desk_ideas (desk, status);

alter table public.desk_accounts enable row level security;
alter table public.desk_settings enable row level security;
alter table public.desk_ideas    enable row level security;
grant select on public.desk_accounts, public.desk_settings, public.desk_ideas to authenticated;
revoke insert, update, delete on public.desk_accounts, public.desk_settings, public.desk_ideas from anon, authenticated;

-- Who is signed in (null for anyone who isn't a desk account, e.g. ordinary website members).
create or replace function public.desk_me() returns table (desk text, role text)
language sql stable security definer set search_path = public as $$
  select a.desk, a.role from public.desk_accounts a where a.user_id = auth.uid()
$$;
revoke all on function public.desk_me() from public, anon;
grant execute on function public.desk_me() to authenticated;

-- Desk accounts read both boards and the settings. Nobody writes the tables directly.
drop policy if exists "desk read ideas" on public.desk_ideas;
create policy "desk read ideas" on public.desk_ideas for select to authenticated using (exists (select 1 from public.desk_accounts a where a.user_id = auth.uid()));
drop policy if exists "desk read settings" on public.desk_settings;
create policy "desk read settings" on public.desk_settings for select to authenticated using (exists (select 1 from public.desk_accounts a where a.user_id = auth.uid()));
drop policy if exists "desk read own account" on public.desk_accounts;
create policy "desk read own account" on public.desk_accounts for select to authenticated using (user_id = auth.uid());

-- ---------- helpers ----------
create or replace function public.desk_today() returns date language sql stable as $$ select (now() at time zone 'Africa/Johannesburg')::date $$;

create or replace function public.desk_require(p_desk text, p_role text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.desk_accounts where user_id = auth.uid() and desk = p_desk and role = p_role) then
    raise exception 'Sign in as the % % desk to do this.', case p_desk when 'fx' then 'Forex' else 'Equity' end, case p_role when 'fund' then 'Fundamental' else 'Technical' end;
  end if;
end $$;

create or replace function public.desk_hist(p_desk text, p_role text, p_name text, p_action text) returns jsonb
language sql stable as $$
  select jsonb_build_object('at', now(), 'by', coalesce(nullif(trim(p_name), ''), 'Unnamed'),
    'role', (case p_desk when 'fx' then 'Forex' else 'Equity' end) || ' ' || (case p_role when 'fund' then 'fundamental' else 'technical' end), 'action', p_action)
$$;

create or replace function public.desk_get(p_id uuid) returns public.desk_ideas
language plpgsql security definer set search_path = public as $$
declare r public.desk_ideas;
begin
  select * into r from public.desk_ideas where id = p_id for update;
  if not found then raise exception 'That idea no longer exists.'; end if;
  return r;
end $$;

-- ---------- the decision rules (same as the page shows) ----------
create or replace function public.desk_verdict(f jsonb, t jsonb, p_min_rr numeric) returns jsonb
language plpgsql immutable as $$
declare
  fb text := f->>'bias'; tb text := t->>'bias'; st text := t->>'setup';
  e numeric := nullif(t->>'entry','')::numeric; s numeric := nullif(t->>'stop','')::numeric; g numeric := nullif(t->>'target','')::numeric;
  rr numeric; reasons text[] := '{}'; codes text[] := '{}'; is_full boolean;
begin
  if st = 'No setup yet – wait' then
    return jsonb_build_object('status','waiting','reasons', jsonb_build_array('The technical desk sees no valid setup yet. The idea stays open until its expiry date.'),'codes','[]'::jsonb);
  end if;
  if tb is distinct from fb then codes := codes || 'direction'::text; reasons := reasons || format('The desks disagree on direction: fundamental says %s, technical says %s.', fb, coalesce(tb,'nothing')); end if;
  if st = 'Supply zone' and fb = 'Buy' then codes := codes || 'setup_conflict'::text; reasons := reasons || 'A supply zone is a sell setup, but the fundamental bias is Buy.'::text; end if;
  if st = 'Demand zone' and fb = 'Sell' then codes := codes || 'setup_conflict'::text; reasons := reasons || 'A demand zone is a buy setup, but the fundamental bias is Sell.'::text; end if;
  if f->>'conf' = 'Low' then codes := codes || 'fund_low'::text; reasons := reasons || 'Fundamental confidence is Low.'::text; end if;
  if t->>'conf' = 'Low' then codes := codes || 'tech_low'::text; reasons := reasons || 'Technical confidence is Low.'::text; end if;
  if e > 0 and s > 0 and g > 0 and fb = 'Buy' and s < e and g > e then rr := (g - e) / (e - s);
  elsif e > 0 and s > 0 and g > 0 and fb = 'Sell' and s > e and g < e then rr := (e - g) / (s - e);
  end if;
  if rr is null then codes := codes || 'levels'::text; reasons := reasons || format('Entry, stop and target don''t fit a %s trade.', fb);
  elsif rr < p_min_rr - 0.000001 then codes := codes || 'rr_low'::text; reasons := reasons || format('Risk-to-reward of 1 : %s is below the 1 : %s minimum.', round(rr, 2), p_min_rr); end if;
  if array_length(codes, 1) > 0 then
    return jsonb_build_object('status','no_trade','reasons', to_jsonb(reasons),'codes', to_jsonb(codes),'rr', round(rr, 4));
  end if;
  is_full := f->>'conf' = 'High' and t->>'conf' = 'High' and t->>'trend' = 'Pro-trend';
  if is_full then reasons := array['Both desks rate it High and the setup is pro-trend.'];
  else
    if t->>'trend' = 'Counter-trend' then reasons := reasons || 'Counter-trend setup, so size is reduced.'::text; end if;
    if f->>'conf' <> 'High' or t->>'conf' <> 'High' then reasons := reasons || format('Confidence is %s fundamental / %s technical, so size is reduced.', f->>'conf', t->>'conf'); end if;
  end if;
  return jsonb_build_object('status','approved','size', case when is_full then 'Full size' else 'Reduced size' end,'reasons', to_jsonb(reasons),'codes','[]'::jsonb,'rr', round(rr, 4));
end $$;

-- ---------- fundamental desk ----------
create or replace function public.desk_save_fund(p_id uuid, p_desk text, p_fund jsonb, p_expiry date, p_handover boolean, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare r public.desk_ideas; st text; hand boolean; act text;
begin
  perform public.desk_require(p_desk, 'fund');
  if coalesce(p_fund->>'asset','') = '' or p_fund->>'bias' not in ('Buy','Sell') or p_fund->>'conf' not in ('High','Medium','Low')
     or coalesce(p_fund->>'thesis','') = '' or coalesce(p_fund->>'invalidation','') = '' then
    raise exception 'Fill in the asset, bias, confidence, thesis and what would change the bias.';
  end if;
  if p_expiry < public.desk_today() then raise exception 'The expiry date can''t be in the past.'; end if;
  hand := p_handover and p_fund->>'conf' <> 'Low';
  st := case when hand then 'handed_over' when p_fund->>'conf' = 'Low' then 'watchlist' else 'draft' end;
  act := case when hand then 'handed over to technical' when st = 'watchlist' then 'saved to watchlist' else 'saved as draft' end;
  if p_id is null then
    insert into public.desk_ideas (desk, status, fund, expiry, created_by, handed_over_at, history)
    values (p_desk, st, p_fund, p_expiry, nullif(trim(p_name), ''), case when hand then now() end,
            jsonb_build_array(public.desk_hist(p_desk, 'fund', p_name, 'Created and ' || act)))
    returning id into p_id;
  else
    r := public.desk_get(p_id);
    if r.desk <> p_desk then raise exception 'That idea belongs to the other desk.'; end if;
    if r.status not in ('draft','watchlist') then raise exception 'Only drafts and watchlist ideas can be edited. This one has already been handed over.'; end if;
    update public.desk_ideas set status = st, fund = p_fund, expiry = p_expiry, updated_at = now(),
      handed_over_at = case when hand then now() else null end,
      history = history || jsonb_build_array(public.desk_hist(p_desk, 'fund', p_name, 'Edited and ' || act))
    where id = p_id;
  end if;
  return p_id;
end $$;

create or replace function public.desk_handover(p_id uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.desk_ideas;
begin
  r := public.desk_get(p_id); perform public.desk_require(r.desk, 'fund');
  if r.status <> 'draft' then raise exception 'Only drafts can be handed over.'; end if;
  if r.fund->>'conf' = 'Low' then raise exception 'Low-confidence ideas can''t be handed over.'; end if;
  if r.expiry < public.desk_today() then raise exception 'The bias has expired. Change the expiry date first.'; end if;
  update public.desk_ideas set status = 'handed_over', handed_over_at = now(), updated_at = now(),
    history = history || jsonb_build_array(public.desk_hist(r.desk, 'fund', p_name, 'Handed over to technical')) where id = p_id;
end $$;

create or replace function public.desk_extend(p_id uuid, p_expiry date, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.desk_ideas;
begin
  r := public.desk_get(p_id); perform public.desk_require(r.desk, 'fund');
  if r.status not in ('draft','watchlist','handed_over','waiting') then raise exception 'This idea is no longer open.'; end if;
  if p_expiry < public.desk_today() then raise exception 'The expiry date can''t be in the past.'; end if;
  update public.desk_ideas set expiry = p_expiry, updated_at = now(),
    history = history || jsonb_build_array(public.desk_hist(r.desk, 'fund', p_name, 'Bias valid until ' || to_char(p_expiry, 'DD Mon YYYY'))) where id = p_id;
end $$;

create or replace function public.desk_withdraw(p_id uuid, p_reason text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.desk_ideas;
begin
  r := public.desk_get(p_id); perform public.desk_require(r.desk, 'fund');
  if r.status not in ('handed_over','waiting') then raise exception 'Only handed-over ideas waiting for technical can be withdrawn.'; end if;
  update public.desk_ideas set status = 'withdrawn', cancel_note = 'Withdrawn by fundamental: ' || p_reason, updated_at = now(),
    history = history || jsonb_build_array(public.desk_hist(r.desk, 'fund', p_name, 'Withdrawn: ' || p_reason)) where id = p_id;
end $$;

create or replace function public.desk_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.desk_ideas;
begin
  r := public.desk_get(p_id); perform public.desk_require(r.desk, 'fund');
  if r.status not in ('draft','watchlist') then raise exception 'Only drafts and watchlist ideas can be deleted; everything else stays in the log.'; end if;
  delete from public.desk_ideas where id = p_id;
end $$;

-- ---------- technical desk ----------
create or replace function public.desk_review(p_id uuid, p_tech jsonb, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.desk_ideas; v jsonb; t jsonb; mrr numeric; act text;
begin
  r := public.desk_get(p_id); perform public.desk_require(r.desk, 'tech');
  if r.status not in ('handed_over','waiting') then raise exception 'The technical desk can only review ideas the fundamental desk has handed over.'; end if;
  if r.expiry < public.desk_today() then raise exception 'This bias has expired. The fundamental desk must renew it first.'; end if;
  if p_tech->>'setup' not in ('Supply zone','Demand zone','Break and retest','No setup yet – wait') then raise exception 'Choose a setup.'; end if;
  select min_rr into mrr from public.desk_settings where id = 1;
  v := public.desk_verdict(r.fund, p_tech, coalesce(mrr, 1.5));
  t := p_tech || jsonb_build_object('rr', v->'rr', 'at', now(), 'by', nullif(trim(p_name), ''));
  act := case v->>'status' when 'approved' then 'Technical approved · ' || (v->>'size') when 'waiting' then 'Technical: no setup yet, waiting' else 'Technical review: no trade' end;
  update public.desk_ideas set tech = t, verdict = v - 'rr', status = v->>'status', updated_at = now(),
    history = history || jsonb_build_array(public.desk_hist(r.desk, 'tech', p_name, act)) where id = p_id;
  return v;
end $$;

create or replace function public.desk_fill(p_id uuid, p_fill numeric, p_date date, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.desk_ideas;
begin
  r := public.desk_get(p_id); perform public.desk_require(r.desk, 'tech');
  if r.status <> 'approved' then raise exception 'Only approved trades can be marked as filled.'; end if;
  if p_fill is null or p_fill <= 0 then raise exception 'Enter the fill price.'; end if;
  update public.desk_ideas set status = 'executed', exec = jsonb_build_object('fill', p_fill, 'date', p_date), updated_at = now(),
    history = history || jsonb_build_array(public.desk_hist(r.desk, 'tech', p_name, 'Filled at ' || p_fill)) where id = p_id;
end $$;

create or replace function public.desk_not_filled(p_id uuid, p_reason text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.desk_ideas;
begin
  r := public.desk_get(p_id); perform public.desk_require(r.desk, 'tech');
  if r.status <> 'approved' then raise exception 'Only approved trades can be marked as not filled.'; end if;
  update public.desk_ideas set status = 'cancelled', cancel_note = 'Not filled: ' || p_reason, updated_at = now(),
    history = history || jsonb_build_array(public.desk_hist(r.desk, 'tech', p_name, 'Not filled: ' || p_reason)) where id = p_id;
end $$;

create or replace function public.desk_trail(p_id uuid, p_stop numeric, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.desk_ideas; cur numeric; buy boolean; trail jsonb;
begin
  r := public.desk_get(p_id); perform public.desk_require(r.desk, 'tech');
  if r.status <> 'executed' then raise exception 'You can only trail the stop on a live trade.'; end if;
  buy := r.fund->>'bias' = 'Buy';
  cur := coalesce((r.exec->>'stop')::numeric, (r.tech->>'stop')::numeric);
  if p_stop is null or p_stop <= 0 then raise exception 'Enter the new stop price.'; end if;
  if (buy and p_stop <= cur) or (not buy and p_stop >= cur) then
    raise exception 'A trailing stop can only move in your favour: % than the current stop of %.', case when buy then 'higher' else 'lower' end, cur;
  end if;
  trail := coalesce(r.exec->'trail', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('from', cur, 'to', p_stop, 'at', now(), 'by', nullif(trim(p_name), '')));
  update public.desk_ideas set exec = r.exec || jsonb_build_object('stop', p_stop, 'trail', trail), updated_at = now(),
    history = history || jsonb_build_array(public.desk_hist(r.desk, 'tech', p_name, format('Stop trailed from %s to %s', cur, p_stop))) where id = p_id;
end $$;

-- R is always measured against the ORIGINAL stop (the risk taken at entry), so trailing never inflates the result.
create or replace function public.desk_close(p_id uuid, p_exit numeric, p_date date, p_notes text, p_name text) returns numeric
language plpgsql security definer set search_path = public as $$
declare r public.desk_ideas; e numeric; s numeric; risk numeric; rm numeric; res text; buy boolean;
begin
  r := public.desk_get(p_id); perform public.desk_require(r.desk, 'tech');
  if r.status <> 'executed' then raise exception 'Only live trades can be closed.'; end if;
  buy := r.fund->>'bias' = 'Buy';
  e := coalesce((r.exec->>'fill')::numeric, (r.tech->>'entry')::numeric); s := (r.tech->>'stop')::numeric;
  risk := case when buy then e - s else s - e end;
  if p_exit is null or p_exit <= 0 or risk is null or risk <= 0 then raise exception 'The result can''t be worked out from these prices. Check the exit price.'; end if;
  rm := round((case when buy then p_exit - e else e - p_exit end) / risk, 2);
  res := case when rm > 0.05 then 'Win' when rm < -0.05 then 'Loss' else 'Breakeven' end;
  update public.desk_ideas set status = 'closed', updated_at = now(),
    close = jsonb_build_object('exit', p_exit, 'date', p_date, 'r', rm, 'result', res, 'notes', coalesce(p_notes, '')),
    history = history || jsonb_build_array(public.desk_hist(r.desk, 'tech', p_name, format('Closed %sR (%s)', rm, res))) where id = p_id;
  return rm;
end $$;

-- Only desk accounts may call the desk functions (the checks inside also confirm the right desk and role).
do $$
declare fn text;
begin
  foreach fn in array array[
    'desk_save_fund(uuid,text,jsonb,date,boolean,text)', 'desk_handover(uuid,text)', 'desk_extend(uuid,date,text)', 'desk_withdraw(uuid,text,text)',
    'desk_delete(uuid)', 'desk_review(uuid,jsonb,text)', 'desk_fill(uuid,numeric,date,text)', 'desk_not_filled(uuid,text,text)',
    'desk_close(uuid,numeric,date,text,text)', 'desk_trail(uuid,numeric,text)'] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
  foreach fn in array array['desk_require(text,text)', 'desk_hist(text,text,text,text)', 'desk_get(uuid)', 'desk_verdict(jsonb,jsonb,numeric)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
  end loop;
end $$;

-- Rename desk accounts created with the earlier addresses (forex.fundamental@… → info+forex-fundamental@…), keeping their passwords.
with m(old_email, new_email) as (values
  ('forex.fundamental@leagorifumocapital.co.za','info+forex-fundamental@leagorifumocapital.co.za'), ('forex.technical@leagorifumocapital.co.za','info+forex-technical@leagorifumocapital.co.za'),
  ('equity.fundamental@leagorifumocapital.co.za','info+equity-fundamental@leagorifumocapital.co.za'), ('equity.technical@leagorifumocapital.co.za','info+equity-technical@leagorifumocapital.co.za'))
update auth.users u set email = m.new_email, updated_at = now()
from m where lower(u.email) = m.old_email and not exists (select 1 from auth.users x where lower(x.email) = m.new_email);
update auth.identities i set identity_data = i.identity_data || jsonb_build_object('email', u.email)
from auth.users u where i.user_id = u.id and i.provider = 'email' and u.email like 'info+%-%@leagorifumocapital.co.za'
  and coalesce(i.identity_data->>'email', '') <> u.email;

-- Link the four desk accounts (created above in Authentication → Users) to their desks.
insert into public.desk_accounts (user_id, desk, role)
select u.id, m.desk, m.role from auth.users u
join (values ('info+forex-fundamental@leagorifumocapital.co.za','fx','fund'), ('info+forex-technical@leagorifumocapital.co.za','fx','tech'),
             ('info+equity-fundamental@leagorifumocapital.co.za','eq','fund'), ('info+equity-technical@leagorifumocapital.co.za','eq','tech')) as m(email, desk, role)
  on lower(u.email) = m.email
on conflict (user_id) do update set desk = excluded.desk, role = excluded.role;

-- Check: this should list four rows. If one is missing, that account wasn't created in Authentication → Users.
select u.email, a.desk, a.role from public.desk_accounts a join auth.users u on u.id = a.user_id order by a.desk, a.role;

-- Settings: change the rules here, e.g.  update public.desk_settings set min_rr = 2, fx_expiry = 5 where id = 1;
