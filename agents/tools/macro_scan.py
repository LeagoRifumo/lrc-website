#!/usr/bin/env python3
"""LRC Forex & Commodities scan — scores every major currency pair, the rand crosses and the main commodities
with the same technical method the Scanner uses for ETFs (trend, momentum, setup ±2; stretch, volume ±1; max 8),
and writes the setup and LRC entry plan (stop max 3 ATR, targets 2R / 3R).

Output: docs/data/scan/macro_assets.json  (read by the Screening Analyst for the Forex and Commodities scoreboards)
Runs in GitHub Actions (stdlib only): .github/workflows/macro-scan.yml
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
from lrcdata import P, daily_bars, now_sast, save_if_changed
import scan_engine as E

# code (as used on the LRC desks), Yahoo symbol, name, class, group, unit
ASSETS = [
    ('USD/ZAR', 'ZAR=X', 'US dollar / rand', 'fx', 'Rand', 'ZAR per USD'),
    ('EUR/ZAR', 'EURZAR=X', 'Euro / rand', 'fx', 'Rand', 'ZAR per EUR'),
    ('GBP/ZAR', 'GBPZAR=X', 'Pound / rand', 'fx', 'Rand', 'ZAR per GBP'),
    ('EUR/USD', 'EURUSD=X', 'Euro / US dollar', 'fx', 'Majors', 'USD per EUR'),
    ('GBP/USD', 'GBPUSD=X', 'Pound / US dollar', 'fx', 'Majors', 'USD per GBP'),
    ('USD/JPY', 'JPY=X', 'US dollar / yen', 'fx', 'Majors', 'JPY per USD'),
    ('USD/CHF', 'CHF=X', 'US dollar / Swiss franc', 'fx', 'Majors', 'CHF per USD'),
    ('AUD/USD', 'AUDUSD=X', 'Australian dollar / US dollar', 'fx', 'Majors', 'USD per AUD'),
    ('NZD/USD', 'NZDUSD=X', 'NZ dollar / US dollar', 'fx', 'Majors', 'USD per NZD'),
    ('USD/CAD', 'CAD=X', 'US dollar / Canadian dollar', 'fx', 'Majors', 'CAD per USD'),
    ('EUR/GBP', 'EURGBP=X', 'Euro / pound', 'fx', 'Crosses', 'GBP per EUR'),
    ('EUR/JPY', 'EURJPY=X', 'Euro / yen', 'fx', 'Crosses', 'JPY per EUR'),
    ('GBP/JPY', 'GBPJPY=X', 'Pound / yen', 'fx', 'Crosses', 'JPY per GBP'),
    ('DXY', 'DX-Y.NYB', 'US dollar index', 'fx', 'Dollar', 'index'),
    ('XAU/USD', 'GC=F', 'Gold', 'cm', 'Precious metals', 'USD/oz'),
    ('XAG/USD', 'SI=F', 'Silver', 'cm', 'Precious metals', 'USD/oz'),
    ('XPT/USD', 'PL=F', 'Platinum', 'cm', 'Precious metals', 'USD/oz'),
    ('XPD/USD', 'PA=F', 'Palladium', 'cm', 'Precious metals', 'USD/oz'),
    ('COPPER', 'HG=F', 'Copper', 'cm', 'Industrial metals', 'USD/lb'),
    ('BRENT', 'BZ=F', 'Brent crude', 'cm', 'Energy', 'USD/bbl'),
    ('WTI', 'CL=F', 'WTI crude', 'cm', 'Energy', 'USD/bbl'),
    ('NATGAS', 'NG=F', 'Natural gas (Henry Hub)', 'cm', 'Energy', 'USD/MMBtu'),
    ('WHEAT', 'ZW=F', 'Wheat (CBOT)', 'cm', 'Agriculture', 'US cents/bu'),
    ('CORN', 'ZC=F', 'Corn (CBOT)', 'cm', 'Agriculture', 'US cents/bu'),
    ('SOYBEANS', 'ZS=F', 'Soybeans (CBOT)', 'cm', 'Agriculture', 'US cents/bu'),
    ('COFFEE', 'KC=F', 'Coffee (arabica)', 'cm', 'Softs', 'US cents/lb'),
    ('SUGAR', 'SB=F', 'Sugar No. 11', 'cm', 'Softs', 'US cents/lb'),
    ('COCOA', 'CC=F', 'Cocoa', 'cm', 'Softs', 'USD/t'),
]


def main():
    rows, missing = [], []
    for code, sym, name, cls, grp, unit in ASSETS:
        try:
            bars = daily_bars(sym)
            t = E.technicals(bars)
            if not t: raise RuntimeError('too little history')
        except Exception as e:
            missing.append({'code': code, 'symbol': sym, 'why': repr(e)[:120]}); print('  skip', code, repr(e)[:80]); continue
        sc = E.tech_scores(t)
        if cls == 'fx': sc['volume'] = 0  # spot FX has no real volume
        pts = sum(sc.values()); score = round(50 + 50 * pts / 8)
        pl = E.plan(bars, t)
        rows.append({'code': code, 'sym': sym, 'n': name, 'cls': cls, 'g': grp, 'unit': unit, 'date': t['date'], 'px': t['price'],
                     'chg': t['chg_1d'], 'p1w': t['perf_1w'], 'p1m': t['perf_1m'], 'p3m': t['perf_3m'], 'p6m': t['perf_6m'], 'ytd': t['perf_ytd'],
                     'rsi': t['rsi'], 'atr': t['atr'], 'sma20': t['sma20'], 'sma50': t['sma50'], 'sma200': t['sma200'],
                     'hi52': t['hi52'], 'lo52': t['lo52'], 'tp': sc, 'pts': pts, 'max': 8, 'score': score, 'v': E.rating_v7(score),
                     'bias': 'Bull' if score >= 60 else 'Bear' if score <= 40 else 'Neutral',
                     'setup': t.get('setup'), 'lvl': t.get('setup_level'),
                     'plan': {k: pl[k] for k in ('side', 'how', 'entry', 'stop', 't1', 't2', 'risk_pct')} if pl else None,
                     'sup': next((l['price'] for l in t.get('supports', []) if l['price'] < t['price']), None),
                     'res': next((l['price'] for l in t.get('resistances', []) if l['price'] > t['price']), None)})
    rows.sort(key=lambda r: (-r['score'], -(r['p1m'] or 0)))
    for cls in ('fx', 'cm'):
        for i, r in enumerate([r for r in rows if r['cls'] == cls]): r['rank'] = i + 1
    out = {'generated': now_sast().strftime('%Y-%m-%dT%H:%M+02:00'), 'agent': 'LRC Forex & Commodities scan',
           'source': 'Yahoo Finance daily prices (futures front month for commodities); LRC technical rules',
           'method': 'Same points as the LRC Scanner for ETFs: trend, momentum and setup ±2, stretch and volume ±1 (max 8). Score 50 = neutral. Bull 60+, Bear 40 or less.',
           'rows': rows, 'missing': missing}
    def rnd(o):
        if isinstance(o, float): return round(o, 6)
        if isinstance(o, list): return [rnd(x) for x in o]
        if isinstance(o, dict): return {k: rnd(v) for k, v in o.items()}
        return o
    out = rnd(out)
    save_if_changed(P('docs', 'data', 'scan', 'macro_assets.json'), out)
    print(f"done: {len(rows)} assets, {len(missing)} missing")


if __name__ == '__main__':
    main()
