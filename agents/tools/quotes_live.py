#!/usr/bin/env python3
"""LRC live prices (every 15 minutes with the news wire): latest price and day move for every company in the LRC Stock Scanner,
written to docs/data/scan/quotes.json. The website lays these over the scanner, heatmap, top movers, search and summaries,
so prices stay fresh between the full scanner runs. Yahoo Finance batch quotes (JSE prices converted from cents to rand)."""
import os, sys, json, datetime as dt
sys.path.insert(0, os.path.dirname(__file__))
from yahoo import Yahoo

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = lambda *a: os.path.join(ROOT, *a)
SAST = dt.timezone(dt.timedelta(hours=2))


def main():
    try: idx = json.load(open(P('docs', 'data', 'scan', 'index.json')))
    except Exception:
        idx = {'rows': [[r['t']] for r in json.load(open(P('docs', 'data', 'scan', 'stocks.json')))['rows']]}
    syms = [r[0] for r in idx['rows']]
    q = Yahoo().quotes(syms)
    out = {}
    for s, x in q.items():
        px, ch = x.get('regularMarketPrice'), x.get('regularMarketChangePercent')
        if px is None: continue
        if x.get('currency') in ('ZAc', 'ZAC', 'GBp', 'GBX'): px = px / 100
        t = x.get('regularMarketTime')
        out[s] = [round(px, 4), round(ch / 100, 5) if ch is not None else None, dt.datetime.fromtimestamp(t, SAST).strftime('%Y-%m-%d %H:%M') if t else None]
    if len(out) < 0.5 * len(syms): print(f'only {len(out)} of {len(syms)} quotes; not writing'); return
    json.dump({'generated': dt.datetime.now(SAST).isoformat(timespec='minutes'), 'cols': ['px', 'chg', 'time'], 'q': out},
              open(P('docs', 'data', 'scan', 'quotes.json'), 'w'), separators=(',', ':'))
    print(f'live quotes: {len(out)} of {len(syms)}')


if __name__ == '__main__':
    main()
