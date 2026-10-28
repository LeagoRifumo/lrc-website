#!/usr/bin/env python3
"""LRC financial statements (runs after every scanner run).
Income statement, balance sheet and cash flow, annual (5+ years) and quarterly, for every company in the LRC Stock Scanner.
  * Yahoo Finance fundamentals-timeseries: full statements, JSE and New York (annual ~4-5 years, quarterly ~5-8 quarters).
  * SEC EDGAR companyfacts (official 10-K filings): New York companies, adds older years for the headline lines so there are at least 5 years.
Writes docs/data/fs/<TICKER>.json. Refreshed in rotation (oldest first), so each company is refreshed about once a week.
--probe SYM,SYM prints what the sources return without writing."""
import os, sys, json, time, argparse, datetime as dt, urllib.parse
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(__file__))
from yahoo import Yahoo
import sec_quarters as SECQ

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = lambda *a: os.path.join(ROOT, *a)
OUT = P('docs', 'data', 'fs')

# (key, label, statement, yahoo type, kind) kind: m = money, e = per share, s = share count
LINES = [
    ('rev', 'Revenue', 'is', 'TotalRevenue', 'm'),
    ('cogs', 'Cost of revenue', 'is', 'CostOfRevenue', 'm'),
    ('gp', 'Gross profit', 'is', 'GrossProfit', 'm'),
    ('sga', 'Selling, general & admin', 'is', 'SellingGeneralAndAdministration', 'm'),
    ('rnd', 'Research & development', 'is', 'ResearchAndDevelopment', 'm'),
    ('opex', 'Total operating expenses', 'is', 'OperatingExpense', 'm'),
    ('nii', 'Net interest income (banks)', 'is', 'NetInterestIncome', 'm'),
    ('op', 'Operating income', 'is', 'OperatingIncome', 'm'),
    ('intexp', 'Interest expense', 'is', 'InterestExpense', 'm'),
    ('pti', 'Profit before tax', 'is', 'PretaxIncome', 'm'),
    ('tax', 'Tax', 'is', 'TaxProvision', 'm'),
    ('ni', 'Net income (to shareholders)', 'is', 'NetIncomeCommonStockholders', 'm'),
    ('ebitda', 'EBITDA', 'is', 'EBITDA', 'm'),
    ('eps', 'EPS (diluted)', 'is', 'DilutedEPS', 'e'),
    ('eps_b', 'EPS (basic)', 'is', 'BasicEPS', 'e'),
    ('shares', 'Diluted shares', 'is', 'DilutedAverageShares', 's'),
    ('cash', 'Cash & short-term investments', 'bs', 'CashCashEquivalentsAndShortTermInvestments', 'm'),
    ('recv', 'Receivables', 'bs', 'AccountsReceivable', 'm'),
    ('inv', 'Inventory', 'bs', 'Inventory', 'm'),
    ('ca', 'Total current assets', 'bs', 'CurrentAssets', 'm'),
    ('ppe', 'Property, plant & equipment', 'bs', 'NetPPE', 'm'),
    ('gw', 'Goodwill & intangibles', 'bs', 'GoodwillAndOtherIntangibleAssets', 'm'),
    ('ta', 'Total assets', 'bs', 'TotalAssets', 'm'),
    ('ap', 'Payables', 'bs', 'AccountsPayable', 'm'),
    ('cl', 'Total current liabilities', 'bs', 'CurrentLiabilities', 'm'),
    ('std', 'Short-term debt', 'bs', 'CurrentDebt', 'm'),
    ('ltd', 'Long-term debt', 'bs', 'LongTermDebt', 'm'),
    ('debt', 'Total debt', 'bs', 'TotalDebt', 'm'),
    ('tl', 'Total liabilities', 'bs', 'TotalLiabilitiesNetMinorityInterest', 'm'),
    ('eq', "Shareholders' equity", 'bs', 'StockholdersEquity', 'm'),
    ('netdebt', 'Net debt', 'bs', 'NetDebt', 'm'),
    ('wc', 'Working capital', 'bs', 'WorkingCapital', 'm'),
    ('tbv', 'Tangible book value', 'bs', 'TangibleBookValue', 'm'),
    ('so', 'Shares in issue', 'bs', 'OrdinarySharesNumber', 's'),
    ('cfo', 'Cash from operations', 'cf', 'OperatingCashFlow', 'm'),
    ('capex', 'Capital expenditure', 'cf', 'CapitalExpenditure', 'm'),
    ('fcf', 'Free cash flow', 'cf', 'FreeCashFlow', 'm'),
    ('da', 'Depreciation & amortisation', 'cf', 'DepreciationAndAmortization', 'm'),
    ('sbc', 'Share-based pay', 'cf', 'StockBasedCompensation', 'm'),
    ('cfi', 'Cash from investing', 'cf', 'InvestingCashFlow', 'm'),
    ('cff', 'Cash from financing', 'cf', 'FinancingCashFlow', 'm'),
    ('div', 'Dividends paid', 'cf', 'CashDividendsPaid', 'm'),
    ('buyback', 'Share buybacks', 'cf', 'RepurchaseOfCapitalStock', 'm'),
    ('debt_in', 'Debt raised', 'cf', 'IssuanceOfDebt', 'm'),
    ('debt_out', 'Debt repaid', 'cf', 'RepaymentOfDebt', 'm'),
    ('chg_cash', 'Change in cash', 'cf', 'ChangesInCash', 'm'),
]
# SEC 10-K headline lines (older years for New York companies). flow = duration item, inst = balance-sheet item
SEC_TAGS = {
    'rev': (['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenuesNetOfInterestExpense'], 'flow', 1),
    'gp': (['GrossProfit'], 'flow', 1),
    'op': (['OperatingIncomeLoss'], 'flow', 1),
    'pti': (['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments'], 'flow', 1),
    'ni': (['NetIncomeLossAvailableToCommonStockholdersBasic', 'NetIncomeLoss'], 'flow', 1),
    'eps': (['EarningsPerShareDiluted'], 'flow', 1),
    'ta': (['Assets'], 'inst', 1),
    'tl': (['Liabilities'], 'inst', 1),
    'eq': (['StockholdersEquity'], 'inst', 1),
    'ca': (['AssetsCurrent'], 'inst', 1),
    'cl': (['LiabilitiesCurrent'], 'inst', 1),
    'cash': (['CashAndCashEquivalentsAtCarryingValue'], 'inst', 1),
    'ltd': (['LongTermDebtNoncurrent'], 'inst', 1),
    'cfo': (['NetCashProvidedByUsedInOperatingActivities'], 'flow', 1),
    'capex': (['PaymentsToAcquirePropertyPlantAndEquipment'], 'flow', -1),
    'div': (['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends'], 'flow', -1),
    'buyback': (['PaymentsForRepurchaseOfCommonStock'], 'flow', -1),
}


def load(p, d=None):
    try: return json.load(open(p, encoding='utf-8'))
    except Exception: return d


def yahoo_fs(y, sym):
    types = [pre + l[3] for pre in ('annual', 'quarterly') for l in LINES]
    out = {}
    for i in range(0, len(types), 24):
        chunk = types[i:i + 24]
        u = (f'https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/{urllib.parse.quote(sym)}?symbol={urllib.parse.quote(sym)}'
             f'&type={",".join(chunk)}&period1=1262304000&period2={int(time.time())}&crumb={urllib.parse.quote(y.ensure_crumb())}')
        for x in json.loads(y.get(u))['timeseries']['result']:
            k = x['meta']['type'][0]
            vals = [v for v in (x.get(k) or []) if v and (v.get('reportedValue') or {}).get('raw') is not None]
            if vals: out[k] = [(v['asOfDate'], v['reportedValue']['raw'], v.get('currencyCode')) for v in vals]
    return out


def sec_annual(cik):
    j = SECQ._get(f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json')
    g = (j.get('facts') or {}).get('us-gaap') or {}
    res = {}
    for key, (tags, kind, sign) in SEC_TAGS.items():
        best = None
        for tag in tags:
            units = (g.get(tag) or {}).get('units') or {}
            rows = units.get('USD') or units.get('USD/shares') or []
            vals = {}
            for r in sorted(rows, key=lambda r: r.get('filed', '')):
                if r.get('form') not in ('10-K', '10-K/A') or r.get('fp') not in ('FY', None): continue
                if kind == 'flow':
                    if 'start' not in r: continue
                    d = (dt.date.fromisoformat(r['end']) - dt.date.fromisoformat(r['start'])).days
                    if not 350 <= d <= 380: continue
                vals[r['end']] = r['val'] * sign
            if vals and (not best or max(vals) > max(best) or len(vals) > len(best)): best = vals
        if best: res[key] = best
    return res


def build(sym, ys, sec):
    """Merge into {cur, annual: {dates, rows}, quarterly: {dates, rows}}."""
    out = {'t': sym, 'updated': dt.date.today().isoformat(), 'cur': None, 'src': ['Yahoo Finance financial statements']}
    curs = {}
    for per in ('annual', 'quarterly'):
        table = {}
        for key, label, st, yt, kind in LINES:
            for d, v, c in ys.get(per + yt, []):
                table.setdefault(key, {})[d] = v
                if kind == 'm' and c: curs[c] = curs.get(c, 0) + 1
        if per == 'annual' and sec:
            yd = sorted({d for r in table.values() for d in r})
            added = False
            for key, vals in sec.items():
                for end, v in vals.items():
                    # only fill fiscal years Yahoo doesn't have (no Yahoo date within 20 days)
                    if any(abs((dt.date.fromisoformat(end) - dt.date.fromisoformat(x)).days) <= 20 for x in yd):
                        if key not in table or not any(abs((dt.date.fromisoformat(end) - dt.date.fromisoformat(x)).days) <= 20 for x in table[key]):
                            near = min(yd, key=lambda x: abs((dt.date.fromisoformat(end) - dt.date.fromisoformat(x)).days))
                            table.setdefault(key, {})[near] = v; added = True
                        continue
                    table.setdefault(key, {})[end] = v; added = True
            if added: out['src'].append('SEC EDGAR 10-K filings (older years)')
        dates = sorted({d for r in table.values() for d in r})
        keep = 10 if per == 'annual' else 8
        # drop date columns that only have one or two lines (stray restatements)
        dates = [d for d in dates if sum(1 for r in table.values() if d in r) >= 3][-keep:]
        rows = {k: [table[k].get(d) for d in dates] for k in table if any(table[k].get(d) is not None for d in dates)}
        out[per] = {'dates': dates, 'rows': rows}
    out['cur'] = max(curs, key=curs.get) if curs else None
    out['lines'] = [[k, l, st, kind] for k, l, st, yt, kind in LINES]
    return out


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--probe', default=''); ap.add_argument('--per-run', type=int, default=int(os.environ.get('FS_PER_RUN', '180')))
    a = ap.parse_args()
    y = Yahoo()
    if a.probe:
        ciks = SECQ.cik_map()
        for s in a.probe.split(','):
            ys = yahoo_fs(y, s)
            for k in sorted(ys): print(s, k, len(ys[k]), ys[k][0][0], '..', ys[k][-1][0], ys[k][-1][1], ys[k][-1][2])
            sec = sec_annual(ciks[s]) if s in ciks else None
            if sec:
                for k, v in sec.items(): print(s, 'SEC', k, len(v), min(v), max(v))
            o = build(s, ys, sec)
            print(s, 'cur', o['cur'], 'annual', o['annual']['dates'], 'quarterly', o['quarterly']['dates'], 'src', o['src'])
        return
    sc = load(P('docs', 'data', 'scan', 'stocks.json'), {}) or {}
    uni = [(r['t'], r['m']) for r in sc.get('rows', [])]
    os.makedirs(OUT, exist_ok=True)
    age = {}
    for t, m in uni:
        o = load(os.path.join(OUT, t + '.json'))
        age[t] = (o or {}).get('updated') or ''
    week = (dt.date.today() - dt.timedelta(days=6)).isoformat()
    need = sorted([x for x in uni if age[x[0]] < week], key=lambda x: age[x[0]])[:a.per_run]
    try: ciks = SECQ.cik_map()
    except Exception as e: ciks = {}; print('SEC tickers failed', e)

    def job(x):
        t, m = x
        try:
            ys = yahoo_fs(y, t)
        except Exception as e:
            return t, 'yahoo ' + repr(e)[:80]
        sec = None
        if m == 'US' and t in ciks:
            try: sec = sec_annual(ciks[t])
            except Exception as e: sec = None
        if not ys and not sec: return t, 'no data'
        o = build(t, ys, sec)
        json.dump(o, open(os.path.join(OUT, t + '.json'), 'w'), separators=(',', ':'))
        return t, None
    t0 = time.time()
    with ThreadPoolExecutor(6) as ex: res = list(ex.map(job, need))
    bad = [(t, e) for t, e in res if e]
    print(f'statements: {len(need) - len(bad)}/{len(need)} refreshed in {time.time() - t0:.0f}s; {len(uni)} companies; failed {bad[:10]}')


if __name__ == '__main__':
    main()
