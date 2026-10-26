#!/usr/bin/env python3
"""LRC dividend calendar — JSE and New York (docs/data/dividends.json), rebuilt after every scanner run.

For every company the LRC Stock Scanner tracks:
  confirmed  the next ex-dividend date the company has announced (market data feed), with the payment date when known
  expected   when nothing is announced yet: last year's ex-date for the same payment rolled forward one year
             (marked "expected — based on last year"; replaced by the confirmed date once announced)
  went_ex    ex-date has passed, payment not yet made (or payment date not announced)
  paid       payment date has passed: reported as paid, with the amount per share
  trend      raised (green) / cut (red) / unchanged vs the same payment a year earlier
  paid_est   no payment date on the feed, but the usual window has passed (JSE 14 days, New York 35 days after the ex-date): 'Paid (estimated)'
A permanent log (docs/data/dividends_log.json) keeps every dividend seen, so a dividend stays on record after it is paid.
Each row: last day to buy to qualify (JSE: the business day before the ex-date, T+3 settlement; New York: the business day
before the ex-date, T+1), ex-date, payment date, latest dividend per share, payments per year, trailing yield, payout ratio,
LRC grades, and whether the company is on the watchlist or the research Focus List.
JSE dividends on the data feed are in cents; they are shown in rand.
Run on its own:  python agents/tools/dividends.py
"""
import json, os, glob, datetime as dt

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
D = lambda *a: os.path.join(ROOT, 'docs', 'data', *a)
SAST = dt.timezone(dt.timedelta(hours=2))
AHEAD, BACK = 120, 60
LOG = os.path.join(ROOT, 'docs', 'data', 'dividends_log.json')   # every dividend ever seen, so paid ones stay on record
LBL = {'trading_buy': 'Trading BUY', 'trading_sell': 'Trading SELL', 'invest_buy': 'Investment BUY', 'invest_sell': 'Investment SELL'}


def load(p, d):
    try:
        return json.load(open(p, encoding='utf-8'))
    except Exception:
        return d


def prev_bday(d):
    d -= dt.timedelta(days=1)
    while d.weekday() >= 5:
        d -= dt.timedelta(days=1)
    return d


def main():
    today = dt.datetime.now(SAST).date()
    lo, hi = today - dt.timedelta(days=BACK), today + dt.timedelta(days=AHEAD)
    rows = {r['t']: r for r in load(D('scan', 'stocks.json'), {}).get('rows', [])}
    on_list = {}
    for m, l in load(D('scan', 'lists.json'), {}).get('lists', {}).items():
        for k, lbl in LBL.items():
            for x in l.get(k, []):
                on_list.setdefault(x['t'], []).append(lbl)
    ideas = {}
    ri = load(D('scan', 'research_ideas.json'), {})
    titles = {g['key']: g['title'] for g in ri.get('groups', [])}
    for m, g in ri.get('ideas', {}).items():
        for k, v in g.items():
            for x in v:
                ideas[x['t']] = titles.get(k)
    log = load(LOG, {})
    items = []
    for fn in glob.glob(D('scan', 't', '*.json')):
        d = load(fn, {})
        r = d.get('row') or {}
        t = r.get('t')
        if not t or t not in rows or r.get('m') not in ('JSE', 'US'):
            continue
        f = d.get('f') or {}
        hist = [x for x in (d.get('dividends') or []) if x.get('date') and x.get('amount')]
        if not hist and not f.get('ex_div'):
            continue
        scale = 100.0 if r['m'] == 'JSE' else 1.0          # JSE feed amounts are in cents
        last = hist[-1] if hist else None
        yr = [x for x in hist if x['date'] > (today - dt.timedelta(days=350)).isoformat()]
        freq = len(yr) or None
        base = {'t': t, 'n': r.get('n'), 'm': r['m'], 'sec': r.get('sec'), 'cur': r.get('cur'), 'px': r.get('px'),
                'last_amount': round(last['amount'] / scale, 4) if last else None, 'last_date': last['date'] if last else None,
                'per_year': freq, 'yield': f.get('div_yield'), 'payout': f.get('payout'),
                'v': r.get('v'), 'score': r.get('score'), 'iv_v': r.get('iv_v'), 'iv_score': r.get('iv_score'),
                'lists': on_list.get(t, []), 'idea': ideas.get(t)}
        for x in hist:                                      # every past ex-date with its amount goes into the permanent log
            k = f"{t}|{x['date']}"
            e = log.get(k) or {'t': t, 'ex': x['date']}
            e.update({'n': r.get('n'), 'm': r['m'], 'cur': r.get('cur'), 'amount': round(x['amount'] / scale, 4)})
            log[k] = e
        if f.get('ex_div'):
            k = f"{t}|{f['ex_div']}"
            e = log.get(k) or {'t': t, 'ex': f['ex_div']}
            e.update({'n': r.get('n'), 'm': r['m'], 'cur': r.get('cur')})
            if (f.get('div_pay') or '') >= f['ex_div']: e['pay'] = f['div_pay']
            log[k] = e
        seen = []
        ex = f.get('ex_div')
        if ex:
            exd = dt.date.fromisoformat(ex)
            if today <= exd <= hi:
                match = next((x for x in hist if x['date'] == ex), None)
                items.append({**base, 'ex': ex, 'ldt': prev_bday(exd).isoformat(), 'pay': f.get('div_pay') if (f.get('div_pay') or '') >= ex else None,
                              'amount': round(match['amount'] / scale, 4) if match else None, 'status': 'confirmed'})
                seen.append(exd)
        for k, e in log.items():                            # past dividends from the log: went ex, or paid
            if e['t'] != t or not (lo.isoformat() <= e['ex'] < today.isoformat()):
                continue
            paid = bool(e.get('pay')) and e['pay'] <= today.isoformat()
            days_ex = (today - dt.date.fromisoformat(e['ex'])).days
            est = not e.get('pay') and days_ex >= (14 if r['m'] == 'JSE' else 35)   # usual payment window passed, no date on the feed
            items.append({**base, 'ex': e['ex'], 'ldt': prev_bday(dt.date.fromisoformat(e['ex'])).isoformat(), 'pay': e.get('pay'),
                          'amount': e.get('amount'), 'status': 'paid' if paid else 'paid_est' if est else 'went_ex'})
        for x in hist:                                      # expected: last year's payment rolled forward
            exd = dt.date.fromisoformat(x['date']) + dt.timedelta(days=364)
            while exd.weekday() >= 5:
                exd += dt.timedelta(days=1)
            if not (today <= exd <= hi) or any(abs((exd - s).days) <= 45 for s in seen):
                continue
            if ex and dt.date.fromisoformat(ex) >= today:   # a confirmed future date already covers the next payment
                continue
            items.append({**base, 'ex': exd.isoformat(), 'ldt': prev_bday(exd).isoformat(), 'pay': None,
                          'amount': round(x['amount'] / scale, 4), 'amount_basis': 'last year', 'status': 'expected'})
            seen.append(exd)
    # raised / cut: compare each known amount with the same payment a year earlier (log, 320-410 days before)
    by_t = {}
    for e in log.values():
        if e.get('amount'): by_t.setdefault(e['t'], []).append(e)
    for x in items:
        if x.get('amount') is None or x.get('amount_basis'):
            continue
        exd = dt.date.fromisoformat(x['ex'])
        prev = [e for e in by_t.get(x['t'], []) if 320 <= (exd - dt.date.fromisoformat(e['ex'])).days <= 410]
        if prev:
            p_ = min(prev, key=lambda e: abs((exd - dt.date.fromisoformat(e['ex'])).days - 365))
            ch = x['amount'] / p_['amount'] - 1
            x.update({'prev_amount': p_['amount'], 'prev_ex': p_['ex'], 'chg': round(ch, 4), 'trend': 'raised' if ch > 0.01 else 'cut' if ch < -0.01 else 'unchanged'})
    items.sort(key=lambda x: (x['ex'], x['status'] != 'confirmed', -(x.get('yield') or 0)))
    json.dump(dict(sorted(log.items())), open(LOG, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    out = {'generated': dt.datetime.now(SAST).isoformat(timespec='minutes'),
           'source': 'Ex-dividend and payment dates and dividend history from the market data feed; expected dates are last year\'s dates rolled forward one year. Confirm every date on the company announcement (SENS for JSE companies).',
           'rules': {'JSE': 'JSE trades settle in 3 business days (T+3): buy by the last day to trade (usually a Tuesday) to receive the dividend; the share trades ex-dividend the next business day and the record date is the Friday.',
                     'US': 'US trades settle the next business day (T+1): buy before the ex-dividend date — by the close of the last trading day before it — to receive the dividend.'},
           'items': items}
    json.dump(out, open(D('dividends.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    c = lambda m, s: sum(1 for x in items if x['m'] == m and x['status'] == s)
    print(f"dividends.json: {len(items)} rows; log {len(log)} — " + '; '.join(f"{m}: " + ', '.join(f"{s_} {c(m, s_)}" for s_ in ('confirmed', 'expected', 'went_ex', 'paid', 'paid_est')) for m in ('JSE', 'US')))


if __name__ == '__main__':
    main()
