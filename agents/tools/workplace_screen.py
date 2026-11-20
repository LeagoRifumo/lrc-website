#!/usr/bin/env python3
"""LRC Workplace screen — chooses the Workplace Top Picks by fixed rules (agents/config/workplace_picks.json).

  * JSE and US: 10 bullish and 10 bearish names each, stocks and ETFs, from the LRC Scanner (docs/data/scan/).
  * Forex and Commodities: every instrument ranked from docs/data/scan/macro_assets.json.

The picks are PRIVATE: this script only writes to the path given with --out (default /tmp/workplace_screen.json).
Never write its output into docs/ or commit it. The Screening Analyst reads it and uploads the picks to the
private LRC Workplace. Usage: python3 agents/tools/workplace_screen.py [--out PATH]
"""
import os, sys, json, argparse, datetime as dt
sys.path.insert(0, os.path.dirname(__file__))
from lrcdata import P, load, now_sast

TIER_BULL = {'STRONG BUY': 0, 'BUY': 1, 'HOLD': 2}
TIER_BEAR = {'STRONG SELL': 0, 'SELL': 1, 'HOLD': 2}
GROUPS = ['valuation', 'growth', 'profitability', 'health', 'income', 'sentiment', 'technical']


def days_to(d, today):
    try: return (dt.date.fromisoformat(d[:10]) - today).days
    except Exception: return None


def liquid(r, mk):
    return ((r.get('vt') or 0) >= mk['min_value_traded'] and (r.get('mcap') or 0) >= mk['min_market_cap']
            and (r.get('px') or 0) >= mk['min_price'] and r.get('liq') != 'thin' and not r.get('stale'))


def card(r, kind, side, rank, flag):
    tp = r.get('tp') or {}
    base = {'rank': rank, 'side': side, 'kind': kind, 'ticker': r['t'], 'name': r.get('n'), 'market': r.get('m'),
            'sector': r.get('sec') if kind == 'stock' else (r.get('g') or 'ETF'), 'industry': r.get('ind'),
            'currency': r.get('cur'), 'price': r.get('px'), 'chg': r.get('chg'), 'p1w': r.get('p1w'), 'p1m': r.get('p1m'),
            'p6m': r.get('p6m'), 'ytd': r.get('ytd'), 'rsi': r.get('rsi'), 'atr_pct': r.get('atrp'),
            'rating': r.get('v'), 'score': r.get('score'), 'tp': tp, 'setup': r.get('setup'), 'setup_level': r.get('lvl'),
            'plan': r.get('plan'), 'support': r.get('sup'), 'resistance': r.get('res'),
            'tier': 'Rated' if r.get('v') in (('STRONG BUY', 'BUY') if side == 'Bull' else ('STRONG SELL', 'SELL')) else 'Trend pick',
            'event_risk': flag}
    if kind == 'stock':
        base.update({'groups': {k: (r.get('grp') or {}).get(k) for k in GROUPS}, 'valuation': r.get('val'),
                     'investment_rating': r.get('iv_v'), 'analyst_target_6m': r.get('tgt'), 'next_results': r.get('ne'),
                     'catalysts': r.get('cat'), 'market_cap': r.get('mcap'), 'value_traded': r.get('vt'),
                     'quality': (r.get('inv') or {}).get('g'), 'margin_of_safety': (r.get('inv') or {}).get('mos'),
                     'readings': {k: (v[0] if isinstance(v, list) else v) for k, v in (r.get('rd') or {}).items()}})
    else:
        base.update({'etf_note': r.get('note'), 'full_name': r.get('full'), 'sma50': r.get('sma50'), 'sma200': r.get('sma200')})
    return base


def choose(stocks, etfs, market, side, cfg, liq, today):
    S = cfg[side.lower()]; cands = []
    for r in stocks:
        if r.get('m') != market or not liquid(r, liq): continue
        if r.get('v') in S['exclude_ratings']: continue
        tp = r.get('tp') or {}; tr, mo = tp.get('trend') or 0, tp.get('momentum') or 0
        if side == 'Bull' and (tr < S['min_trend'] or mo < S['min_momentum']): continue
        if side == 'Bear' and (tr > S['max_trend'] or mo > S['max_momentum']): continue
        if r.get('rsi') is None or not (S['rsi_range'][0] <= r['rsi'] <= S['rsi_range'][1]): continue
        if r.get('plan') and r['plan'].get('side') != ('Long' if side == 'Bull' else 'Short'): continue
        dn = days_to(r['ne'], today) if r.get('ne') else None
        if dn is not None and 0 <= dn <= cfg['skip_results_within_days']: continue
        flag = f"Results on {r['ne']} ({dn} days)" if dn is not None and 0 <= dn <= cfg['flag_results_within_days'] else None
        cands.append(('stock', r, flag))
    for r in etfs:
        if r.get('m') != market or r.get('v') in S['exclude_ratings']: continue
        tp = r.get('tp') or {}; tr, mo = tp.get('trend') or 0, tp.get('momentum') or 0
        if side == 'Bull' and (tr < S['min_trend'] or mo < S['min_momentum']): continue
        if side == 'Bear' and (tr > S['max_trend'] or mo > S['max_momentum']): continue
        if r.get('rsi') is None or not (S['rsi_range'][0] <= r['rsi'] <= S['rsi_range'][1]): continue
        cands.append(('etf', r, None))
    tier = TIER_BULL if side == 'Bull' else TIER_BEAR
    sign = -1 if side == 'Bull' else 1
    cands.sort(key=lambda c: (tier.get(c[1].get('v'), 9), sign * (c[1].get('score') or 50), -(c[1].get('vt') or 0)))
    out, per_sec, n_etf = [], {}, 0
    for kind, r, flag in cands:
        sec = r.get('sec') if kind == 'stock' else 'ETF · ' + (r.get('g') or '')
        if per_sec.get(sec, 0) >= cfg['max_per_sector']: continue
        if kind == 'etf' and n_etf >= cfg['max_etfs_per_list']: continue
        per_sec[sec] = per_sec.get(sec, 0) + 1; n_etf += kind == 'etf'
        out.append(card(r, kind, side, len(out) + 1, flag))
        if len(out) >= cfg['per_list']: break
    return out, len(cands)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--out', default='/tmp/workplace_screen.json'); a = ap.parse_args()
    if os.path.abspath(a.out).startswith(P('docs')): sys.exit('Refusing to write private picks into docs/.')
    cfg = load(P('agents', 'config', 'workplace_picks.json')); liq = load(P('agents', 'config', 'top_picks.json'))['markets']
    st = load(P('docs', 'data', 'scan', 'stocks.json'), {}); et = load(P('docs', 'data', 'scan', 'etfs.json'), {})
    mac = load(P('docs', 'data', 'scan', 'macro_assets.json'), {})
    today = now_sast().date()
    lists, shortfalls = {}, []
    for m in ('JSE', 'US'):
        lists[m] = {}
        for side in ('Bull', 'Bear'):
            picks, n = choose(st.get('rows', []), et.get('rows', []), m, side, cfg, liq[m], today)
            lists[m][side.lower()] = picks
            if len(picks) < cfg['per_list']:
                shortfalls.append(f"{m} {side.lower()}: only {len(picks)} of {cfg['per_list']} names pass the rules today ({n} candidates before the sector and ETF limits).")
    sb = cfg['scoreboard']; boards = {}
    for cls in ('fx', 'cm'):
        rows = [r for r in mac.get('rows', []) if r.get('cls') == cls]
        for r in rows: r['bias'] = 'Bull' if r['score'] >= sb['bull_from'] else 'Bear' if r['score'] <= sb['bear_to'] else 'Neutral'
        boards[cls] = rows
    res = {'generated': now_sast().strftime('%Y-%m-%dT%H:%M+02:00'), 'data_as_of': {'stocks': st.get('generated'), 'etfs': et.get('generated'), 'macro': mac.get('generated')},
           'rules': cfg, 'lists': lists, 'scoreboards': boards, 'macro_missing': mac.get('missing', []), 'shortfalls': shortfalls}
    json.dump(res, open(a.out, 'w'), indent=1, ensure_ascii=False)
    print(f"written {a.out}: " + ', '.join(f"{m} {s} {len(lists[m][s])}" for m in lists for s in lists[m]) + f"; fx {len(boards['fx'])}, commodities {len(boards['cm'])}")
    for s in shortfalls: print('  shortfall:', s)


if __name__ == '__main__':
    main()
