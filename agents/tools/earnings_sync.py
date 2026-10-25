#!/usr/bin/env python3
"""Keeps the earnings calendar in step with the rest of the website (runs after every scanner run and after the daily calendar).

For docs/data/earnings_us.json and docs/data/earnings_jse.json:
  * adds the next results date of every company the LRC Stock Scanner tracks, when the calendar does not list it yet
    (marked "auto": true and rebuilt on every run, so dates that move are picked up)
  * tags every row with what the site says about the company:
      covered  - on the LRC watchlist (any of the four top-5 lists) or carries an LRC analyst Work-sheet rating
      lists    - which watchlist(s) it is on, e.g. ["Trading BUY", "Investment SELL"]
      v / iv   - LRC Stock Scanner trading and investment ratings; lrc_rating - analyst rating
      t        - full ticker for the one-page summary link (JSE tickers end in .JO)
Company-confirmed dates already in the file are never replaced.
"""
import json, os, datetime as dt

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
D = lambda *a: os.path.join(ROOT, 'docs', 'data', *a)
SAST = dt.timezone(dt.timedelta(hours=2))
LBL = {'trading_buy': 'Trading BUY', 'trading_sell': 'Trading SELL', 'invest_buy': 'Investment BUY', 'invest_sell': 'Investment SELL'}


def load(p, default):
    try:
        return json.load(open(p, encoding='utf-8'))
    except Exception:
        return default


def main(window_days=62):
    today = dt.datetime.now(SAST).date()
    end = (today + dt.timedelta(days=window_days)).isoformat()
    rows = load(D('scan', 'stocks.json'), {}).get('rows', [])
    scan = {r['t']: r for r in rows}
    lists = load(D('scan', 'lists.json'), {}).get('lists', {})
    on_list = {}
    for m, l in lists.items():
        for k, lbl in LBL.items():
            for x in l.get(k, []):
                on_list.setdefault(x['t'], []).append(lbl)
    rated = load(D('ratings.json'), {}).get('ratings', {})
    for mk, fn, suffix in (('US', 'earnings_us.json', ''), ('JSE', 'earnings_jse.json', '.JO')):
        path = D(fn)
        cal = load(path, {'items': []})
        items = [x for x in cal.get('items', []) if not x.get('auto')]   # drop last run's automatic rows, keep confirmed ones
        have = {x['ticker'] for x in items if x.get('date', '') >= today.isoformat()}
        added = 0
        for r in rows:
            if r.get('m') != mk or not r.get('ne'):
                continue
            short = r['t'][:-3] if r['t'].endswith('.JO') else r['t']
            if short in have or not (today.isoformat() <= r['ne'] <= end):
                continue
            mcap = r.get('mcap')
            items.append({'date': r['ne'], 'ticker': short, 'name': r['n'], 'when': 'Not stated',
                          'period': 'Expected date (market data feed) — confirm on SENS' if mk == 'JSE' else 'Expected date (market data feed)',
                          'eps_forecast': '', 'market_cap_bn': round(mcap / 1e9, 1) if mcap else None, 'auto': True})
            have.add(short); added += 1
        tagged = 0
        for x in items:
            full = x['ticker'] + suffix
            s = scan.get(full) or {}
            lr = (rated.get(full) or rated.get(x['ticker']) or {}).get('rating')
            x['t'] = full
            x['lists'] = on_list.get(full, [])
            x['v'] = s.get('v'); x['iv'] = s.get('iv_v')
            x['lrc_rating'] = lr
            x['covered'] = bool(x['lists'] or lr)
            tagged += x['covered']
        items.sort(key=lambda x: (x['date'], not x['covered'], -(x.get('market_cap_bn') or 0)))
        cal['items'] = items
        cal['synced'] = dt.datetime.now(SAST).isoformat(timespec='minutes')
        cal['coverage_note'] = 'Ticked = on the LRC watchlist or rated by an LRC analyst. Every company the LRC Stock Scanner tracks shows its trading and investment ratings. Updated after every scanner run.'
        if mk == 'JSE' and isinstance(cal.get('source'), str):
            cal['source'] = cal['source'].replace('by the LRC Research from', 'by LRC Research from')
            if 'market data feed' not in cal['source']:
                cal['source'] += ' Dates marked "expected" come from the market data feed and are added automatically for every JSE company the LRC Stock Scanner tracks.'
        cal.setdefault('market', 'JSE' if mk == 'JSE' else 'New York (NYSE & Nasdaq)')
        cal.setdefault('generated', cal['synced'])
        json.dump(cal, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(f'{fn}: {len(items)} rows, {added} added from the scanner, {tagged} ticked (watchlist or analyst coverage)')


if __name__ == '__main__':
    main()
