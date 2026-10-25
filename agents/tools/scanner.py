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
import sec_quarters as SECQ

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
    # Yahoo quotes EPS in the trading currency (major units) even when the company reports in another currency,
    # while revenue / cash flow / cash / debt are in the reporting currency (fx converts those).
    teps, feps = raw(ks, 'trailingEps'), raw(ks, 'forwardEps')
    tpe = price_major / teps if teps else None
    fpe = price_major / feps if feps else None
    if fpe and tpe and tpe > 0 and fpe > 0 and not (tpe / 3 < fpe < tpe * 3): fpe, feps = None, None  # inconsistent forward data
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
        'trailing_eps': teps, 'forward_eps': feps,
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
    need_ts = [s for s, _ in stocks if (cache.get(s, {}).get('ts_date') or '') < week_ago][:800]
    def get_ts(s):
        try: return s, y.timeseries(s)
        except Exception as e: return s, e
    with ThreadPoolExecutor(args.workers) as ex: tsmap = dict(ex.map(get_ts, need_ts))
    for s, v in tsmap.items():
        if not isinstance(v, Exception): cache.setdefault(s, {}).update({'ts': v, 'ts_date': dt.date.today().isoformat()})
    print(f'financials: {sum(not isinstance(v, Exception) for v in tsmap.values())}/{len(need_ts)} refreshed ({time.time() - t0:.0f}s)')
    # official quarterly revenue / net income for US companies (SEC EDGAR), 8 quarters, refreshed weekly in rotation
    secq = load(P('agents', 'work', 'sec_q_cache.json'), {}) or {}
    try:
        ciks = SECQ.cik_map()
        need = sorted([s for s, m in stocks if m == 'US' and s in ciks and (secq.get(s, {}).get('date') or '') < week_ago],
                      key=lambda s: secq.get(s, {}).get('date') or '')[:int(os.environ.get('SEC_PER_RUN', '220'))]
        def get_q(s):
            try: return s, SECQ.quarters(ciks[s])
            except Exception as e: return s, e
        with ThreadPoolExecutor(4) as ex:
            for s, v in ex.map(get_q, need):
                if not isinstance(v, Exception): secq[s] = {'date': dt.date.today().isoformat(), 'data': v}
        print(f'SEC quarterly financials: {len(need)} refreshed, {len(secq)} cached ({time.time() - t0:.0f}s)')
    except Exception as e:
        print('SEC quarterly step failed:', repr(e)[:120])

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
            cache.setdefault(s, {}).update({'f': {k: v for k, v in f.items() if k not in ('analyst_actions',)}, 'prof': {k: v for k, v in prof.items() if k != 'summary'},
                                            'f_date': dt.date.today().isoformat()})
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
    # ---- six-factor model: percentile ranks vs peers -> LRC score 0-100 ----
    items = []
    for r in rows:
        t, f = r['tech'], r['f']
        tp = E.tech_scores(t)
        acts = f.get('analyst_actions', [])
        mets = {k: f.get(k) for k in ('fpe', 'tpe', 'ps', 'pfcf', 'peg', 'rev_growth', 'eps_growth', 'eps_growth_fwd', 'eps_growth_next', 'roe', 'roa',
                                       'op_margin', 'profit_margin', 'de', 'current_ratio', 'rec_mean', 'short_float')}
        mets.update({'perf_1m': t['perf_1m'], 'perf_3m': t['perf_3m'], 'perf_6m': t['perf_6m'], 'perf_1y': t['perf_1y'],
                     'tgt_up': (f['target_median'] / t['price'] - 1) if f.get('target_median') and f.get('n_analysts') else None,
                     'net_upgrades': (sum(a.get('action') == 'up' for a in acts) - sum(a.get('action') == 'down' for a in acts)) if acts else None,
                     'tech_points': tp['trend'] + tp['setup'] + tp['extension'] + tp['volume']})
        if not f.get('n_analysts'): mets['rec_mean'] = None
        r['tp'] = tp
        items.append({'key': r['t'], 'market': r['m'], 'sector': r['sec'], 'm': mets})
    E.factor_model(items)
    fm = {it['key']: it for it in items}
    out_rows = []
    for r in rows:
        t, f = r['tech'], r['f']
        md = med.get((r['m'], r['sec']), {})
        it = fm[r['t']]
        score = it['score'] if it['score'] is not None else 50
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
        inv = E.investment(f, r['ts'], r['m'], t['price'], tg.get('lrc') or tg.get('blend'))
        tgt_final = tg.get('lrc') or tg.get('blend')
        v_score = E.rating_from_score(score)
        v_final, v_note = E.consistent(v_score, (tgt_final / t['price'] - 1) if tgt_final and t['price'] else None)
        row = {'t': r['t'], 'n': r['n'], 'm': r['m'], 'sec': r['sec'], 'ind': r['ind'], 'cur': r['cur'], 'px': t['price'], 'chg': t['chg_1d'],
               'p1w': t['perf_1w'], 'p1m': t['perf_1m'], 'p6m': t['perf_6m'], 'ytd': t['perf_ytd'], 'mcap': f.get('mcap'), 'rsi': t['rsi'],
               'score': score, 'fac': it['factors'], 'grades': {k: E.grade(v) for k, v in it['factors'].items()}, 'pct': it['pct'], 'tp': r['tp'],
               'v': v_final, 'v_score': v_score, 'v_note': v_note,
               'setup': t.get('setup'), 'lvl': t.get('setup_level'), 'plan': {k: pl[k] for k in ('side', 'entry', 'stop', 't1', 't2', 'risk_pct')} if pl else None,
               'ne': f.get('next_earnings'), 'cat': cats, 'tgt': tg.get('lrc') or tg.get('blend'),
               'cov': {'rating': cov['rating'], 'target': cov['target_6m'], 'rated': cov.get('rated')} if cov else None,
               'res': r['t'] in research, 'stale': r['stale'] or None,
               'inv': {'p': inv['passed'], 'k': inv['known'], 'g': inv['grade'], 'mos': inv['mos'], 'rc': inv['rev_cagr'], 'ec': inv['eps_cagr']},
               'raw': {'rs': t.get('rs_6m'), 'uv': t.get('updown_vol'), 'ext': (t['price'] - t['sma20']) / t['atr'] if t['atr'] and t['sma20'] else None,
                       'fpe': f.get('fpe'), 'tpe': f.get('tpe'), 'ps': f.get('ps'), 'pfcf': f.get('pfcf'), 'rev_growth': f.get('rev_growth'),
                       'eps_growth': f.get('eps_growth'), 'de': f.get('de'), 'roe': f.get('roe'), 'div_yield': f.get('div_yield'),
                       'rec': f.get('rec_mean'), 'na': f.get('n_analysts'), 'tgt_up': (f['target_median'] / t['price'] - 1) if f.get('target_median') else None,
                       'short': f.get('short_float'), 'fpe_sec': md.get('fpe'), 'peg': f.get('peg'), 'roa': f.get('roa'), 'op_margin': f.get('op_margin'),
                       'profit_margin': f.get('profit_margin'), 'eps_growth_fwd': f.get('eps_growth_fwd'), 'perf_3m': t['perf_3m'], 'perf_1y': t['perf_1y']}}
        out_rows.append(row)
        # detail page data
        bars = r['bars']; c = [x['close'] for x in bars]
        # compact history: ~15 months of closes (the page computes the 50/200-day averages) + dates as day gaps
        hb = bars[-460:]
        d0 = dt.date.fromisoformat(hb[0]['date'])
        gaps, prev = [], d0
        for x in hb[1:]:
            d = dt.date.fromisoformat(x['date']); gaps.append((d - prev).days); prev = d
        hist = {'d0': hb[0]['date'], 'gap': ''.join(str(min(g, 9)) for g in gaps), 'c': [rnd(x['close'], 5) for x in hb]}
        val = []
        for k, label, lower in [('fpe', 'Forward P/E', True), ('tpe', 'TTM P/E', True), ('ps', 'Price / Sales', True), ('pfcf', 'Price / FCF', True),
                                ('peg', 'PEG', True), ('pb', 'Price / Book', True), ('de', 'Debt / Equity (%)', True), ('rev_growth', 'Revenue growth', False),
                                ('eps_growth', 'EPS growth (last qtr, y/y)', False), ('eps_growth_fwd', 'EPS growth (this year, est.)', False),
                                ('eps_growth_next', 'EPS growth (next year, est.)', False), ('gross_margin', 'Gross margin', False),
                                ('op_margin', 'Operating margin', False), ('profit_margin', 'Net margin', False), ('roe', 'Return on equity', False),
                                ('roa', 'Return on assets', False), ('current_ratio', 'Current ratio', False), ('div_yield', 'Dividend yield', False)]:
            v, mv = f.get(k), md.get(k)
            if v is None: verdict = '—'
            elif k in ('fpe', 'tpe', 'ps', 'pfcf') and v <= 0: verdict = 'Loss-making' if k != 'pfcf' else 'Negative FCF'
            elif mv is not None and mv != 0:
                ratio = v / mv
                if k == 'de': verdict = 'Low debt' if ratio < 0.8 else 'High debt' if ratio > 1.25 else 'In line'
                elif lower: verdict = 'Undervalued' if ratio < 0.8 else 'Overvalued' if ratio > 1.25 else 'Fairly valued'
                elif k == 'current_ratio': verdict = 'Strong' if ratio > 1.25 else 'Weak' if ratio < 0.8 else 'In line'
                else:
                    band = max(abs(mv) * 0.25, 0.02)
                    verdict = 'Strong' if v > mv + band else 'Weak' if v < mv - band else 'In line'
            else: verdict = '—'
            val.append({'k': k, 'label': label, 'v': v, 'sector': mv, 'pct': it['pct'].get(k), 'verdict': verdict})
        details[r['t']] = {'row': row, 'tech': {k: v for k, v in t.items() if k not in ('setup_bar',)}, 'f': f, 'profile': r['prof'], 'sector_medians': md,
                           'valuation': val, 'targets': tg, 'plan': pl, 'history': hist, 'financials': r['ts'], 'sec_q': (secq.get(r['t']) or {}).get('data'), 'dividends': r['meta'].get('dividends', [])[-8:],
                           'benchmark': cfg['benchmarks'][r['m']]['name'], 'research': r['t'] in research, 'investment': inv}

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
        sc = E.tech_scores(t); pl = E.plan(bars, t)
        etf_rows.append({'t': s, 'n': label, 'full': (quotes.get(s) or {}).get('longName') or meta.get('name'), 'm': m, 'g': grp, 'px': t['price'],
                         'cur': 'ZAR' if m == 'JSE' else 'USD', 'chg': t['chg_1d'], 'p1w': t['perf_1w'], 'p1m': t['perf_1m'], 'p3m': t['perf_3m'],
                         'p6m': t['perf_6m'], 'ytd': t['perf_ytd'], 'rs': t['rs_6m'], 'rsi': t['rsi'], 'tp': sc, 'p1y': t['perf_1y'],
                         'setup': t.get('setup'), 'lvl': t.get('setup_level'),
                         'plan': {k: pl[k] for k in ('side', 'entry', 'stop', 't1', 't2', 'risk_pct')} if pl else None,
                         'sma50': t['sma50'], 'sma200': t['sma200']})
    # ETF score: percentile rank within its market of momentum (1/3/6/12 months) + trend/setup points
    for mk in ('US', 'JSE'):
        es = [e for e in etf_rows if e['m'] == mk]
        comp = {e['t']: [] for e in es}
        for key in ('p1m', 'p3m', 'p6m', 'p1y', 'pts'):
            vals = [(e['t'], (e['tp']['trend'] + e['tp']['setup'] + e['tp']['extension'] + e['tp']['volume']) if key == 'pts' else e[key]) for e in es]
            vals = [(k, v) for k, v in vals if v is not None]
            for k, p_ in E.pctile(vals).items(): comp[k].append(p_)
        sc_ = E.pctile([(k, sum(v) / len(v)) for k, v in comp.items() if v])
        for e in es:
            e['score'] = round(sc_.get(e['t'], 50)); e['v'] = E.rating_from_score(e['score'])
    etf_rows.sort(key=lambda e: -e['score'])

    # ---------- sectors ----------
    etf_by = {e['t']: e for e in etf_rows}
    sectors = []
    for m in ('US', 'JSE'):
        groups = {}
        for r in out_rows:
            if r['m'] == m: groups.setdefault(r['sec'], []).append(r)
        for sec, rs in groups.items():
            if len(rs) < 2: continue
            avg = sum(x['score'] for x in rs) / len(rs)
            bull = sum(x['v'] in ('BUY', 'STRONG BUY') for x in rs) / len(rs)
            bear = sum(x['v'] in ('SELL', 'STRONG SELL') for x in rs) / len(rs)
            above50 = sum(details[x['t']]['tech']['price'] > (details[x['t']]['tech']['sma50'] or 0) for x in rs) / len(rs)
            setups = sum(x['setup'] in ('Breakout', 'Retest') for x in rs)
            et = cfg['sector_etf'][m].get(sec)
            e = etf_by.get(et)
            # sector score 0-100: average LRC score of its companies (70%) + its sector ETF score (30%)
            score = round(0.7 * avg + 0.3 * e['score']) if e else round(avg)
            top = sorted(rs, key=lambda x: -x['score'])
            sectors.append({'m': m, 'sec': sec, 'n': len(rs), 'score': score, 'v': E.rating_from_score(score), 'avg': round(avg), 'bull': bull, 'bear': bear, 'above50': above50,
                            'setups': setups, 'etf': et, 'etf_name': (e or {}).get('n'), 'etf_score': (e or {}).get('score'), 'etf_v': (e or {}).get('v'),
                            'etf_p1m': (e or {}).get('p1m'), 'top': [x['t'] for x in top[:3]], 'bottom': [x['t'] for x in top[-3:]]})
    sectors.sort(key=lambda x: (x['m'], -x['score']))

    gen = dt.datetime.now(SAST).isoformat(timespec='minutes')
    asof = {m: max((r['tech']['date'] for r in rows if r['m'] == m), default=None) for m in ('US', 'JSE')}
    meta = {'generated': gen, 'as_of': asof, 'agent': 'LRC Scanner (GitHub Action)', 'source': 'Yahoo Finance prices, fundamentals and analyst data; LRC scoring rules',
            'benchmarks': cfg['benchmarks']}
    dump(os.path.join(OUT, 'stocks.json'), rnd_all({**meta, 'rows': out_rows}))
    dump(os.path.join(OUT, 'etfs.json'), rnd_all({**meta, 'rows': etf_rows}))
    dump(os.path.join(OUT, 'sectors.json'), rnd_all({**meta, 'rows': sectors}))
    # ---------- website watchlists (both markets, rebuilt every run) ----------
    def pick(r):
        p = r['plan'] or {}
        up = lambda x: (x / p['entry'] - 1) if p.get('entry') and x else None
        return {'t': r['t'], 'n': r['n'], 'sec': r['sec'], 'cur': r['cur'], 'px': r['px'], 'chg': r['chg'], 'v': r['v'], 'score': r['score'], 'grades': r['grades'],
                'setup': r['setup'], 'lvl': r['lvl'], 'ne': r['ne'], 'cov': r['cov'], 'tgt': r['tgt'], 'tgt_up': (r['tgt'] / r['px'] - 1) if r['tgt'] and r['px'] else None,
                'entry': p.get('entry'), 'stop': p.get('stop'), 't1': p.get('t1'), 't2': p.get('t2'),
                'stop_pct': up(p.get('stop')), 't1_pct': up(p.get('t1')), 't2_pct': up(p.get('t2')), 'inv': r['inv']}
    lists = {}
    for m in ('US', 'JSE'):
        rs = [r for r in out_rows if r['m'] == m]
        longs = sorted([r for r in rs if r['plan'] and r['plan']['side'] == 'Long' and r['v'] in ('BUY', 'STRONG BUY')], key=lambda r: -r['score'])[:10]
        shorts = sorted([r for r in rs if r['plan'] and r['plan']['side'] == 'Short' and r['v'] in ('SELL', 'STRONG SELL')], key=lambda r: r['score'])[:10]
        inv = sorted([r for r in rs if r['inv']['g'] in ('A', 'B') and (r['inv']['mos'] or 0) > 0], key=lambda r: (-r['inv']['p'], -(r['inv']['mos'] or 0)))[:10]
        lists[m] = {'long': [pick(r) for r in longs], 'short': [pick(r) for r in shorts], 'investment': [pick(r) for r in inv]}
    dump(os.path.join(OUT, 'lists.json'), rnd_all({**meta, 'rules': {
        'long': 'Up to 10 per market: LRC Stock Scanner BUY / STRONG BUY with a Breakout, Retest or Near-breakout entry plan, strongest score first',
        'short': 'Up to 10 per market: SELL / STRONG SELL with a Breakdown or Failed-retest plan, weakest score first',
        'investment': 'Up to 10 per market: Investment-track grade A or B with upside to the LRC Analyst Target, most checks passed first'}, 'lists': lists}))
    keep = set()
    for s, d in details.items():
        fn = s.replace('^', '_') + '.json'; keep.add(fn)
        dump(os.path.join(OUT, 't', fn), rnd_all({**meta, **d}))
    if not args.only and not args.limit and os.path.isdir(os.path.join(OUT, 't')):
        for fn in os.listdir(os.path.join(OUT, 't')):
            if fn not in keep: os.remove(os.path.join(OUT, 't', fn))
    # keep the fundamentals cache small (no profiles' long text duplicated twice)
    dump(P('agents', 'work', 'scan_fund_cache.json'), rnd_all(cache))
    dump(P('agents', 'work', 'sec_q_cache.json'), secq)
    for s_ in (os.environ.get('SCAN_DEBUG') or '').split(','):
        d = details.get(s_)
        if d: print('DEBUG', s_, json.dumps(rnd_all({'px': d['tech']['price'], 'cur': d['row']['cur'], 'setup': d['row']['setup'], 'v': d['row']['v'], 'fac': d['row']['fac'],
                     **{k: d['f'].get(k) for k in ('mcap', 'currency_reported', 'fx_used', 'tpe', 'yahoo_tpe', 'fpe', 'yahoo_fpe', 'ps', 'pfcf', 'trailing_eps', 'forward_eps', 'target_median', 'rev_growth', 'eps_growth', 'de', 'roe', 'div_yield', 'next_earnings')},
                     'targets': d['targets'], 'plan': d['plan'], 'sup': d['tech']['supports'][:2], 'res': d['tech']['resistances'][:2]})))
    print(f'done: {len(out_rows)} stocks, {len(etf_rows)} ETFs, {len(sectors)} sectors in {time.time() - t0:.0f}s')
    print('setups:', {k: sum(r['setup'] == k for r in out_rows) for k in ('Breakout', 'Retest', 'Near breakout', 'Breakdown', 'Failed retest')})
    if not out_rows: sys.exit('no stocks scored')


if __name__ == '__main__':
    main()
