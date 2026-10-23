#!/usr/bin/env python3
"""Writes this week's watchlist into the LRC Watchlist workbook (templates/LRC_Watchlist_master.xlsx)
and saves a dated copy in reports/. Uses LibreOffice (UNO) so the workbook's formulas, formats and
dropdowns survive — never round-trip LRC workbooks through openpyxl.

Usage: python3 agents/tools/update_watchlist_xlsx.py [account_size]
Needs: docs/data/watchlist.json (from build_watchlist.py) and agents/work/snapshot.json
"""
import uno, time, subprocess, datetime as dt, json, os, sys, shutil
from com.sun.star.beans import PropertyValue
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = lambda *a: os.path.join(ROOT, *a)
SECT = {'Technology': 'Technology', 'Communication Services': 'Telecommunications', 'Consumer Cyclical': 'Consumer Discretionary',
        'Consumer Discretionary': 'Consumer Discretionary', 'Industrials': 'Industrials', 'Financials': 'Financials', 'Financial Services': 'Financials',
        'Healthcare': 'Health Care', 'Health Care': 'Health Care', 'Energy': 'Energy', 'Basic Materials': 'Basic Materials', 'Utilities': 'Utilities',
        'Real Estate': 'Real Estate', 'Consumer Staples': 'Consumer Staples', 'Consumer Defensive': 'Consumer Staples'}

def pv(n, v):
    x = PropertyValue(); x.Name = n; x.Value = v; return x

def main(account=None):
    wl = json.load(open(P('docs', 'data', 'watchlist.json')))
    snap = {x['ticker']: x for x in json.load(open(P('agents', 'work', 'snapshot.json')))}
    week = dt.date.fromisoformat(wl['week_ending'])
    port = 2700
    p = subprocess.Popen(['soffice', '--headless', '--invisible', '--norestore', f'--accept=socket,host=localhost,port={port};urp;'])
    time.sleep(6)
    lc = uno.getComponentContext(); res = lc.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', lc)
    for _ in range(30):
        try: ctx = res.resolve(f'uno:socket,host=localhost,port={port};urp;StarOffice.ComponentContext'); break
        except Exception: time.sleep(1)
    desk = ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)
    base = dt.date(1899, 12, 30)
    def put(sh, a, v):
        c = sh.getCellRangeByName(a)
        if v is None or v == '': c.setString(''); return
        if isinstance(v, dt.date): c.setValue((v - base).days)
        elif isinstance(v, (int, float)): c.setValue(float(v))
        else: c.setString(str(v))
    def get(sh, a):
        c = sh.getCellRangeByName(a)
        return c.getValue() if c.getType().value == 'VALUE' or (c.getType().value == 'FORMULA' and c.FormulaResultType2 == 1) else c.getString()
    master = P('templates', 'LRC_Watchlist_master.xlsx')
    doc = desk.loadComponentFromURL('file://' + master, '_blank', 0, (pv('Hidden', True),))
    S = doc.Sheets; sw = S.getByName('Swing Watchlist')
    put(sw, 'C4', week)
    if account: put(sw, 'C6', float(account))
    # remove rows already written for this week (re-runs are safe), then append after the last used row
    last = 10
    for r in range(11, 211):
        if get(sw, f'C{r}'): last = r
    for r in range(11, last + 1):
        a = sw.getCellRangeByName(f'A{r}')
        if a.getType().value == 'VALUE' and int(a.getValue()) == (week - base).days:
            for c in 'ABCDEFGHIKLMNOPQRSTUVWXYZ': put(sw, f'{c}{r}', None)
            for c in ['AA', 'AP', 'AV']: put(sw, f'{c}{r}', None)
    last = 10
    for r in range(11, 211):
        if get(sw, f'C{r}'): last = r
    row = last + 1
    for s in wl['swing']:
        if row > 210: break
        x = snap.get(s['ticker'], {}); pr = x.get('price')
        vals = {'A': week, 'B': 'US', 'C': s['ticker'], 'D': s['name'], 'E': SECT.get(x.get('sector', ''), 'Technology'), 'F': s['direction'], 'G': pr,
                'H': round(x.get('mcap_bn', 0), 2) if x.get('mcap_bn') else None, 'I': round(x.get('avg_volume', 0)),
                'K': round(pr / x['sma20'] - 1, 4) if pr and x.get('sma20') else None, 'L': round(pr / x['sma50'] - 1, 4) if pr and x.get('sma50') else None,
                'M': round(pr / x['sma200'] - 1, 4) if pr and x.get('sma200') else None, 'N': x.get('rsi'), 'O': x.get('perf_quarter'), 'P': x.get('perf_half'),
                'Q': round(pr / x['hi52'] - 1, 4) if pr and x.get('hi52') else None, 'R': round(pr / x['lo52'] - 1, 4) if pr and x.get('lo52') else None,
                'S': x.get('rel_volume'), 'T': x.get('eps_growth'), 'U': x.get('short_float'),
                'V': dt.date.fromisoformat(x['next_earnings']) if x.get('next_earnings') else None, 'W': x.get('atr14'),
                'X': ('LONG: ' if s['direction'] == 'Long' else 'SHORT: ') + s['setup'], 'Y': s['entry'], 'Z': s['stop'], 'AA': s['target'],
                'AP': 'Entry setup' if s['status'] == 'Entry setup' else 'Watch',
                'AV': f"Agent {wl['generated']}: LRC rating {s['rating']} (6-m value {s['rating_target']}); {s['tech_clearance']}. Entry {s['entry']}, stop {s['stop']} (2×ATR), target {s['target']} (3R). {s.get('note','')} — LRC Watchlist Agent"}
        for c, v in vals.items(): put(sw, f'{c}{row}', v)
        row += 1
    # weekly review log
    wr = S.getByName('Weekly Review')
    r = 17
    while get(wr, f'A{r}') and r < 68:
        if wr.getCellRangeByName(f'A{r}').getValue() == (week - base).days: break
        r += 1
    put(wr, f'A{r}', week); put(wr, f'G{r}', 0)
    put(wr, f'I{r}', f"Built by the LRC Watchlist Agent {wl['generated']}: {sum(1 for s in wl['swing'] if s['direction']=='Long')} long / "
                     f"{sum(1 for s in wl['swing'] if s['direction']=='Short')} short candidates under house rules. Analyst to review before any trade.")
    doc.calculateAll()
    out = P('reports', f"LRC_Watchlist_{week.isoformat()}.xlsx")
    doc.storeToURL('file://' + out, (pv('FilterName', 'Calc MS Excel 2007 XML'),))
    doc.storeToURL('file://' + master, (pv('FilterName', 'Calc MS Excel 2007 XML'),))
    doc.close(True)
    try: p.terminate()
    except Exception: pass
    print('saved', out)
    os._exit(0)

if __name__ == '__main__':
    main(*(sys.argv[1:2]))
