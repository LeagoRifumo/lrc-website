#!/usr/bin/env python3
"""LRC automated watchlists — built from the LRC Stock Scanner on every scanner run (no manual input).

Per market (JSE and New York), four lists of up to 5 names each:
  trading_buy   Trading scanner (3-12 months) BUY / STRONG BUY, highest Trading score first
  trading_sell  Trading scanner SELL / STRONG SELL, lowest Trading score first
  invest_buy    Investment scanner (5-10 years) BUY / STRONG BUY, highest Investment score first
  invest_sell   Investment scanner SELL / STRONG SELL, lowest Investment score first
Ties are broken by upside to the LRC Analyst Target (BUY lists) or downside (SELL lists).
Only companies with a current price and an actual BUY or SELL rating qualify; if fewer than 5 qualify the list is shorter.

Run on its own to rebuild docs/data/scan/lists.json from the latest docs/data/scan/stocks.json:
  python agents/tools/watchlist_lists.py
"""
import json, os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'docs', 'data', 'scan', 'lists.json')
TOP = 5
BUYS, SELLS = ('BUY', 'STRONG BUY'), ('SELL', 'STRONG SELL')

RULES = {
    'trading_buy': f'Top {TOP} per market: Trading scanner (3-12 months, 6-month LRC Analyst Target) rated BUY or STRONG BUY, highest Trading score first.',
    'trading_sell': f'Top {TOP} per market: Trading scanner rated SELL or STRONG SELL, weakest Trading score first.',
    'invest_buy': f'Top {TOP} per market: Investment scanner (5-10 years) rated BUY or STRONG BUY, highest Investment score first.',
    'invest_sell': f'Top {TOP} per market: Investment scanner rated SELL or STRONG SELL, weakest Investment score first.',
    'auto': 'Rebuilt automatically after every LRC Stock Scanner run (06:37 SAST Tue-Sat and 17:47 SAST Mon-Fri). Nobody picks the names by hand.',
}


def _up(r):
    return (r['tgt'] / r['px'] - 1) if r.get('tgt') and r.get('px') else None


def pick(r, side):
    p = r.get('plan') or {}
    if p.get('side') and p['side'] != side:
        p = {}  # only show an entry plan that agrees with the list
    rel = lambda x: (x / p['entry'] - 1) if p.get('entry') and x else None
    return {'t': r['t'], 'n': r['n'], 'sec': r['sec'], 'cur': r['cur'], 'px': r['px'], 'chg': r.get('chg'),
            'v': r['v'], 'score': r['score'], 'iv_v': r['iv_v'], 'iv_score': r['iv_score'], 'val': r.get('val'),
            'setup': r.get('setup'), 'lvl': r.get('lvl'), 'ne': r.get('ne'), 'cov': r.get('cov'),
            'tgt': r.get('tgt'), 'tgt_up': _up(r), 'inv': r.get('inv'),
            'entry': p.get('entry'), 'stop': p.get('stop'), 't1': p.get('t1'), 't2': p.get('t2'),
            'stop_pct': rel(p.get('stop')), 't1_pct': rel(p.get('t1')), 't2_pct': rel(p.get('t2'))}


def build(rows):
    lists = {}
    for m in ('US', 'JSE'):
        rs = [r for r in rows if r.get('m') == m and r.get('px') and not r.get('stale')]
        up = lambda r: _up(r) if _up(r) is not None else 0
        tb = sorted([r for r in rs if r.get('v') in BUYS], key=lambda r: (-(r.get('score') or 0), -up(r)))[:TOP]
        ts = sorted([r for r in rs if r.get('v') in SELLS], key=lambda r: ((r.get('score') or 0), up(r)))[:TOP]
        ib = sorted([r for r in rs if r.get('iv_v') in BUYS], key=lambda r: (-(r.get('iv_score') or 0), -up(r)))[:TOP]
        is_ = sorted([r for r in rs if r.get('iv_v') in SELLS], key=lambda r: ((r.get('iv_score') or 0), up(r)))[:TOP]
        lists[m] = {'trading_buy': [pick(r, 'Long') for r in tb], 'trading_sell': [pick(r, 'Short') for r in ts],
                    'invest_buy': [pick(r, 'Long') for r in ib], 'invest_sell': [pick(r, 'Short') for r in is_],
                    'counts': {'trading_buy': sum(r.get('v') in BUYS for r in rs), 'trading_sell': sum(r.get('v') in SELLS for r in rs),
                               'invest_buy': sum(r.get('iv_v') in BUYS for r in rs), 'invest_sell': sum(r.get('iv_v') in SELLS for r in rs),
                               'scanned': len(rs)}}
    return lists


def payload(meta, rows):
    return {**meta, 'agent': 'LRC Stock Scanner (automated watchlist)', 'top': TOP, 'rules': RULES, 'lists': build(rows)}


if __name__ == '__main__':
    S = json.load(open(os.path.join(ROOT, 'docs', 'data', 'scan', 'stocks.json')))
    meta = {k: S[k] for k in ('generated', 'as_of', 'source', 'benchmarks') if k in S}
    d = payload(meta, S['rows'])
    json.dump(d, open(OUT, 'w'), indent=1, default=lambda x: None)
    for m, l in d['lists'].items():
        print(m, {k: [x['t'] for x in v] for k, v in l.items() if k != 'counts'})
