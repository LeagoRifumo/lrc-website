#!/usr/bin/env python3
"""DAILY (GitHub Action): US earnings calendar for the next 3 weeks -> docs/data/earnings_us.json.
Source: Nasdaq earnings calendar. Keeps companies above $2bn market value plus every company LRC covers.
If the source is unavailable, keeps yesterday's file and refreshes our coverage dates from the snapshot."""
import sys, os, json, re, datetime as dt
sys.path.insert(0, os.path.dirname(__file__))
from lrcdata import P, load, http, save_if_changed, now_sast

MIN_CAP = 2e9

def cap(s):
    try: return float(re.sub(r'[^\d.]', '', s or ''))
    except Exception: return 0.0

def main(days=21):
    ratings = load(P('docs', 'data', 'ratings.json'), {'ratings': {}})['ratings']
    today = now_sast().date(); rows, ok = [], 0
    for k in range(days):
        d = today + dt.timedelta(days=k)
        if d.weekday() >= 5: continue
        try:
            j = json.loads(http(f'https://api.nasdaq.com/api/calendar/earnings?date={d.isoformat()}', headers={'Accept': 'application/json, text/plain, */*', 'Origin': 'https://www.nasdaq.com', 'Referer': 'https://www.nasdaq.com/'}))
            ok += 1
        except Exception as e:
            print('  FAIL', d, str(e)[:80]); continue
        for r in ((j.get('data') or {}).get('rows') or []):
            t = (r.get('symbol') or '').strip(); mc = cap(r.get('marketCap'))
            if mc < MIN_CAP and t not in ratings: continue
            tm = r.get('time', '')
            rows.append({'date': d.isoformat(), 'ticker': t, 'name': r.get('name', ''), 'when': 'Before open' if 'pre' in tm else 'After close' if 'after' in tm else 'Not stated',
                         'eps_forecast': r.get('epsForecast') or '', 'eps_last_year': r.get('lastYearEPS') or '', 'quarter': r.get('fiscalQuarterEnding') or '',
                         'market_cap_bn': round(mc / 1e9, 1) if mc else None, 'covered': t in ratings, 'lrc_rating': ratings.get(t, {}).get('rating')})
    if not ok:
        old = load(P('docs', 'data', 'earnings_us.json'), {'items': []})
        snap = {x['ticker']: x for x in load(P('agents', 'work', 'snapshot.json'), [])}
        keep = [i for i in old.get('items', []) if i['date'] >= today.isoformat() and not i.get('covered')]
        for t, r in ratings.items():
            ne = snap.get(t, {}).get('next_earnings')
            if ne and ne >= today.isoformat():
                keep.append({'date': ne, 'ticker': t, 'name': r['name'], 'when': 'Not stated', 'eps_forecast': '', 'eps_last_year': '', 'quarter': '', 'market_cap_bn': None, 'covered': True, 'lrc_rating': r['rating']})
        rows = keep; src = 'Nasdaq calendar unavailable today — LRC coverage dates from our research snapshot'
    else:
        src = 'Nasdaq earnings calendar (US-listed companies above $2bn market value, plus every company LRC covers)'
    rows.sort(key=lambda x: (x['date'], not x['covered'], -(x['market_cap_bn'] or 0)))
    out = {'generated': now_sast().isoformat(timespec='minutes'), 'market': 'New York (NYSE & Nasdaq)', 'source': src, 'items': rows}
    print('earnings_us:', len(rows), 'rows; changed =', save_if_changed(P('docs', 'data', 'earnings_us.json'), out))

if __name__ == '__main__':
    main()
