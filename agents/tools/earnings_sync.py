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

After results (automatic): every date ever listed is kept in docs/data/earnings_log.json. Once a date has passed the row stays
on the calendar for 45 days as "reported", with reported vs expected EPS from the market data feed:
  beat (surprise above +1%) = green, missed (below -1%) = red, in line otherwise; "awaiting numbers" until the feed has them.
"""
import json, os, glob, datetime as dt

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
D = lambda *a: os.path.join(ROOT, 'docs', 'data', *a)
SAST = dt.timezone(dt.timedelta(hours=2))
LOG = os.path.join(ROOT, 'docs', 'data', 'earnings_log.json')
KEEP_DAYS = 45
LBL = {'trading_buy': 'Trading BUY', 'trading_sell': 'Trading SELL', 'invest_buy': 'Investment BUY', 'invest_sell': 'Investment SELL'}


def load(p, default):
    try:
        return json.load(open(p, encoding='utf-8'))
    except Exception:
        return default


def eps_result(t, date, fallback_est=None):
    """Reported vs expected EPS for the results published on `date` (from the scanner's company file)."""
    d = load(D('scan', 't', t.replace('^', '_') + '.json'), {})
    hist = [h for h in ((d.get('f') or {}).get('eps_hist') or []) if h.get('q')]
    rd = dt.date.fromisoformat(date)
    cand = [h for h in hist if rd - dt.timedelta(days=130) <= dt.date.fromisoformat(h['q']) <= rd]
    if not cand:
        return None
    h = max(cand, key=lambda h: h['q'])
    act, est = h.get('act'), h.get('est')
    if act is None:
        return None
    if est is None and fallback_est:
        try: est = float(str(fallback_est).replace('$', '').replace('(', '-').replace(')', ''))
        except Exception: est = None
    surp = h.get('surp')
    if surp is None and est not in (None, 0):
        surp = (act - est) / abs(est)
    res = None if surp is None else 'beat' if surp > 0.01 else 'miss' if surp < -0.01 else 'inline'
    return {'eps_actual': act, 'eps_est': est, 'surprise': surp, 'result': res, 'quarter_end': h['q']}


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
    ideas = {}
    ri = load(D('scan', 'research_ideas.json'), {})
    titles = {g['key']: g['title'] for g in ri.get('groups', [])}
    for m, g in ri.get('ideas', {}).items():
        for k, v in g.items():
            for x in v: ideas[x['t']] = titles.get(k, 'Research idea')
    for mk, fn, suffix in (('US', 'earnings_us.json', ''), ('JSE', 'earnings_jse.json', '.JO')):
        path = D(fn)
        cal = load(path, {'items': []})
        log = load(LOG, {})
        for x in cal.get('items', []):                      # remember every date ever listed (survives the daily rebuild)
            if x.get('reported'):
                continue
            k = f"{x['ticker'] + suffix}|{x['date']}"
            e = log.get(k) or {}
            e.update({'t': x['ticker'] + suffix, 'ticker': x['ticker'], 'name': x.get('name'), 'm': mk, 'date': x['date'],
                      'when': x.get('when'), 'eps_forecast': x.get('eps_forecast') or e.get('eps_forecast', ''), 'quarter': x.get('quarter') or e.get('quarter', ''),
                      'period': x.get('period') or e.get('period'), 'market_cap_bn': x.get('market_cap_bn')})
            log[k] = e
        items = [x for x in cal.get('items', []) if not x.get('auto') and not x.get('reported') and x.get('date', '') >= today.isoformat()]
        past = []
        for k, e in log.items():                            # results already out: keep 45 days, with beat / miss
            if e.get('m') != mk or not ((today - dt.timedelta(days=KEEP_DAYS)).isoformat() <= e['date'] < today.isoformat()):
                continue
            if not e.get('result_done'):
                r_ = eps_result(e['t'], e['date'], e.get('eps_forecast'))
                if r_:
                    e.update(r_)
                    if r_.get('result'): e['result_done'] = True
            past.append({'date': e['date'], 'ticker': e['ticker'], 'name': e.get('name'), 'when': e.get('when') or 'Not stated',
                         'period': e.get('period') or '', 'quarter': e.get('quarter', ''), 'eps_forecast': e.get('eps_forecast', ''),
                         'market_cap_bn': e.get('market_cap_bn'), 'reported': True, 'result': e.get('result'),
                         'eps_actual': e.get('eps_actual'), 'eps_est': e.get('eps_est'), 'surprise': e.get('surprise')})
        json.dump(dict(sorted(log.items())), open(LOG, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
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
        items += past
        tagged = 0
        for x in items:
            full = x['ticker'] + suffix
            s = scan.get(full) or {}
            lr = (rated.get(full) or rated.get(x['ticker']) or {}).get('rating')
            x['t'] = full
            x['lists'] = on_list.get(full, [])
            x['idea'] = ideas.get(full)
            x['v'] = s.get('v'); x['iv'] = s.get('iv_v')
            if s and not x.get('reported'):                 # last 4 quarters: beat / miss / in line (track record dots)
                h = sorted([h for h in ((load(D('scan', 't', full.replace('^', '_') + '.json'), {}).get('f') or {}).get('eps_hist') or []) if h.get('q') and h.get('surp') is not None], key=lambda h: h['q'])[-4:]
                x['track'] = ['beat' if h['surp'] > 0.01 else 'miss' if h['surp'] < -0.01 else 'inline' for h in h] or None
            x['lrc_rating'] = lr
            x['covered'] = bool(x['lists'] or lr)
            tagged += x['covered']
        items.sort(key=lambda x: (x['date'], not x['covered'], -(x.get('market_cap_bn') or 0)))
        cal['items'] = items
        cal['synced'] = dt.datetime.now(SAST).isoformat(timespec='minutes')
        cal['coverage_note'] = 'Ticked = on the LRC watchlist. Every company the LRC Stock Scanner tracks shows its trading and investment ratings. Updated after every scanner run.'
        if mk == 'JSE' and isinstance(cal.get('source'), str):
            cal['source'] = cal['source'].replace('by the LRC Research from', 'by LRC Research from')
            if 'market data feed' not in cal['source']:
                cal['source'] += ' Dates marked "expected" come from the market data feed and are added automatically for every JSE company the LRC Stock Scanner tracks.'
        cal.setdefault('market', 'JSE' if mk == 'JSE' else 'New York (NYSE & Nasdaq)')
        cal.setdefault('generated', cal['synced'])
        json.dump(cal, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        rp = [x for x in items if x.get('reported')]
        print(f"{fn}: {len(items)} rows, {added} added from the scanner, {tagged} ticked; reported {len(rp)} (beat {sum(x.get('result') == 'beat' for x in rp)}, missed {sum(x.get('result') == 'miss' for x in rp)}, in line {sum(x.get('result') == 'inline' for x in rp)})")


if __name__ == '__main__':
    main()
