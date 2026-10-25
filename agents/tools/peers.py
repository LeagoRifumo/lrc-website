#!/usr/bin/env python3
"""Company-in-context facts for the one-page summary's thesis (added to docs/data/scan/t/<TICKER>.json as "context").

  size      rank by market value in its sector and in its market (JSE or New York), and its three largest sector rivals
  sector    the sector's LRC score and rating, share of its companies above the 50-day average, sector ETF 1-month move

The scanner calls enrich() on every run. Run on its own to add the context to today's files without a new scan:
  python agents/tools/peers.py
"""
import json, os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SCAN = os.path.join(ROOT, 'docs', 'data', 'scan')


def context_for(rows, sectors):
    """rows: scanner rows (t, n, m, sec, mcap); sectors: sectors.json rows. Returns {ticker: context}."""
    out = {}
    secmap = {(s['m'], s['sec']): s for s in sectors}
    by_mkt, by_sec = {}, {}
    for r in rows:
        if not r.get('mcap'):
            continue
        by_mkt.setdefault(r['m'], []).append(r)
        by_sec.setdefault((r['m'], r['sec']), []).append(r)
    for lst in list(by_mkt.values()) + list(by_sec.values()):
        lst.sort(key=lambda r: -r['mcap'])
    for r in rows:
        m, sec = r['m'], r['sec']
        mk, sc = by_mkt.get(m, []), by_sec.get((m, sec), [])
        rank = lambda lst: next((i + 1 for i, x in enumerate(lst) if x['t'] == r['t']), None)
        s = secmap.get((m, sec)) or {}
        out[r['t']] = {
            'mkt_rank': rank(mk), 'mkt_n': len(mk), 'sec_rank': rank(sc), 'sec_n': len(sc),
            'rivals': [{'t': x['t'], 'n': x['n']} for x in sc if x['t'] != r['t']][:3],
            'sector': {k: s.get(k) for k in ('score', 'v', 'n', 'above50', 'bull', 'bear', 'etf', 'etf_name', 'etf_p1m', 'top', 'bottom')} if s else None,
        }
    return out


def enrich(details, rows, sectors):
    ctx = context_for(rows, sectors)
    for t, d in details.items():
        if t in ctx:
            d['context'] = ctx[t]


if __name__ == '__main__':
    S = json.load(open(os.path.join(SCAN, 'stocks.json')))
    SE = json.load(open(os.path.join(SCAN, 'sectors.json')))
    ctx = context_for(S['rows'], SE['rows'])
    n = 0
    for t, c in ctx.items():
        fn = os.path.join(SCAN, 't', t.replace('^', '_') + '.json')
        if not os.path.exists(fn):
            continue
        d = json.load(open(fn))
        d['context'] = c
        json.dump(d, open(fn, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        n += 1
    print(f'context added to {n} company files')
