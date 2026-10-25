"""Quarterly revenue and net income for US companies from SEC EDGAR XBRL (official filings).
Q1-Q3 come from 10-Q three-month figures; Q4 = the 10-K annual figure minus Q1-Q3. Cached for 7 days per company."""
import json, time, datetime as dt, urllib.request, gzip, threading

UA = 'Leago Rifumo Capital research info@leagorifumocapital.co.za'
_lock = threading.Lock()
_last = [0.0]


def _get(url):
    with _lock:  # SEC asks for no more than 10 requests a second
        w = 0.12 - (time.time() - _last[0])
        if w > 0: time.sleep(w)
        _last[0] = time.time()
    r = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'gzip'}), timeout=30)
    b = r.read()
    return json.loads(gzip.decompress(b) if r.headers.get('Content-Encoding') == 'gzip' else b)


def cik_map():
    return {v['ticker'].upper().replace('.', '-'): v['cik_str'] for v in _get('https://www.sec.gov/files/company_tickers.json').values()}


def _days(a, b):
    return (dt.date.fromisoformat(b) - dt.date.fromisoformat(a)).days


def _series(cik, tag):
    try: j = _get(f'https://data.sec.gov/api/xbrl/companyconcept/CIK{cik:010d}/us-gaap/{tag}.json')
    except Exception: return None
    rows = j.get('units', {}).get('USD', [])
    q, a = {}, {}
    for r in sorted(rows, key=lambda r: r.get('filed', '')):  # later filings overwrite earlier ones (restatements)
        if 'start' not in r: continue
        d = _days(r['start'], r['end'])
        if 80 <= d <= 100: q[r['end']] = (r['start'], r['val'])
        elif 350 <= d <= 380: a[r['end']] = (r['start'], r['val'])
    for end, (start, val) in a.items():  # derive Q4
        if end in q: continue
        inside = [v for e, (s, v) in q.items() if start < e < end and _days(start, s) >= -5]
        if len(inside) == 3: q[end] = (None, val - sum(inside))
    out = [{'date': e, 'value': v} for e, (s, v) in sorted(q.items())][-8:]
    return out if out else None


def quarters(cik):
    best_rev = None
    for tag in ('RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenuesNetOfInterestExpense'):
        s = _series(cik, tag)
        if s and (not best_rev or s[-1]['date'] > best_rev[-1]['date']): best_rev = s
    ni = _series(cik, 'NetIncomeLoss')
    if not best_rev and not ni: return None
    return {'revenue': best_rev or [], 'net_income': ni or [], 'source': 'SEC EDGAR (10-Q / 10-K)'}
