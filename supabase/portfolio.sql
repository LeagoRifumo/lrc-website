-- LRC Portfolio Journal (members only) — run once in Supabase: SQL Editor → New query → paste all → Run.
-- Every member sees and changes ONLY their own positions and journal (row level security on auth.uid()).
-- The website automation (service key) reads holdings to fetch news and send alerts; it never shows one member's data to another.

-- 1. Positions: what a member holds (or held)
create table if not exists public.portfolio_positions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ticker       text not null check (char_length(ticker) between 1 and 20),
  name         text,
  market       text check (market in ('JSE', 'US')),
  currency     text check (currency in ('ZAR', 'USD')),
  qty          numeric not null check (qty > 0),
  entry_price  numeric not null check (entry_price > 0),
  entry_date   date default current_date,
  thesis       text check (char_length(thesis) <= 4000),
  target_low   numeric,
  target_high  numeric,
  stop         numeric,
  exit_price   numeric,
  closed_on    date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists portfolio_positions_user on public.portfolio_positions (user_id);
create index if not exists portfolio_positions_ticker on public.portfolio_positions (ticker) where closed_on is null;

-- 2. Journal: dated analyst notes (thesis, review, trade, note), optionally tied to a company
create table if not exists public.portfolio_journal (
  id          bigserial primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ticker      text,
  kind        text not null default 'note' check (kind in ('note', 'thesis', 'review', 'trade', 'risk')),
  body        text not null check (char_length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index if not exists portfolio_journal_user on public.portfolio_journal (user_id, created_at desc);

-- 3. News, prices and next results for every company that members hold (written by the automation every 30 min).
--    Public market information only — no member data in this table.
create table if not exists public.portfolio_news (
  ticker      text primary key,
  name        text,
  quote       jsonb,
  news        jsonb,
  next_results date,
  alerts      jsonb,
  updated_at  timestamptz not null default now()
);

-- 4. Which alerts each member has already been emailed (automation only; members cannot read it)
create table if not exists public.alert_log (
  user_id  uuid not null references auth.users(id) on delete cascade,
  k        text not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, k)
);

-- 4b. Long or short (short = sold first; profit when the price falls)
alter table public.portfolio_positions add column if not exists side text not null default 'long' check (side in ('long', 'short'));

-- 5. Email preference: market-moving news on my holdings
alter table public.profiles add column if not exists portfolio_alerts boolean not null default true;

alter table public.portfolio_positions enable row level security;
alter table public.portfolio_journal   enable row level security;
alter table public.portfolio_news      enable row level security;
alter table public.alert_log           enable row level security;

drop policy if exists "own positions" on public.portfolio_positions;
create policy "own positions" on public.portfolio_positions for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own journal" on public.portfolio_journal;
create policy "own journal" on public.portfolio_journal for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "members read holding news" on public.portfolio_news;
create policy "members read holding news" on public.portfolio_news for select to authenticated using (true);
-- alert_log: no policies = no member access (service key only)

-- keep updated_at fresh and cap each member at 150 open positions
create or replace function public.portfolio_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' and (select count(*) from public.portfolio_positions where user_id = new.user_id and closed_on is null) >= 150 then
    raise exception 'Portfolio limit reached (150 open positions)';
  end if;
  return new;
end $$;
drop trigger if exists portfolio_touch on public.portfolio_positions;
create trigger portfolio_touch before insert or update on public.portfolio_positions for each row execute function public.portfolio_touch();

-- ===== v1.2 Account & track record =====
-- 6. Money in and out of the account (deposits, withdrawals, dividends received, fees, interest)
create table if not exists public.portfolio_flows (
  id         bigserial primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('deposit', 'withdrawal', 'dividend', 'fee', 'interest')),
  amount     numeric not null check (amount > 0),
  currency   text not null default 'ZAR' check (currency in ('ZAR', 'USD')),
  flow_date  date not null default current_date,
  note       text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists portfolio_flows_user on public.portfolio_flows (user_id, flow_date);
alter table public.portfolio_flows enable row level security;
drop policy if exists "own flows" on public.portfolio_flows;
create policy "own flows" on public.portfolio_flows for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 7. Cash currently in the account (entered by the member)
alter table public.profiles add column if not exists cash_zar numeric;
alter table public.profiles add column if not exists cash_usd numeric;
alter table public.profiles add column if not exists cash_at timestamptz;

-- 8. Daily track record (written by the Portfolio Desk from closing prices; members can only read their own)
create table if not exists public.portfolio_snapshots (
  user_id   uuid not null references auth.users(id) on delete cascade,
  d         date not null,
  book      numeric,          -- value of open positions in rand (cost + profit/loss)
  invested  numeric,          -- cost of open positions in rand
  flow      numeric,          -- money put into (+) or taken out of (-) positions that day, in rand
  n         int,              -- open positions
  at        timestamptz not null default now(),
  primary key (user_id, d)
);
alter table public.portfolio_snapshots enable row level security;
drop policy if exists "own snapshots" on public.portfolio_snapshots;
create policy "own snapshots" on public.portfolio_snapshots for select to authenticated using (auth.uid() = user_id);

-- 9. Broker trade ID (so the same trade is never imported twice)
alter table public.portfolio_positions add column if not exists ext_id text;
create unique index if not exists portfolio_positions_ext on public.portfolio_positions (user_id, ext_id) where ext_id is not null;

-- 10. Benchmarks for the performance charts (public market data, written by the Portfolio Desk)
create table if not exists public.portfolio_bench (
  d       date primary key,
  spx     numeric,   -- S&P 500 index (USD)
  j200    numeric,   -- JSE Top 40 (Satrix 40 ETF, rand)
  usdzar  numeric    -- rand per dollar
);
alter table public.portfolio_bench enable row level security;
drop policy if exists "members read bench" on public.portfolio_bench;
create policy "members read bench" on public.portfolio_bench for select to authenticated using (true);
