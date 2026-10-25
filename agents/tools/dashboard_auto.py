#!/usr/bin/env python3
"""DAILY (GitHub Action): weekly market dashboard, automated.
 * Every day:   docs/data/dashboards/live.json  = this week so far (latest close vs last Friday vs a year ago).
 * Saturday/Sunday: also publishes the official edition docs/data/dashboards/<Friday>.json and adds it to index.json.
Rows with a market price come from Yahoo Finance. Rows that are releases (repo rate, CPI, Fed funds, SA 10-year,
MSCI EM, iron ore) are carried from the last edition with their own as-of date until the Dashboard Agent updates them.
Top movers and the analyst's market view are written by the weekly Claude Dashboard Agent; until then an
automatic numbers-only summary is shown and labelled as such."""
import sys, os, json, datetime as dt
sys.path.insert(0, os.path.dirname(__file__))
from lrcdata import P, load, daily_bars, save_if_changed, now_sast

AUTO = {  # dashboard row name -> (Yahoo symbol, multiplier)
    'JSE All Share (J203)': ('^J203.JO', 1), 'JSE Top 40 (J200)': ('^J200.JO', 1), 'USD / ZAR': ('ZAR=X', 1), 'EUR / ZAR': ('EURZAR=X', 1),
    'GBP / ZAR': ('GBPZAR=X', 1), 'S&P 500': ('^GSPC', 1), 'Nasdaq Composite': ('^IXIC', 1), 'US 10-year Treasury': ('^TNX', 1),
    'Gold': ('GC=F', 1), 'Platinum': ('PL=F', 1), 'Brent crude': ('BZ=F', 1), 'Copper': ('HG=F', 2204.62)}
DIR = P('docs', 'data', 'dashboards')

def on_or_before(bars, d):
    x = [b for b in bars if b['date'] <= d.isoformat()]
    return x[-1] if x else None

def fmtn(v, u):
    return f"{v:,.2f}" if u not in ('index',) else f"{v:,.0f}"

def auto_view(rows):
    g = {r['name']: r for grp in rows for r in grp['rows']}
    def ch(n):
        r = g.get(n)
        if not r or r.get('latest') in (None, '') or not r.get('week_ago'): return None
        return r['latest'] / r['week_ago'] - 1
    bits = []
    a, z = ch('JSE All Share (J203)'), ch('USD / ZAR')
    if a is not None: bits.append(f"The JSE All Share moved {a:+.1%} on the week to {g['JSE All Share (J203)']['latest']:,.0f}" + (f" and the rand {'firmed' if z < 0 else 'weakened'} {abs(z):.1%} to R{g['USD / ZAR']['latest']:.2f}/$" if z is not None else '') + '.')
    s, n = ch('S&P 500'), ch('Nasdaq Composite')
    if s is not None: bits.append(f"In New York the S&P 500 moved {s:+.1%} and the Nasdaq {n:+.1%}" + (f", with the US 10-year at {g['US 10-year Treasury']['latest']:.2f}%" if g.get('US 10-year Treasury', {}).get('latest') else '') + '.')
    c = [(k, ch(k)) for k in ('Gold', 'Platinum', 'Brent crude', 'Copper') if ch(k) is not None]
    if c: bits.append('Commodities: ' + ', '.join(f"{k.split()[0].lower() if k != 'Brent crude' else 'Brent'} {v:+.1%}" for k, v in c) + '.')
    return ' '.join(bits)

def build(latest_day, week_ago_day, prev):
    prev_rows = {r['name']: r for g in prev.get('groups', []) for r in g['rows']}
    groups = json.loads(json.dumps(prev['groups']))  # same layout as the LRC Market Dashboard
    fails = []
    for grp in groups:
        for r in grp['rows']:
            if r['name'] not in AUTO: r['carried'] = True; continue
            sym, mult = AUTO[r['name']]
            try:
                bars = daily_bars(sym, '2y')
                L = on_or_before(bars, latest_day); W = on_or_before(bars, week_ago_day)
                Y = on_or_before(bars, (L and dt.date.fromisoformat(L['date']) or latest_day) - dt.timedelta(days=365))
                r.update({'latest': round(L['close'] * mult, 4), 'week_ago': round(W['close'] * mult, 4), 'year_ago': round(Y['close'] * mult, 4) if Y else None,
                          'as_of': L['date'], 'source': f"Yahoo Finance {sym} daily close ({L['date']}; week-ago {W['date']}; year-ago {Y['date'] if Y else 'n/a'})" + (' — converted $/lb × 2,204.62 to $/t' if mult != 1 else ''),
                          'carried': False, 'note': ''})
            except Exception as e:
                fails.append(f"{r['name']}: {str(e)[:60]}"); r['carried'] = True
    return groups, fails

def main():
    today = now_sast().date()
    friday = today - dt.timedelta(days=(today.weekday() - 4) % 7)          # most recent Friday (today if Friday)
    idx = load(os.path.join(DIR, 'index.json'), {'latest': None, 'weeks': []})
    prev = load(os.path.join(DIR, f"{idx['latest']}.json")) if idx.get('latest') else None
    if not prev: sys.exit('no previous edition to take the layout from')
    # live = week so far: latest close vs last Friday's close
    live_week_end = friday if today.weekday() >= 5 else friday + dt.timedelta(days=7)
    groups, fails = build(today, friday - dt.timedelta(days=7) if today.weekday() >= 4 else friday, prev)
    live = {'week_ending': live_week_end.isoformat(), 'title': f"This week so far — as of {today.strftime('%a %d %b %Y')}", 'live': True,
            'generated': now_sast().isoformat(timespec='minutes'), 'agent': 'LRC Market Dashboard', 'groups': groups,
            'movers': [], 'market_view': '', 'auto_view': auto_view(groups), 'missing': fails}
    save_if_changed(os.path.join(DIR, 'live.json'), live)
    print('live dashboard written; failures:', fails)
    if today.weekday() >= 5:  # weekend: publish the official edition for Friday
        f = os.path.join(DIR, f'{friday.isoformat()}.json')
        ed = load(f) or {}
        g2, fails2 = build(friday, friday - dt.timedelta(days=7), prev)
        # once the Weekly Research Agent (or the analyst) has filled this edition, keep their work:
        # release rows they updated stay as filled, and every "What it tells us" note is kept
        filled = {r['name']: r for g in ed.get('groups', []) for r in g['rows']}
        for g in g2:
            for i, r in enumerate(g['rows']):
                old = filled.get(r['name'])
                if not old: continue
                if r['name'] not in AUTO and not old.get('carried', True):
                    g['rows'][i] = old
                elif old.get('note') and not r.get('note'):
                    r['note'] = old['note']
        # once the Weekly Research Agent (or the analyst) has filled this edition, keep their work:
        # release rows they updated stay as filled, and every "What it tells us" note is kept
        filled = {r['name']: r for g in ed.get('groups', []) for r in g['rows']}
        for g in g2:
            for i, r in enumerate(g['rows']):
                old = filled.get(r['name'])
                if not old: continue
                if r['name'] not in AUTO and not old.get('carried', True):
                    g['rows'][i] = old
                elif old.get('note') and not r.get('note'):
                    r['note'] = old['note']
        ed.update({'week_ending': friday.isoformat(), 'title': f"Weekly market dashboard — week to {friday.day} {friday.strftime('%b %Y')}", 'live': False,
                   'generated': now_sast().isoformat(timespec='minutes'), 'groups': g2, 'auto_view': auto_view(g2), 'missing': fails2})
        ed.setdefault('agent', 'LRC Dashboard automation'); ed.setdefault('movers', []); ed.setdefault('market_view', '')
        save_if_changed(f, ed)
        if friday.isoformat() not in [w['week_ending'] for w in idx['weeks']]:
            idx['weeks'].insert(0, {'week_ending': friday.isoformat(), 'title': ed['title']})
        idx['latest'] = max(idx['latest'], friday.isoformat())
        save_if_changed(os.path.join(DIR, 'index.json'), idx)
        print('published edition', friday)

if __name__ == '__main__':
    main()
