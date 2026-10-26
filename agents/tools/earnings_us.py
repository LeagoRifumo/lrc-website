#!/usr/bin/env python3
"""DAILY (GitHub Action): US earnings calendar for the next 3 weeks -> docs/data/earnings_us.json.
Source: Nasdaq earnings calendar. Keeps companies above $2bn market value plus every company LRC covers.
If the source is unavailable, keeps yesterday's file and refreshes our coverage dates from the snapshot.
Also reads the last 30 days from the same calendar, where Nasdaq lists the reported EPS and the surprise, and records them in
docs/data/earnings_log.json, so the website can show beat (green) / missed (red) after results."""
import sys, os, json, re, datetime as dt
sys.path.insert(0, os.path.dirname(__file__))
from lrcdata import P, load, http, save_if_changed, now_sast

MIN_CAP = 2e9

def cap(s):
    try: return float(re.sub(r'[^\d.]', '', s or ''))
    except Exception: return 0.0

def num(x):
    try:
        s = str(x).strip().replace('$', '').replace(',', '')
        neg = s.startswith('(') and s.endswith(')')
        v = float(s.strip('()'))
        return -v if neg else v
    except Exception:
        return None


def past_results(back=30):
    """Reported EPS vs forecast for the last `back` days → earnings_log.json (beat / miss / in line)."""
    path = P('docs', 'data', 'earnings_log.json')
    log = load(path, {}) or {}
    today = now_sast().date(); n = 0
    for k in range(1, back + 1):
        d = today - dt.timedelta(days=k)
        if d.weekday() >= 5: continue
        try:
            j = json.loads(http(f'https://api.nasdaq.com/api/calendar/earnings?date={d.isoformat()}', headers={'Accept': 'application/json, text/plain, */*', 'Origin': 'https://www.nasdaq.com', 'Referer': 'https://www.nasdaq.com/'}))
        except Exception as e:
            print('  past FAIL', d, str(e)[:60]); continue
        for r in ((j.get('data') or {}).get('rows') or []):
            t = (r.get('symbol') or '').strip(); mc = cap(r.get('marketCap'))
            if not t or mc < MIN_CAP: continue
            act, est = num(r.get('eps')), num(r.get('epsForecast'))
            surp = num(r.get('surprise'))
            surp = surp / 100 if surp is not None else ((act - est) / abs(est) if act is not None and est not in (None, 0) else None)
            key = f'{t}|{d.isoformat()}'
            e = log.get(key) or {}
            e.update({'t': t, 'ticker': t, 'name': r.get('name', ''), 'm': 'US', 'date': d.isoformat(), 'eps_forecast': r.get('epsForecast') or e.get('eps_forecast', ''),
                      'quarter': r.get('fiscalQuarterEnding') or e.get('quarter', ''), 'market_cap_bn': round(mc / 1e9, 1) if mc else None})
            if act is not None:
                e.update({'eps_actual': act, 'eps_est': est, 'surprise': surp, 'result': None if surp is None else 'beat' if surp > 0.01 else 'miss' if surp < -0.01 else 'inline', 'result_done': surp is not None, 'source': 'Nasdaq'})
            log[key] = e; n += 1
    json.dump(dict(sorted(log.items())), open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print('earnings results (last', back, 'days):', n, 'rows recorded')


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
    try:
        past_results()
    except Exception as e:
        print('past results failed:', e)
