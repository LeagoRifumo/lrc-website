#!/usr/bin/env python3
"""DAILY (GitHub Action): refresh prices + technicals for every rated name, then rebuild the watchlist with the house rules.
Fundamentals that change slowly (sector, market cap, short float, EPS growth, next results date) are kept from the
snapshot — the weekly Claude agent refreshes those. Ratings come only from docs/data/ratings.json (analyst)."""
import sys, os, json, datetime as dt
sys.path.insert(0, os.path.dirname(__file__))
from lrcdata import P, load, daily_bars, sma, rsi_wilder, atr_wilder, now_sast
import build_watchlist

def techs(bars):
    c = [b['close'] for b in bars]; last = bars[-1]
    yr = bars[-252:]
    t = {'price': round(c[-1], 2), 'sma20': round(sma(c, 20), 2), 'sma50': round(sma(c, 50), 2),
         'sma200': round(sma(c, 200), 2) if len(c) >= 200 else round(sma(c, len(c)), 2),
         'rsi': round(rsi_wilder(c), 2), 'atr14': round(atr_wilder(bars), 2),
         'hi52': round(max(b['high'] for b in yr), 2), 'lo52': round(min(b['low'] for b in yr), 2),
         'high_2d': round(max(b['high'] for b in bars[-2:]), 2), 'swing_low_15d': round(min(b['low'] for b in bars[-15:]), 2),
         'perf_quarter': round(c[-1] / c[-64] - 1, 4) if len(c) > 64 else None, 'perf_half': round(c[-1] / c[-127] - 1, 4) if len(c) > 127 else None,
         'avg_volume': round(sum(b['volume'] for b in bars[-63:]) / min(63, len(bars))), 'as_of': last['date']}
    t['rel_volume'] = round(last['volume'] / t['avg_volume'], 2) if t['avg_volume'] else None
    return t

def main():
    ratings = (load(P('docs', 'data', 'ratings.json'), {}) or {}).get('ratings', {})
    if not ratings:
        print('no hand-rated companies (site is fully automated) — house-rule watchlist skipped'); return
    snap = {x['ticker']: x for x in load(P('agents', 'work', 'snapshot.json'), [])}
    ok, bad = [], []
    for t, r in ratings.items():
        try:
            x = snap.get(t, {'ticker': t, 'name': r['name']})
            x.update(techs(daily_bars(t))); x['stale'] = False; snap[t] = x; ok.append(t)
        except Exception as e:
            bad.append(f'{t}: {e}')
            if t in snap: snap[t]['stale'] = True
    try:
        spy = [b['close'] for b in daily_bars('SPY')]; sp_half = spy[-1] / spy[-127] - 1
    except Exception:
        sp_half = 0.1437
    json.dump(list(snap.values()), open(P('agents', 'work', 'snapshot.json'), 'w'), indent=1)
    as_of = max((x.get('as_of', '') for x in snap.values()), default='') or now_sast().date().isoformat()
    print(f'refreshed {len(ok)} names; failed {len(bad)}; S&P 500 6-month {sp_half:.2%}; as of {as_of}')
    for b in bad: print('  FAIL', b)
    if not ok: sys.exit('no prices refreshed — keeping yesterday\'s watchlist')
    build_watchlist.main(as_of, sp_half)

if __name__ == '__main__':
    main()
