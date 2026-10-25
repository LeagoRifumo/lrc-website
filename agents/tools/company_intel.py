#!/usr/bin/env python3
"""Company intelligence for every company on the LRC watchlists (GitHub Action, after the scanner).
Sources (all free, no keys):
  * Yahoo Finance headline RSS per symbol (JSE + New York)
  * Google News RSS per company (last 14 days; South African edition for JSE names) — picks up SENS stories from
    Moneyweb, Business Day, BusinessTech, Sharenet, IOL, CNBC Africa ...
  * SEC EDGAR (US): latest 8-K / 10-Q / 10-K filings with links, insider (Form 4) filing count, and official quarterly
    revenue, net income, operating cash flow and capex from XBRL company facts
Writes docs/data/intel/<SYMBOL>.json and docs/data/intel/index.json (latest headlines per company).
Watchlist universe = analyst-rated (ratings.json) + research files + website watchlists (scan/lists.json) + agents/config/focus.json
"""
import os, re, sys, json, time, html, gzip, urllib.request, urllib.parse, datetime as dt, email.utils
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = lambda *a: os.path.join(ROOT, *a)
OUT = P('docs', 'data', 'intel')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
SEC_UA = 'Leago Rifumo Capital research info@leagorifumocapital.co.za'
SAST = dt.timezone(dt.timedelta(hours=2))
ITEMS_8K = {'1.01': 'material agreement', '1.02': 'agreement terminated', '2.01': 'acquisition or disposal', '2.02': 'results of operations',
            '2.03': 'new financial obligation', '2.05': 'restructuring costs', '2.06': 'impairment', '3.01': 'listing notice', '4.01': 'auditor change',
            '5.02': 'director / officer change', '5.03': 'bylaws change', '5.07': 'shareholder vote', '7.01': 'Regulation FD disclosure', '8.01': 'other events', '9.01': 'exhibits'}


def load(p, d=None):
    try: return json.load(open(p, encoding='utf-8'))
    except Exception: return d


def get(url, headers=None, tries=2):
    err = None
    for k in range(tries):
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'gzip', **(headers or {})}), timeout=25)
            b = r.read()
            return gzip.decompress(b) if r.headers.get('Content-Encoding') == 'gzip' else b
        except Exception as e:
            err = e; time.sleep(1.5 * (k + 1))
    raise err


def rss(url, source_default=None, limit=12):
    x = get(url).decode('utf-8', 'ignore')
    out = []
    for it in re.findall(r'<item>(.*?)</item>', x, re.S)[:limit]:
        g = lambda tag: (re.search(rf'<{tag}[^>]*>(.*?)</{tag}>', it, re.S) or [None, ''])[1]
        title = html.unescape(re.sub(r'<!\[CDATA\[|\]\]>', '', g('title'))).strip()
        link = html.unescape(re.sub(r'<!\[CDATA\[|\]\]>', '', g('link'))).strip()
        src = html.unescape(re.sub(r'<[^>]+>', '', g('source'))).strip() or source_default
        if source_default == 'Google News' and ' - ' in title:
            title, src = title.rsplit(' - ', 1)
        try: pub = email.utils.parsedate_to_datetime(g('pubDate')).astimezone(dt.timezone.utc).isoformat(timespec='minutes')
        except Exception: pub = None
        if title and link: out.append({'title': title, 'url': link, 'source': src or 'News', 'published': pub})
    return out


def news_for(sym, name, market):
    items = []
    try: items += rss(f'https://feeds.finance.yahoo.com/rss/2.0/headline?s={urllib.parse.quote(sym)}&region=US&lang=en-US', 'Yahoo Finance')
    except Exception as e: print('  yahoo rss', sym, repr(e)[:80])
    short = re.sub(r'\b(Inc|Incorporated|Corp|Corporation|Ltd|Limited|plc|PLC|Holdings?|Group|Co|Company|N\.V\.|S\.A\.|Class [A-Z])\b\.?', '', name or sym).strip(' ,.')
    q = f'"{short}" {"JSE" if market == "JSE" else "stock"} when:14d'
    loc = 'hl=en-ZA&gl=ZA&ceid=ZA:en' if market == 'JSE' else 'hl=en-US&gl=US&ceid=US:en'
    try: items += rss(f'https://news.google.com/rss/search?q={urllib.parse.quote(q)}&{loc}', 'Google News')
    except Exception as e: print('  google news', sym, repr(e)[:80])
    # keep only stories that are about this company (feeds mix in market-wide headlines)
    GENERIC = {'first', 'general', 'american', 'united', 'south', 'african', 'global', 'international', 'national', 'new', 'the', 'old', 'capital', 'resources'}
    words = (name or '').replace(',', ' ').split()
    keys = set()
    if len(short) >= 4: keys.add(short.lower())
    elif len(words) > 1: keys.add((short + ' ' + words[1][:4]).lower())
    if words and len(words[0]) >= 5 and words[0].lower() not in GENERIC: keys.add(words[0].lower())
    tk = sym.replace('.JO', '').split('-')[0]
    def about(it):
        t = it['title']
        return any(k in t.lower() for k in keys) or (len(tk) >= 2 and re.search(rf'\b{re.escape(tk)}\b', t))
    items = [i for i in items if about(i)]
    seen, out = set(), []
    for it in sorted(items, key=lambda i: i['published'] or '', reverse=True):
        k = re.sub(r'\W+', '', it['title'].lower())[:70]
        if k in seen: continue
        seen.add(k); out.append(it)
    return out[:10]


_cik = None
def cik_of(sym):
    global _cik
    if _cik is None:
        try: _cik = {v['ticker'].upper(): v['cik_str'] for v in json.loads(get('https://www.sec.gov/files/company_tickers.json', {'User-Agent': SEC_UA})).values()}
        except Exception as e: print('  sec tickers', repr(e)[:80]); _cik = {}
    return _cik.get(sym.replace('-', '.').upper()) or _cik.get(sym.upper())


def sec_for(sym):
    cik = cik_of(sym)
    if not cik: return None
    h = {'User-Agent': SEC_UA}
    out = {'cik': cik, 'filings': [], 'insider_filings_90d': 0}
    try:
        j = json.loads(get(f'https://data.sec.gov/submissions/CIK{cik:010d}.json', h))
        rec = j['filings']['recent']; cut = (dt.date.today() - dt.timedelta(days=90)).isoformat()
        for i, form in enumerate(rec['form'][:200]):
            d = rec['filingDate'][i]
            if form == '4' and d >= cut: out['insider_filings_90d'] += 1
            if form in ('8-K', '10-Q', '10-K', '6-K', '20-F', 'DEF 14A') and len(out['filings']) < 8:
                acc = rec['accessionNumber'][i].replace('-', '')
                items = [ITEMS_8K.get(x.strip(), x.strip()) for x in (rec.get('items', [''] * 999)[i] or '').split(',') if x.strip() and x.strip() != '9.01']
                out['filings'].append({'form': form, 'date': d, 'desc': ', '.join(items) or rec['primaryDocDescription'][i] or form,
                                       'url': f'https://www.sec.gov/Archives/edgar/data/{cik}/{acc}/{rec["primaryDocument"][i]}'})
    except Exception as e: print('  sec submissions', sym, repr(e)[:80])
    try:
        facts = json.loads(get(f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json', h))['facts'].get('us-gaap', {})
        def quarters(*tags):
            best = {}
            for tag in tags:
                for u in (facts.get(tag, {}).get('units', {}).get('USD', [])):
                    fr = u.get('frame') or ''
                    if re.fullmatch(r'CY\d{4}Q[1-4]', fr) and fr not in best: best[fr] = {'end': u['end'], 'value': u['val'], 'form': u.get('form')}
            return [best[k] for k in sorted(best)][-6:]
        def annual(*tags):
            best = {}
            for tag in tags:
                for u in (facts.get(tag, {}).get('units', {}).get('USD', [])):
                    fr = u.get('frame') or ''
                    if re.fullmatch(r'CY\d{4}', fr) and fr not in best: best[fr] = {'end': u['end'], 'value': u['val']}
            return [best[k] for k in sorted(best)][-4:]
        rev = quarters('Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet')
        ni = quarters('NetIncomeLoss')
        out['quarterly'] = {'revenue': rev, 'net_income': ni}
        out['annual'] = {'revenue': annual('Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet'), 'net_income': annual('NetIncomeLoss'),
                         'operating_cash_flow': annual('NetCashProvidedByUsedInOperatingActivities'), 'capex': annual('PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets')}
        a = out['annual']
        if a['operating_cash_flow'] and a['capex'] and a['operating_cash_flow'][-1]['end'] == a['capex'][-1]['end']:
            out['annual_fcf'] = {'end': a['capex'][-1]['end'], 'value': a['operating_cash_flow'][-1]['value'] - a['capex'][-1]['value']}
    except Exception as e: print('  sec facts', sym, repr(e)[:80])
    return out


def universe():
    ratings = (load(P('docs', 'data', 'ratings.json'), {}) or {}).get('ratings', {})
    stocks = {r['t']: r for r in (load(P('docs', 'data', 'scan', 'stocks.json'), {}) or {}).get('rows', [])}
    syms = set(ratings)
    if os.path.isdir(P('docs', 'data', 'research')):
        syms |= {f[:-5] for f in os.listdir(P('docs', 'data', 'research')) if f.endswith('.json')}
    for m, l in ((load(P('docs', 'data', 'scan', 'lists.json'), {}) or {}).get('lists', {})).items():
        for k, v in l.items():
            if isinstance(v, list): syms |= {x['t'] for x in v}
    for m, g in ((load(P('docs', 'data', 'scan', 'research_ideas.json'), {}) or {}).get('ideas', {})).items():
        for k, v in g.items(): syms |= {x['t'] for x in v}
    syms |= set((load(P('agents', 'config', 'focus.json'), {}) or {}).get('tickers', []))
    out = []
    for s in sorted(syms):
        r = stocks.get(s, {})
        out.append((s, r.get('n') or (ratings.get(s) or {}).get('name') or s, r.get('m') or ('JSE' if s.endswith('.JO') else 'US')))
    return out


def one(item):
    sym, name, market = item
    d = {'ticker': sym, 'name': name, 'market': market, 'generated': dt.datetime.now(SAST).isoformat(timespec='minutes'), 'news': news_for(sym, name, market)}
    src = ['Yahoo Finance news', 'Google News (' + ('South Africa' if market == 'JSE' else 'US') + ')']
    if market == 'US':
        sec = sec_for(sym)
        if sec: d['sec'] = sec; src.append('SEC EDGAR filings & XBRL financials')
    d['sources'] = src
    return d


def main():
    os.makedirs(OUT, exist_ok=True)
    uni = universe()
    print(f'company intel for {len(uni)} companies')
    with ThreadPoolExecutor(4) as ex: res = list(ex.map(one, uni))
    idx = {}
    for d in res:
        json.dump(d, open(os.path.join(OUT, d['ticker'].replace('^', '_') + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        idx[d['ticker']] = {'n': d['name'], 'news': d['news'][:3], 'filing': (d.get('sec') or {}).get('filings', [None])[0] if d.get('sec') else None}
    json.dump({'generated': dt.datetime.now(SAST).isoformat(timespec='minutes'), 'companies': idx}, open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    keep = {d['ticker'].replace('^', '_') + '.json' for d in res} | {'index.json'}
    for fn in os.listdir(OUT):
        if fn not in keep: os.remove(os.path.join(OUT, fn))
    print('news items:', sum(len(d['news']) for d in res), '| with SEC data:', sum('sec' in d for d in res))


if __name__ == '__main__':
    main()
