#!/usr/bin/env python3
"""LRC Scanner (GitHub Action, daily after the US close): scores every stock and ETF in the universe on technicals,
sentiment and fundamentals, finds BREAKOUT / RETEST setups with entry plans, scores sectors, and writes:
  docs/data/scan/stocks.json   one row per stock (US + JSE)          -> scanner.html
  docs/data/scan/etfs.json     ETFs grouped and ranked               -> scanner.html#etfs
  docs/data/scan/sectors.json  sector scores with their ETF          -> scanner.html#sectors
  docs/data/scan/t/<SYM>.json  full detail for the one-page summary  -> stock.html?t=SYM
Usage: python agents/tools/scanner.py [--limit N] [--only AAPL,NPN.JO]
"""
import sys, os, re, json, time, math, argparse, datetime as dt
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(__file__))
from yahoo import Yahoo, raw
import scan_engine as E

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = lambda *a: os.path.join(ROOT, *a)
SAST = dt.timezone(dt.timedelta(hours=2))
OUT = P('docs', 'data', 'scan')
FX_SYM = {'USD': 'ZAR=X', 'GBP': 'GBPZAR=X', 'EUR': 'EURZAR=X', 'AUD': 'AUDZAR=X', 'CHF': 'CHFZAR=X'}


def load(p, d=None):
    try: return json.load(open(p, encoding='utf-8'))
    except Exception: return d


def dump(p, o):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump(o, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))


def rnd(x, n=4):
    if x is None or isinstance(x, bool) or not isinstance(x, (int, float)) or math.isnan(x) or math.isinf(x): return x if isinstance(x, (str, bool)) or x is None else None
    if x == 0: return 0
    d = max(0, n - 1 - int(math.floor(math.log10(abs(x)))))
    return round(x, d)


def rnd_all(o, n=4):
    if isinstance(o, dict): return {k: rnd_all(v, n) for k, v in o.items()}
    if isinstance(o, list): return [rnd_all(v, n) for v in o]
    return rnd(o, n) if isinstance(o, float) else o


# ---------------- universe ----------------
def us_universe(y, cfg):
    cache = P('agents', 'work', 'us_universe.json')
    syms = {}
    for url in cfg['us_lists']:
        try:
            html = y.get(url).decode('utf-8', 'ignore')
            for sym, name in re.findall(r'href="/stocks/([a-z0-9.\-]+)/"[^>]*>([^<]+)</a>', html):
                s = sym.upper()
                if s != name.strip().upper():
                    syms.setdefault(s, name.strip())
                else:
                    syms.setdefault(s, None)
        except Exception as e:
            print('  list failed', url, repr(e)[:100])
    syms = {s: n for s, n in syms.items() if re.fullmatch(r'[A-Z]{1,5}([.\-][A-Z])?', s)}
    if len(syms) >= 400:
        dump(cache, sorted(syms)); return sorted(syms)
    old = load(cache, [])
    print(f'  US list fetch gave {len(syms)} names; using cached list of {len(old)}')
    return old or sorted(syms)


# ---------------- fundamentals ----------------
def norm_fund(s, q, price_major, minor, fx):
    """Normalise Yahoo fundamentals to the trading currency (major units). fx converts the reporting currency to it."""
    fd, ks, sd, ce, ap = s.get('financialData', {}), s.get('defaultKeyStatistics', {}), s.get('summaryDetail', {}), s.get('calendarEvents', {}), s.get('assetProfile', {})
    div = 100.0 if minor else 1.0
    mcap = raw(sd, 'marketCap') or raw(s.get('price', {}), 'marketCap') or (q or {}).get('marketCap')
    sh = raw(ks, 'sharesOutstanding') or (q or {}).get('sharesOutstanding')
    rev, fcf = raw(fd, 'totalRevenue'), raw(fd, 'freeCashflow')
    teps, feps = raw(ks, 'trailingEps'), raw(ks, 'forwardEps')
    tpe = price_major / (teps * fx) if teps and fx else None
    fpe = price_major / (feps * fx) if feps and fx else None
    f = {
        'mcap': mcap, 'currency_reported': fd.get('financialCurrency'), 'fx_used': fx,
        'tpe': tpe if tpe and 0 < tpe < 400 else (None if teps is None else -1 if teps < 0 else None),
        'fpe': fpe if fpe and 0 < fpe < 400 else (None if feps is None else -1 if feps < 0 else None),
        'yahoo_tpe': raw(sd, 'trailingPE'), 'yahoo_fpe': raw(sd, 'forwardPE'),
        'ps': mcap / (rev * fx) if mcap and rev and fx and rev > 0 else None,
        'pfcf': (mcap / (fcf * fx) if fcf > 0 else -1) if mcap and fcf and fx else None,
        'pb': raw(ks, 'priceToBook'), 'peg': raw(ks, 'pegRatio') if (raw(ks, 'pegRatio') or 99) < 10 else None,
        'rev_growth': raw(fd, 'revenueGrowth'), 'eps_growth': raw(fd, 'earningsGrowth'),
        'de': raw(fd, 'debtToEquity'), 'roe': raw(fd, 'returnOnEquity'), 'roa': raw(fd, 'returnOnAssets'),
        'gross_margin': raw(fd, 'grossMargins'), 'op_margin': raw(fd, 'operatingMargins'), 'profit_margin': raw(fd, 'profitMargins'),
        'current_ratio': raw(fd, 'currentRatio'),
        'revenue': rev * fx if rev and fx else None, 'fcf': fcf * fx if fcf and fx else None,
        'cash': raw(fd, 'totalCash') * fx if raw(fd, 'totalCash') and fx else None, 'debt': raw(fd, 'totalDebt') * fx if raw(fd, 'totalDebt') and fx else None,
        'fcf_per_share': fcf * fx / sh if fcf and fx and sh else None,
        'trailing_eps': teps * fx if teps and fx else None, 'forward_eps': feps * fx if feps and fx else None,
        'div_yield': raw(sd, 'dividendYield') if raw(sd, 'dividendYield') is not None else (raw(sd, 'trailingAnnualDividendYield') or 0),
        'beta': raw(sd, 'beta'),
        'target_median': (raw(fd, 'targetMedianPrice') or 0) / div or None, 'target_mean': (raw(fd, 'targetMeanPrice') or 0) / div or None,
        'target_high': (raw(fd, 'targetHighPrice') or 0) / div or None, 'target_low': (raw(fd, 'targetLowPrice') or 0) / div or None,
        'rec_mean': raw(fd, 'recommendationMean'), 'rec_key': fd.get('recommendationKey'), 'n_analysts': raw(fd, 'numberOfAnalystOpinions'),
        'short_float': raw(ks, 'shortPercentOfFloat'), 'inst': raw(ks, 'heldPercentInstitutions'), 'insiders': raw(ks, 'heldPercentInsiders'),
    }
    for tr in (s.get('earningsTrend') or {}).get('trend', []):
        if tr.get('period') == '0y': f['eps_growth_fwd'] = raw(tr, 'growth')
        if tr.get('period') == '+1y': f['eps_growth_next'] = raw(tr, 'growth')
    today = dt.date.today().isoformat()
    ed = [x.get('fmt') for x in (ce.get('earnings') or {}).get('earningsDate', []) if isinstance(x, dict)]
    f['next_earnings'] = next((d for d in ed if d and d >= today), None)
    f['ex_div'] = (ce.get('exDividendDate') or {}).get('fmt') if isinstance(ce.get('exDividendDate'), dict) else None
    rt = ((s.get('recommendationTrend') or {}).get('trend') or [{}])[0]
    f['rec_trend'] = {k: rt.get(k) for k in ('strongBuy', 'buy', 'hold', 'sell', 'strongSell')} if rt else None
    cut = (dt.date.today() - dt.timedelta(days=45)).isoformat()
    ud = []
    for h in (s.get('upgradeDowngradeHistory') or {}).get('history', [])[:40]:
        d = dt.datetime.fromtimestamp(h.get('epochGradeDate', 0), dt.timezone.utc).date().isoformat()
        if d >= cut: ud.append({'date': d, 'firm': h.get('firm'), 'action': h.get('action'), 'from': h.get('fromGrade'), 'to': h.get('toGrade')})
    f['analyst_actions'] = ud[:8]
    off = [{'name': o.get('name'), 'title': o.get('title')} for o in (ap.get('companyOfficers') or [])[:3]]
    prof = {'sector': ap.get('sector'), 'industry': ap.get('industry'), 'summary': ap.get('longBusinessSummary'), 'employees': ap.get('fullTimeEmployees'),
            'website': ap.get('website'), 'country': ap.get('country'), 'city': ap.get('city'), 'officers': off}
    return f, prof


def fx_rates(y):
    out = {'ZAR': 1.0}
    for cur, sym in FX_SYM.items():
        try: out[cur] = y.bars(sym, '1mo')[0][-1]['close']
        except Exception as e: print('  fx failed', sym, repr(e)[:80])
    return out


def fx_for(reported, trading, rates):
    if not reported or reported == trading: return 1.0
    if trading == 'ZAR' and reported in rates: return rates[reported]
    if trading == 'USD' and reported in rates and 'USD' in rates: return rates[reported] / rates['USD']
    return None


# ---------------- main ----------------
def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--limit', type=int, default=0); ap.add_argument('--only', default='')
    ap.add_argument('--workers', type=int, default=8); args = ap.parse_args()
    t0 = time.time(); y = Yahoo()
    cfg = load(P('agents', 'config', 'scanner.json'))
    ratings = (load(P('docs', 'data', 'ratings.json'), {}) or {}).get('ratings', {})
    research = {f[:-5] for f in os.listdir(P('docs', 'data', 'research'))} if os.path.isdir(P('docs', 'data', 'research')) else set()
    jse_cfg = {s: (n, sec) for s, n, sec in cfg['jse']}
    us = us_universe(y, cfg)
    us_syms = sorted(set(s.replace('.', '-') for s in us) | set(ratings) | {r for r in research if not r.endswith('.JO')})
    stocks = [(s, 'US') for s in us_syms] + [(s, 'JSE') for s in jse_cfg]
    if args.only: stocks = [x for x in stocks if x[0] in args.only.split(',')]
    if args.limit: stocks = stocks[:args.limit] + [x for x in stocks if x[1] == 'JSE'][:max(5, args.limit // 4)]
    etfs = cfg['etfs'] if not args.only else [e for e in cfg['etfs'] if e[0] in ('SPY', 'STX40.JO', 'XLK', 'STXRES.JO')]
    bench = {m: v['t'] for m, v in cfg['benchmarks'].items()}
    print(f'universe: {len(stocks)} stocks, {len(etfs)} ETFs')

    rates = fx_rates(y); print('fx', rates)
    bmk = {}
    for m, s in bench.items():
        try: bmk[m] = [b['close'] for b in y.bars(s)[0]]
        except Exception as e: print('  benchmark failed', s, e)

    syms = [s for s, _ in stocks] + [e[0] for e in etfs]
    try: quotes = y.quotes(syms)
    except Exception as e: quotes = {}; print('quotes failed', e)
    print(f'quotes: {len(quotes)} ({time.time() - t0:.0f}s)')

    def get_bars(s):
        try: return s, y.bars(s)
        except Exception as e: return s, e
    with ThreadPoolExecutor(args.workers) as ex: barmap = dict(ex.map(get_bars, syms))
    bad_bars = [s for s, v in barmap.items() if isinstance(v, Exception)]
    print(f'bars: {len(syms) - len(bad_bars)} ok, {len(bad_bars)} failed ({time.time() - t0:.0f}s) {bad_bars[:15]}')

    cache = load(P('agents', 'work', 'scan_fund_cache.json'), {}) or {}
    def get_sum(s):
        try: return s, y.summary(s)
        except Exception as e: return s, e
    with ThreadPoolExecutor(args.workers) as ex: summ = dict(ex.map(get_sum, [s for s, _ in stocks]))
    print(f'fundamentals: {sum(not isinstance(v, Exception) for v in summ.values())} ok ({time.time() - t0:.0f}s)')
    week_ago = (dt.date.today() - dt.timedelta(days=7)).isoformat()
    need_ts = [s for s, _ in stocks if (cache.get(s, {}).get('ts_date') or '') < week_ago][:250]
    def get_ts(s):
        try: return s, y.timeseries(s)
        except Exception as e: return s, e
    with ThreadPoolExecutor(args.workers) as ex: tsmap = dict(ex.map(get_ts, need_ts))
    for s, v in tsmap.items():
        if not isinstance(v, Exception): cache.setdefault(s, {}).update({'ts': v, 'ts_date': dt.date.today().isoformat()})
    print(f'financials: {sum(not isinstance(v, Exception) for v in tsmap.values())}/{len(need_ts)} refreshed ({time.time() - t0:.0f}s)')

    # ---------- per stock ----------
    rows, details = [], {}
    for s, m in stocks:
        b = barmap.get(s)
        if isinstance(b, Exception) or not b: continue
        bars, meta = b
        if len(bars) < 60: continue
        minor = meta.get('currency') in ('ZAc', 'GBp', 'ZAC', 'GBX')
        if minor:
            for x in bars:
                for k in ('open', 'high', 'low', 'close'): x[k] = x[k] / 100.0
        cur = 'ZAR' if meta.get('currency') in ('ZAc', 'ZAR', 'ZAC') else meta.get('currency') or 'USD'
        t = E.technicals(bars, bmk.get(m))
        if not t: continue
        q = quotes.get(s, {})
        sm = summ.get(s)
        if isinstance(sm, Exception) or not sm:
            f, prof = cache.get(s, {}).get('f', {}), cache.get(s, {}).get('prof', {})
            stale = True
        else:
            rep = (sm.get('financialData') or {}).get('financialCurrency')
            f, prof = norm_fund(sm, q, t['price'], minor, fx_for(rep, cur, rates) if rep else 1.0)
            cache.setdefault(s, {}).update({'f': f, 'prof': prof, 'f_date': dt.date.today().isoformat()})
            stale = False
        if m == 'JSE':
            n0, sec0 = jse_cfg.get(s, (None, None))
            name = n0 or q.get('longName') or meta.get('name') or s
            sector = prof.get('sector') or sec0 or 'Other'
        else:
            name = q.get('longName') or q.get('shortName') or meta.get('name') or s
            sector = prof.get('sector') or 'Other'
        if m == 'US' and t['value_traded'] < 2e6 and s not in ratings: continue
        rows.append({'t': s, 'n': name, 'm': m, 'sec': sector, 'ind': prof.get('industry'), 'cur': cur, 'tech': t, 'f': f, 'prof': prof,
                     'bars': bars, 'meta': meta, 'stale': stale, 'ts': cache.get(s, {}).get('ts')})

    med = E.sector_medians([{'market': r['m'], 'sector': r['sec'], 'f': r['f']} for r in rows])
    today = dt.date.today()
    out_rows = []
    for r in rows:
        t, f = r['tech'], r['f']
        md = med.get((r['m'], r['sec']), {})
        ts_ = E.tech_scores(t); ss = E.sentiment_scores(f, t['price']); fs = E.fund_scores(f, md, r['sec'])
        sc = {**ts_, **ss, **fs}
        vals = [v for v in sc.values() if v is not None]
        maxabs = sum(2 if k in ('trend', 'momentum', 'setup', 'analysts') else 1 for k, v in sc.items() if v is not None)
        total = sum(vals)
        tech_total = sum(ts_.values()); fund_total = sum(v for v in fs.values() if v is not None); sent_total = sum(v for v in ss.values() if v is not None)
        pl = E.plan(r['bars'], t, f.get('next_earnings'), today)
        cats = []
        if f.get('next_earnings'):
            d = (dt.date.fromisoformat(f['next_earnings']) - today).days
            if 0 <= d <= 21: cats.append(f'Results in {d}d')
        if f.get('ex_div') and f['ex_div'] >= today.isoformat(): cats.append(f"Ex-div {f['ex_div']}")
        ups = [a for a in f.get('analyst_actions', []) if (a.get('action') or '').lower() in ('up',)]
        dns = [a for a in f.get('analyst_actions', []) if (a.get('action') or '').lower() in ('down',)]
        if ups: cats.append(f"Upgrade: {ups[0]['firm']}")
        if dns: cats.append(f"Downgrade: {dns[0]['firm']}")
        if t['price'] >= t['hi52'] * 0.995: cats.append('New 52-week high')
        if t['price'] <= t['lo52'] * 1.005: cats.append('New 52-week low')
        tg = E.model_targets(f, md, t['price'])
        cov = ratings.get(r['t'])
        if cov: tg['lrc'] = cov['target_6m']
        row = {'t': r['t'], 'n': r['n'], 'm': r['m'], 'sec': r['sec'], 'ind': r['ind'], 'cur': r['cur'], 'px': t['price'], 'chg': t['chg_1d'],
               'p1w': t['perf_1w'], 'p1m': t['perf_1m'], 'p6m': t['perf_6m'], 'ytd': t['perf_ytd'], 'mcap': f.get('mcap'), 'rsi': t['rsi'],
               'sc': sc, 'tech': tech_total, 'sent': sent_total, 'fund': fund_total, 'total': total, 'max': maxabs, 'v': E.verdict(total, maxabs),
               'setup': t.get('setup'), 'lvl': t.get('setup_level'), 'plan': {k: pl[k] for k in ('side', 'entry', 'stop', 't1', 't2', 'risk_pct')} if pl else None,
               'ne': f.get('next_earnings'), 'cat': cats, 'tgt': tg.get('lrc') or tg.get('blend'),
               'cov': {'rating': cov['rating'], 'target': cov['target_6m'], 'rated': cov.get('rated')} if cov else None,
               'res': r['t'] in research, 'stale': r['stale'] or None}
        out_rows.append(row)
        # detail page data
        bars = r['bars']; c = [x['close'] for x in bars]
        hist = []
        for i in range(max(0, len(bars) - 260), len(bars)):
            hist.append([bars[i]['date'], c[i], E.sma(c[:i + 1], 50), E.sma(c[:i + 1], 200)])
        val = []
        for k, label, lower in [('fpe', 'Forward P/E', True), ('tpe', 'TTM P/E', True), ('ps', 'Price / Sales', True), ('pfcf', 'Price / FCF', True),
                                ('peg', 'PEG', True), ('pb', 'Price / Book', True), ('de', 'Debt / Equity (%)', True), ('rev_growth', 'Revenue growth', False),
                                ('eps_growth', 'EPS growth (last qtr)', False), ('roe', 'Return on equity', False), ('op_margin', 'Operating margin', False),
                                ('div_yield', 'Dividend yield', False)]:
            v, mv = f.get(k), md.get(k)
            if v is None: verdict = '—'
            elif k in ('fpe', 'tpe', 'ps', 'pfcf') and v <= 0: verdict = 'Loss-making' if k != 'pfcf' else 'Negative FCF'
            elif mv:
                ratio = v / mv if mv else 1
                if lower: verdict = 'Undervalued' if ratio < 0.8 else 'Overvalued' if ratio > 1.25 else 'Fairly valued'
                else: verdict = 'Strong' if ratio > 1.25 else 'Weak' if ratio < 0.8 else 'In line'
            else: verdict = '—'
            val.append({'k': k, 'label': label, 'v': v, 'sector': mv, 'score': sc.get(k), 'verdict': verdict})
        details[r['t']] = {'row': row, 'tech': {k: v for k, v in t.items() if k not in ('setup_bar',)}, 'f': f, 'profile': r['prof'], 'sector_medians': md,
                           'valuation': val, 'targets': tg, 'plan': pl, 'history': hist, 'financials': r['ts'], 'dividends': r['meta'].get('dividends', [])[-8:],
                           'benchmark': cfg['benchmarks'][r['m']]['name'], 'research': r['t'] in research}

    # ---------- ETFs ----------
    etf_rows = []
    for s, m, grp, label in etfs:
        b = barmap.get(s)
        if isinstance(b, Exception) or not b: continue
        bars, meta = b
        if meta.get('currency') in ('ZAc', 'ZAC'):
            for x in bars:
                for k in ('open', 'high', 'low', 'close'): x[k] = x[k] / 100.0
        t = E.technicals(bars, bmk.get(m))
        if not t: continue
        sc = E.tech_scores(t); tot = sum(sc.values()); pl = E.plan(bars, t)
        etf_rows.append({'t': s, 'n': label, 'full': (quotes.get(s) or {}).get('longName') or meta.get('name'), 'm': m, 'g': grp, 'px': t['price'],
                         'cur': 'ZAR' if m == 'JSE' else 'USD', 'chg': t['chg_1d'], 'p1w': t['perf_1w'], 'p1m': t['perf_1m'], 'p3m': t['perf_3m'],
                         'p6m': t['perf_6m'], 'ytd': t['perf_ytd'], 'rs': t['rs_6m'], 'rsi': t['rsi'], 'sc': sc, 'total': tot, 'max': 8, 'v': E.verdict(tot, 8),
                         'setup': t.get('setup'), 'lvl': t.get('setup_level'),
                         'plan': {k: pl[k] for k in ('side', 'entry', 'stop', 't1', 't2', 'risk_pct')} if pl else None,
                         'sma50': t['sma50'], 'sma200': t['sma200']})
    etf_rows.sort(key=lambda e: (-e['total'], -(e['rs'] or -9)))

    # ---------- sectors ----------
    etf_by = {e['t']: e for e in etf_rows}
    sectors = []
    for m in ('US', 'JSE'):
        groups = {}
        for r in out_rows:
            if r['m'] == m: groups.setdefault(r['sec'], []).append(r)
        for sec, rs in groups.items():
            if len(rs) < 2: continue
            avg = sum(x['total'] / x['max'] for x in rs if x['max']) / len(rs)
            bull = sum(x['v'] in ('Bullish', 'Strong bullish') for x in rs) / len(rs)
            bear = sum(x['v'] in ('Bearish', 'Strong bearish') for x in rs) / len(rs)
            above50 = sum(details[x['t']]['tech']['price'] > (details[x['t']]['tech']['sma50'] or 0) for x in rs) / len(rs)
            setups = sum(x['setup'] in ('Breakout', 'Retest') for x in rs)
            et = cfg['sector_etf'][m].get(sec)
            e = etf_by.get(et)
            etf_part = e['total'] / 8 if e else 0
            score = round(10 * (0.5 * avg / 0.6 + 0.3 * etf_part + 0.2 * (bull - bear)), 1)
            score = max(-10, min(10, score))
            top = sorted(rs, key=lambda x: -x['total'])
            sectors.append({'m': m, 'sec': sec, 'n': len(rs), 'score': score, 'v': E.verdict(score, 10), 'avg': avg, 'bull': bull, 'bear': bear, 'above50': above50,
                            'setups': setups, 'etf': et, 'etf_name': (e or {}).get('n'), 'etf_total': (e or {}).get('total'), 'etf_v': (e or {}).get('v'),
                            'etf_p1m': (e or {}).get('p1m'), 'top': [x['t'] for x in top[:3]], 'bottom': [x['t'] for x in top[-3:]]})
    sectors.sort(key=lambda x: (x['m'], -x['score']))

    gen = dt.datetime.now(SAST).isoformat(timespec='minutes')
    asof = {m: max((r['tech']['date'] for r in rows if r['m'] == m), default=None) for m in ('US', 'JSE')}
    meta = {'generated': gen, 'as_of': asof, 'agent': 'LRC Scanner (GitHub Action)', 'source': 'Yahoo Finance prices, fundamentals and analyst data; LRC scoring rules',
            'benchmarks': cfg['benchmarks']}
    dump(os.path.join(OUT, 'stocks.json'), rnd_all({**meta, 'rows': out_rows}))
    dump(os.path.join(OUT, 'etfs.json'), rnd_all({**meta, 'rows': etf_rows}))
    dump(os.path.join(OUT, 'sectors.json'), rnd_all({**meta, 'rows': sectors}))
    keep = set()
    for s, d in details.items():
        fn = s.replace('^', '_') + '.json'; keep.add(fn)
        dump(os.path.join(OUT, 't', fn), rnd_all({**meta, **d}))
    if not args.only and not args.limit and os.path.isdir(os.path.join(OUT, 't')):
        for fn in os.listdir(os.path.join(OUT, 't')):
            if fn not in keep: os.remove(os.path.join(OUT, 't', fn))
    # keep the fundamentals cache small (no profiles' long text duplicated twice)
    dump(P('agents', 'work', 'scan_fund_cache.json'), rnd_all(cache))
    for s_ in (os.environ.get('SCAN_DEBUG') or '').split(','):
        d = details.get(s_)
        if d: print('DEBUG', s_, json.dumps(rnd_all({'px': d['tech']['price'], 'cur': d['row']['cur'], 'setup': d['row']['setup'], 'v': d['row']['v'], 'sc': d['row']['sc'],
                     **{k: d['f'].get(k) for k in ('mcap', 'currency_reported', 'fx_used', 'tpe', 'yahoo_tpe', 'fpe', 'yahoo_fpe', 'ps', 'pfcf', 'trailing_eps', 'forward_eps', 'target_median', 'rev_growth', 'eps_growth', 'de', 'roe', 'div_yield', 'next_earnings')},
                     'targets': d['targets'], 'plan': d['plan'], 'sup': d['tech']['supports'][:2], 'res': d['tech']['resistances'][:2]})))
    print(f'done: {len(out_rows)} stocks, {len(etf_rows)} ETFs, {len(sectors)} sectors in {time.time() - t0:.0f}s')
    print('setups:', {k: sum(r['setup'] == k for r in out_rows) for k in ('Breakout', 'Retest', 'Near breakout', 'Breakdown', 'Failed retest')})
    if not out_rows: sys.exit('no stocks scored')


if __name__ == '__main__':
    main()
