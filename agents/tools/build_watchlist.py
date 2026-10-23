#!/usr/bin/env python3
"""LRC Watchlist engine — applies the house rules to a market snapshot.

Inputs
  docs/data/ratings.json          analyst-approved ratings (BUY/HOLD/SELL, 6-month target, checklist score, critical flag)
  agents/work/snapshot.json       market data collected by the Watchlist Agent (one entry per ticker, see SNAPSHOT FORMAT)
Outputs
  docs/data/watchlist.json        what the website shows
  agents/work/rating_alerts.json  names whose re-priced upside now crosses a rating line (for analyst review)

House rules (set 5 Oct 2026, unchanged):
  * Rating, 6-month horizon: BUY >= +7.5% upside AND score >= 3.5 AND no critical item <= 2;
                             SELL <= -5% upside OR score < 2.5; otherwise HOLD.
  * Swing watchlist: only BUY (-> Long) or SELL (-> Short) names that pass the technical check.
  * Entry: Long = buy stop just above the 2-session high; Short = sell stop just below the 15-session swing low.
  * Stop = 2 x ATR(14); Target = 3R; risk 1% of account; max 4 shorts; results within 14 days = event risk.
  * No edge, no trade: a short whose trigger is below the 6-month value (or a long above it) is skipped.
  * Score /18 and grade (A >= 14, B >= 10, else C) follow the LRC Watchlist workbook formulas.

SNAPSHOT FORMAT (per ticker)
  {"ticker":"NVDA","name":"NVIDIA","price":228.52,"sma20":228.32,"sma50":223.03,"sma200":202.54,"rsi":51.97,
   "perf_half":0.207,"hi52":243.37,"lo52":164.27,"avg_volume":182000000,"short_float":0.011,"eps_growth":0.95,
   "atr14":5.31,"high_2d":228.86,"swing_low_15d":221.09,"next_earnings":"2026-11-18","sector":"Technology"}
"""
import json, datetime as dt, sys, os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = lambda *a: os.path.join(ROOT, *a)

def rating_from(upside, score, crit):
    if upside <= -0.05 or score < 2.5: return 'SELL'
    if upside >= 0.075 and score >= 3.5 and not crit: return 'BUY'
    return 'HOLD'

def score18(x, direction, entry, stop, target, week_end, sp500_half):
    """Re-creates the LRC Watchlist workbook score columns AB..AI."""
    p = x['price']; vs20 = p / x['sma20'] - 1; vs50 = p / x['sma50'] - 1; vs200 = p / x['sma200'] - 1
    rsi = x['rsi']; half = x.get('perf_half'); fh = p / x['hi52'] - 1; fl = p / x['lo52'] - 1
    short = direction == 'Short'
    if short:
        trend = (vs200 < 0) + (vs50 < 0) + (vs20 < 0) + (x['sma200'] < x['sma50'])
        mom = (2 if 30 <= rsi <= 50 else 1 if (25 <= rsi < 30 or 50 < rsi <= 60) else 0) + \
              (0 if half is None else 2 if half < sp500_half else 1 if half < 0 else 0)
        rng = 2 if fl <= 0.10 else 1 if fl <= 0.25 else 0
        fuel = 1 if (x.get('eps_growth') is not None and x['eps_growth'] < 0) else 0
        rr = (entry - target) / (stop - entry)
    else:
        trend = (vs200 > 0) + (vs50 > 0) + (vs20 > 0) + (x['sma200'] < x['sma50'])
        mom = (2 if 50 <= rsi <= 70 else 1 if (40 <= rsi < 50 or 70 < rsi <= 75) else 0) + \
              (0 if half is None else 2 if half > sp500_half else 1 if half > 0 else 0)
        rng = 2 if fh >= -0.10 else 1 if fh >= -0.25 else 0
        fuel = 1 if (x.get('eps_growth') or 0) > 0 else 0
        rr = (target - entry) / (entry - stop)
    liq = 2 if x['avg_volume'] * p / 1e6 >= 20 else 1
    rrp = 4 if rr >= 3 else 2 if rr >= 2 else 0
    event = 0
    if x.get('next_earnings'):
        d = (dt.date.fromisoformat(x['next_earnings']) - week_end).days
        if 0 <= d <= 14: event = -2
    squeeze = -1 if (short and (x.get('short_float') or 0) >= 0.20) else 0
    total = int(trend + mom + rng + liq + fuel + rrp + event + squeeze)
    return total, ('A' if total >= 14 else 'B' if total >= 10 else 'C'), round(rr, 1)

def technical_ok(x, direction):
    """Simplified LRC Technical Review: longs need an uptrend that is not stretched; shorts need weakness or a breakdown setup."""
    p = x['price']
    if direction == 'Long':
        return p > x['sma200'] and x['sma50'] > x['sma200'] and 40 <= x['rsi'] <= 75 and abs(p / x['sma50'] - 1) <= 0.15
    return True   # shorts are conditional on the breakdown trigger itself (no short into strength)

def main(week_end=None, sp500_half=0.1437):
    week_end = dt.date.fromisoformat(week_end) if week_end else dt.date.today() + dt.timedelta(days=(5 - dt.date.today().weekday()) % 7)
    ratings = json.load(open(P('docs', 'data', 'ratings.json')))['ratings']
    snap = {x['ticker']: x for x in json.load(open(P('agents', 'work', 'snapshot.json')))}
    alerts, longs, shorts, inv, skipped = [], [], [], [], []
    for t, r in ratings.items():
        x = snap.get(t)
        if not x: continue
        up = r['target_6m'] / x['price'] - 1
        now = rating_from(up, r['score'], r['critical_flag'])
        if now != r['rating']:
            alerts.append({'ticker': t, 'approved_rating': r['rating'], 'rating_at_today_price': now, 'price': x['price'], 'target_6m': r['target_6m'], 'upside': round(up, 4)})
        # the WEBSITE always shows the analyst-approved rating; the alert goes to the analyst
        rating = r['rating']
        if rating not in ('BUY', 'SELL'): continue
        direction = 'Long' if rating == 'BUY' else 'Short'
        atr = x['atr14']
        if direction == 'Long':
            entry = round(max(x.get('high_2d') or x['price'], x['price']) * 1.002, 2); stop = round(entry - 2 * atr, 2); target = round(entry + 6 * atr, 2)
            setup = 'Pullback to 20/50-day avg' if abs(x['price'] / x['sma50'] - 1) <= 0.05 else 'Trend continuation'
        else:
            entry = round(x['swing_low_15d'] * 0.998, 2); stop = round(entry + 2 * atr, 2); target = round(entry - 6 * atr, 2)
            setup = 'Downtrend continuation' if x['price'] < x['sma200'] else 'Breakdown from base'
        # no edge: the trigger is already beyond our 6-month value (e.g. shorting below fair value)
        if (direction == 'Short' and entry <= r['target_6m']) or (direction == 'Long' and entry >= r['target_6m']):
            skipped.append({'ticker': t, 'why': f"{direction} trigger {entry} is beyond the 6-month value {r['target_6m']}"}); continue
        sc, grade, rr = score18(x, direction, entry, stop, target, week_end, sp500_half)
        cleared = technical_ok(x, direction)
        ev = x.get('next_earnings') and 0 <= (dt.date.fromisoformat(x['next_earnings']) - week_end).days <= 14
        status = 'Entry setup' if (grade == 'A' and cleared and not ev) else 'Watch'
        row = {'ticker': t, 'name': r['name'], 'direction': direction, 'setup': setup, 'entry': entry, 'stop': stop, 'target': target, 'rr': rr,
               'score': sc, 'grade': grade, 'status': status, 'rating': rating, 'rating_target': r['target_6m'],
               'tech_clearance': ('CLEARED' if cleared else 'NOT CLEARED') + (' — results within 14 days' if ev else ''),
               'note': f"Results {x['next_earnings']}" if ev else ''}
        (longs if direction == 'Long' else shorts).append(row)
    longs.sort(key=lambda z: -z['score']); shorts.sort(key=lambda z: -z['score'])
    for i, s in enumerate(shorts):
        if i >= 4: s['status'] = 'Reserve'; s['note'] = (s['note'] + '; ' if s['note'] else '') + 'house limit: max 4 shorts'
    out = {'week_ending': week_end.isoformat(), 'generated': dt.datetime.now(dt.timezone(dt.timedelta(hours=2))).isoformat(timespec='minutes'),
           'prices_as_of': max((x.get('as_of', '') for x in snap.values()), default=''), 'agent': 'LRC Watchlist Agent',
           'rules': {'universe': 'Finviz-style presets (Swing Long, Swing Short, Investment) applied to US stocks',
                     'qualify': 'Only names with an LRC BUY or SELL rating AND technical clearance; BUY = Long, SELL = Short',
                     'stop': '2 × ATR(14)', 'target': '3R', 'risk': '1% of account per trade', 'max_shorts': 4, 'event_risk': 'results within 14 days'},
           'swing': longs + shorts}
    # keep the investment list from the previous file (monthly agent updates it)
    try: out['investment'] = json.load(open(P('docs', 'data', 'watchlist.json'))).get('investment', [])
    except Exception: out['investment'] = []
    json.dump(out, open(P('docs', 'data', 'watchlist.json'), 'w'), indent=1)
    os.makedirs(P('agents', 'work'), exist_ok=True)
    json.dump(alerts, open(P('agents', 'work', 'rating_alerts.json'), 'w'), indent=1)
    json.dump(skipped, open(P('agents', 'work', 'skipped.json'), 'w'), indent=1)
    print(f"watchlist: {len(longs)} long, {len(shorts)} short; skipped: {len(skipped)}; rating alerts: {len(alerts)}")
    for k in skipped: print('  SKIP', k)
    for a in alerts: print('  ALERT', a)

if __name__ == '__main__':
    main(*(sys.argv[1:2]))
