#!/usr/bin/env python3
"""LRC Stock Scanner track record (GitHub Action, after every scanner run).
1. Saves today's ratings, scores, prices, LRC Analyst Targets and setups: docs/data/track/snap/<date>.json
2. Measures how the ratings performed afterwards and writes docs/data/track/performance.json:
   * average return and hit rate by rating after 1 week, 1 month and 3 months, against the equal-weight market average
   * daily equal-weight baskets (BUY+STRONG BUY / HOLD / SELL+STRONG SELL / all) as index lines starting at 100
   * setup outcomes: did price reach target 1 before the stop (within 30 days)?
   * LRC Analyst Target: share of targets reached within 6 months
Nothing is back-filled: the record starts on the first day the scanner ran."""
import os, json, datetime as dt
from statistics import mean

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = lambda *a: os.path.join(ROOT, *a)
SNAP = P('docs', 'data', 'track', 'snap')
SAST = dt.timezone(dt.timedelta(hours=2))
BUYS, SELLS = ('BUY', 'STRONG BUY'), ('SELL', 'STRONG SELL')
HORIZONS = {'1 week': 7, '1 month': 30, '3 months': 91, '6 months': 182}


def load(p, d=None):
    try: return json.load(open(p, encoding='utf-8'))
    except Exception: return d


def save_snapshot():
    sc = load(P('docs', 'data', 'scan', 'stocks.json'))
    if not sc or not sc.get('rows'): return None
    day = dt.datetime.now(SAST).date().isoformat()
    rows = []
    for r in sc['rows']:
        p = r.get('plan') or {}
        rows.append([r['t'], r['m'], r.get('score'), r['v'], r['px'], r.get('tgt'), r.get('setup'), p.get('side'), p.get('entry'), p.get('stop'), p.get('t1')])
    os.makedirs(SNAP, exist_ok=True)
    json.dump({'date': day, 'as_of': sc.get('as_of'), 'cols': ['t', 'm', 'score', 'rating', 'price', 'target', 'setup', 'side', 'entry', 'stop', 't1'], 'rows': rows},
              open(os.path.join(SNAP, day + '.json'), 'w'), separators=(',', ':'))
    return day


def group(v):
    return 'BUY' if v in BUYS else 'SELL' if v in SELLS else 'HOLD'


def main():
    save_snapshot()
    files = sorted(f for f in os.listdir(SNAP) if f.endswith('.json')) if os.path.isdir(SNAP) else []
    snaps = [load(os.path.join(SNAP, f)) for f in files]
    snaps = [s for s in snaps if s]
    dates = [dt.date.fromisoformat(s['date']) for s in snaps]
    px = [{(r[0]): r[4] for r in s['rows']} for s in snaps]
    out = {'generated': dt.datetime.now(SAST).isoformat(timespec='minutes'), 'since': snaps[0]['date'] if snaps else None, 'days': len(snaps),
           'note': 'Live record from the first scanner run; nothing is back-filled. Returns are price returns (no dividends), equal-weighted.', 'markets': {}}
    for mk in ('US', 'JSE'):
        res = {'by_rating': {}, 'curves': {}, 'setups': {}, 'targets': {}}
        # --- forward returns by rating
        for hname, hd in HORIZONS.items():
            agg = {g: [] for g in ('STRONG BUY', 'BUY', 'HOLD', 'SELL', 'STRONG SELL')}
            mkt = []
            for i, s in enumerate(snaps):
                j = next((k for k in range(i + 1, len(snaps)) if (dates[k] - dates[i]).days >= hd), None)
                if j is None: continue
                rets = {}
                for r in s['rows']:
                    if r[1] != mk or not r[4] or r[0] not in px[j] or not px[j][r[0]]: continue
                    rets[r[0]] = (px[j][r[0]] / r[4] - 1, r[3])
                if not rets: continue
                m_avg = mean(x for x, _ in rets.values()); mkt.append(m_avg)
                for g in agg:
                    xs = [x for x, v in rets.values() if v == g]
                    if xs: agg[g].append((mean(xs), sum((x > 0) if g in BUYS else (x < 0) if g in SELLS else (abs(x) < 0.05) for x in xs) / len(xs), len(xs), mean(xs) - m_avg))
            res['by_rating'][hname] = {g: ({'avg_return': mean(a[0] for a in v), 'hit_rate': mean(a[1] for a in v), 'avg_names': round(mean(a[2] for a in v)),
                                            'vs_market': mean(a[3] for a in v), 'periods': len(v)} if v else None) for g, v in agg.items()}
            res['by_rating'][hname]['MARKET'] = {'avg_return': mean(mkt), 'periods': len(mkt)} if mkt else None
        # --- daily baskets as index lines
        curves = {g: [100.0] for g in ('BUY', 'HOLD', 'SELL', 'ALL')}
        cdates = [snaps[0]['date']] if snaps else []
        for i in range(len(snaps) - 1):
            step = {}
            for g in curves:
                xs = [px[i + 1][r[0]] / r[4] - 1 for r in snaps[i]['rows'] if r[1] == mk and r[4] and px[i + 1].get(r[0]) and (g == 'ALL' or group(r[3]) == g)]
                step[g] = mean(xs) if xs else 0.0
            for g in curves: curves[g].append(round(curves[g][-1] * (1 + step[g]), 3))
            cdates.append(snaps[i + 1]['date'])
        res['curves'] = {'dates': cdates, **curves}
        # --- setup outcomes (target 1 before stop, within 30 days)
        outc = {'Long': {'target': 0, 'stop': 0, 'open': 0, 'expired': 0}, 'Short': {'target': 0, 'stop': 0, 'open': 0, 'expired': 0}}
        seen = set()
        for i, s in enumerate(snaps):
            for r in s['rows']:
                t, m_, side, entry, stop, t1 = r[0], r[1], r[7], r[8], r[9], r[10]
                if m_ != mk or not side or not entry or (t, side, round(entry, 2)) in seen: continue
                seen.add((t, side, round(entry, 2)))
                triggered, result = False, None
                for k in range(i + 1, len(snaps)):
                    if (dates[k] - dates[i]).days > 30: result = 'expired'; break
                    p = px[k].get(t)
                    if not p: continue
                    if not triggered:
                        triggered = (p >= entry) if side == 'Long' else (p <= entry)
                        if not triggered: continue
                    if (side == 'Long' and p >= t1) or (side == 'Short' and p <= t1): result = 'target'; break
                    if (side == 'Long' and p <= stop) or (side == 'Short' and p >= stop): result = 'stop'; break
                if result is None: result = 'open'
                if result == 'expired' and not triggered: continue  # never triggered = no trade
                outc[side][result] += 1
        for side, o in outc.items():
            done = o['target'] + o['stop']
            o['win_rate'] = o['target'] / done if done else None
        res['setups'] = outc
        # --- LRC Analyst Target hit rate (6 months)
        hit = tot = 0
        for i, s in enumerate(snaps):
            if (dates[-1] - dates[i]).days < 182: continue
            for r in s['rows']:
                if r[1] != mk or not r[5] or not r[4]: continue
                path = [px[k].get(r[0]) for k in range(i + 1, len(snaps)) if (dates[k] - dates[i]).days <= 182]
                path = [p for p in path if p]
                if not path: continue
                tot += 1
                hit += any((p >= r[5]) if r[5] > r[4] else (p <= r[5]) for p in path)
        res['targets'] = {'hit_rate': hit / tot if tot else None, 'evaluated': tot}
        out['markets'][mk] = res
    json.dump(out, open(P('docs', 'data', 'track', 'performance.json'), 'w'), separators=(',', ':'))
    print('track record:', len(snaps), 'snapshots since', out['since'])


if __name__ == '__main__':
    main()
