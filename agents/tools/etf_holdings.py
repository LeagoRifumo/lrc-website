"""ETF holdings for the Sectors & ETFs page (LRC analyst view).

For each ETF we try, in order:
  1. Yahoo Finance quoteSummary 'topHoldings' (the issuer's latest top holdings and weights).
  2. A 'mirror': a JSE feeder ETF that tracks the same index as a US ETF (e.g. Satrix S&P 500 -> SPY).
  3. A 'proxy' for JSE index ETFs Yahoo has no holdings for: the largest JSE companies in that part of the market,
     ranked by market value from the LRC Scanner (labelled on the page as an LRC estimate, without weights).
Commodity and government-bond ETFs hold no companies; the page explains what they hold instead.

Each holding is matched to the LRC Scanner so the page can show its LRC grade and score, and a 'look-through'
score: the weighted average LRC score of the holdings we cover.
"""
import json, os, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from scan_engine import INVEST_W, rating_v7 as rating

PILLARS = ('valuation', 'growth', 'profitability', 'health', 'income', 'sentiment')
TECH_W = 0.6        # ETF score = 60% technical + 40% fundamentals (LRC trading horizon, 3-12 months)
MIN_N, MIN_COV = 3, 0.5   # need 3+ graded holdings covering half the listed top-holding weight, else technical only

CFG = os.path.join(os.path.dirname(__file__), '..', 'config', 'etf_notes.json')

# JSE ETFs without usable Yahoo holdings: follow a US ETF on the same index, or build a proxy from the scanner
MIRROR = {'STXWDM.JO': 'URTH', 'STX500.JO': 'SPY', 'STXNDQ.JO': 'QQQ', 'STXEMG.JO': 'EEM', 'STXCHN.JO': 'FXI'}
RESI = {'Basic Materials', 'Energy'}
FIN = {'Financial Services'}
PROP = {'Real Estate'}
PROXY = {
    'STX40.JO': ('Largest JSE companies by market value', lambda r: True),
    'STXCAP.JO': ('Largest JSE companies by market value (the Capped All Share limits any one company to 10%)', lambda r: True),
    'STXRES.JO': ('Largest JSE resources companies (mining and energy)', lambda r: r['sec'] in RESI),
    'STXFIN.JO': ('Largest JSE financial companies (banks and insurers)', lambda r: r['sec'] in FIN),
    'STXIND.JO': ('Largest JSE industrial companies (everything outside resources, financials and property)', lambda r: r['sec'] not in RESI | FIN | PROP),
    'STXPRO.JO': ('Largest JSE property companies (REITs)', lambda r: r['sec'] in PROP),
}


def _yahoo_top(y, sym):
    j = json.loads(y.get(f'https://query2.finance.yahoo.com/v10/finance/quoteSummary/{urllib.parse.quote(sym)}'
                         f'?modules=topHoldings&crumb={urllib.parse.quote(y.ensure_crumb())}', tries=2))
    th = ((j.get('quoteSummary') or {}).get('result') or [{}])[0].get('topHoldings') or {}
    raw = lambda v: v.get('raw') if isinstance(v, dict) else v
    hold = [{'s': h.get('symbol'), 'n': h.get('holdingName'), 'w': raw(h.get('holdingPercent'))} for h in th.get('holdings') or [] if h.get('holdingName')]
    sw = []
    for d in th.get('sectorWeightings') or []:
        for k, v in d.items():
            v = raw(v)
            if v: sw.append({'k': k, 'w': v})
    sw.sort(key=lambda x: -x['w'])
    eq = th.get('equityHoldings') or {}
    fv = {k: raw(eq.get(y_)) for k, y_ in (('pe', 'priceToEarnings'), ('pb', 'priceToBook'), ('ps', 'priceToSales'), ('pcf', 'priceToCashflow'), ('g3', 'threeYearEarningsGrowth'))}
    fv = {k: v for k, v in fv.items() if isinstance(v, (int, float)) and v}
    return {'hold': hold, 'sw': sw[:4], 'fv': fv}


def _match(rows_by, s, m):
    if not s: return None
    s = s.strip().upper().replace('.', '-') if '.' in s and not s.endswith('.JO') else s.strip().upper()
    base = s.split('.')[0]
    for k in (s, s + '.JO', s.replace('-', '.'), base + '.JO', base):
        if k in rows_by: return rows_by[k]
    return None


def build(y, etf_rows, out_rows, workers=6, top=8):
    notes = {}
    try: notes = json.load(open(CFG))
    except Exception as e: print('  etf notes missing:', e)
    rows_by = {r['t']: r for r in out_rows}
    want = [e['t'] for e in etf_rows if (notes.get(e['t']) or {}).get('kind', 'equity') == 'equity']

    def fetch(sym):
        try: return sym, _yahoo_top(y, sym)
        except Exception as ex: return sym, {'err': repr(ex)[:80]}
    with ThreadPoolExecutor(workers) as ex: got = dict(ex.map(fetch, want + [v for v in MIRROR.values() if v not in want]))
    ok_n = sum(1 for v in got.values() if v.get('hold'))
    print(f'  ETF holdings: {ok_n}/{len(got)} from Yahoo')

    for e in etf_rows:
        nt = notes.get(e['t']) or {}
        e['kind'] = nt.get('kind', 'equity')
        if nt: e['note'] = {k: nt[k] for k in ('what', 'drivers', 'risk') if nt.get(k)}
        if e['kind'] != 'equity': continue
        g = got.get(e['t']) or {}
        src, hold = 'issuer', g.get('hold') or []
        if not hold and e['t'] in MIRROR:
            hold = (got.get(MIRROR[e['t']]) or {}).get('hold') or []
            src = 'mirror:' + MIRROR[e['t']]; g = got.get(MIRROR[e['t']]) or {}
        if not hold and e['t'] in PROXY:
            label, keep = PROXY[e['t']]
            pick = sorted([r for r in out_rows if r['m'] == 'JSE' and r.get('mcap') and keep(r)], key=lambda r: -r['mcap'])[:top]
            hold = [{'s': r['t'], 'n': r['n'], 'w': None} for r in pick]
            src = 'proxy'; e['hlabel'] = label
        out = []
        for h in hold[:top]:
            r = _match(rows_by, h.get('s'), e['m'])
            out.append({'s': (r or {}).get('t') or h.get('s'), 'n': h.get('n') or (r or {}).get('n'), 'w': h.get('w'),
                        'v': (r or {}).get('v'), 'sc': (r or {}).get('score'), 'iv': (r or {}).get('iv_v'), 'fs': (r or {}).get('iv_score'), 'in': bool(r),
                        '_g': (r or {}).get('grp') or {}})
        if not out: continue
        e['hold'], e['hsrc'], e['sw'] = out, src, g.get('sw') or []
        if g.get('fv'): e['fv'] = g['fv']
        cov = [h for h in out if h['in'] and h['sc'] is not None]
        if cov:
            ws = [(h['w'] or 1.0) for h in cov]
            e['lt'] = round(sum(h['sc'] * w for h, w in zip(cov, ws)) / sum(ws))
            e['lt_strong'] = round(sum(w for h, w in zip(cov, ws) if h['v'] in ('BUY', 'STRONG BUY')) / sum(ws), 3)
            e['lt_weak'] = round(sum(w for h, w in zip(cov, ws) if h['v'] in ('SELL', 'STRONG SELL')) / sum(ws), 3)
            e['lt_n'] = len(cov)
            # fundamentals look-through: weighted average of each pillar across the covered holdings
            pil = {}
            for p in PILLARS:
                xs = [(h['_g'].get(p), w) for h, w in zip(cov, ws) if h['_g'].get(p) is not None]
                if xs: pil[p] = round(sum(a * w for a, w in xs) / sum(w for _, w in xs))
            fw = {p: INVEST_W[p] for p in pil if p in INVEST_W}
            listed_w = sum(h['w'] for h in out if h['w']) or 0
            e['cov'] = round(sum(h['w'] for h in cov if h['w']) / listed_w, 3) if listed_w else round(len(cov) / len(out), 3)
            if fw and len(cov) >= MIN_N and e['cov'] >= MIN_COV:
                e['pil'] = pil
                e['fscore'] = round(sum(pil[p] * w for p, w in fw.items()) / sum(fw.values()))
        for h in out: h.pop('_g', None)
    # ---------- blended ETF score: 60% technical (trend, momentum, setup, stretch, volume) + 40% fundamentals of the holdings ----------
    for e in etf_rows:
        e['tscore'] = e['score']
        if e.get('fscore') is not None:
            e['score'] = round(TECH_W * e['tscore'] + (1 - TECH_W) * e['fscore']); e['smode'] = 'blend'
        else:
            e['smode'] = 'technical'
        v = rating(e['score']); gate = None
        if v in ('BUY', 'STRONG BUY') and e.get('sma200') and e['px'] < e['sma200']:
            v, gate = 'HOLD', 'Capped at HOLD: price is below its 200-day average'
        elif v == 'STRONG BUY' and not (e.get('sma50') and e['px'] > e['sma50'] and (e.get('rsi') or 50) < 75):
            v, gate = 'BUY', 'Capped at BUY: STRONG BUY needs price above the 50-day average and RSI below 75'
        e['v'] = v
        if gate: e['gate'] = gate
        else: e.pop('gate', None)
    etf_rows.sort(key=lambda e: -e['score'])
    return etf_rows
