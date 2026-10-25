#!/usr/bin/env python3
"""One-off probe (runs in GitHub Actions): which free data sources answer from GitHub's servers."""
import sys, os, json, re, time, urllib.request, http.cookiejar, gzip
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
cj = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
def get(u, h=None):
    r = op.open(urllib.request.Request(u, headers={'User-Agent': UA, 'Accept': '*/*', 'Accept-Encoding': 'gzip', **(h or {})}), timeout=25)
    b = r.read(); b = gzip.decompress(b) if r.headers.get('Content-Encoding') == 'gzip' else b
    return r.status, b
def t(name, f):
    try: print('OK  ', name, '|', str(f())[:600])
    except Exception as e: print('FAIL', name, '|', repr(e)[:300])
for s in ['AAPL', 'NPN.JO', 'STX40.JO', 'STXRES.JO', 'XLK', 'GLD.JO', 'BHG.JO', 'J203.JO', '^J203.JO']:
    t('chart ' + s, lambda s=s: (lambda j: (j['chart']['result'][0]['meta'].get('longName') or j['chart']['result'][0]['meta'].get('shortName'), j['chart']['result'][0]['meta'].get('currency'), len(j['chart']['result'][0]['timestamp'])))(json.loads(get(f'https://query1.finance.yahoo.com/v8/finance/chart/{s}?range=1y&interval=1d')[1])))
try:
    try: get('https://fc.yahoo.com')
    except Exception as e: print('fc.yahoo (expected 404):', repr(e)[:80])
    crumb = get('https://query2.finance.yahoo.com/v1/test/getcrumb')[1].decode(); print('crumb', crumb)
    mods = 'price,summaryDetail,defaultKeyStatistics,financialData,calendarEvents,recommendationTrend,assetProfile,earningsTrend,institutionOwnership,upgradeDowngradeHistory'
    for s in ['AAPL', 'NPN.JO', 'SBK.JO', 'XLK', 'STX40.JO']:
        def q(s=s):
            j = json.loads(get(f'https://query2.finance.yahoo.com/v10/finance/quoteSummary/{s}?modules={mods}&crumb={crumb}')[1])['quoteSummary']['result'][0]
            fd, ks, sd, ap = j.get('financialData', {}), j.get('defaultKeyStatistics', {}), j.get('summaryDetail', {}), j.get('assetProfile', {})
            g = lambda d, k: (d.get(k) or {}).get('raw') if isinstance(d.get(k), dict) else d.get(k)
            return {'keys': list(j), 'sector': ap.get('sector'), 'industry': ap.get('industry'), 'fpe': g(sd, 'forwardPE'), 'tpe': g(sd, 'trailingPE'), 'ps': g(sd, 'priceToSalesTrailing12Months'),
                    'revg': g(fd, 'revenueGrowth'), 'epsg': g(fd, 'earningsGrowth'), 'de': g(fd, 'debtToEquity'), 'roe': g(fd, 'returnOnEquity'), 'fcf': g(fd, 'freeCashflow'),
                    'tgt': g(fd, 'targetMeanPrice'), 'tgtmed': g(fd, 'targetMedianPrice'), 'rec': g(fd, 'recommendationMean'), 'mcap': g(sd, 'marketCap'), 'short': g(ks, 'shortPercentOfFloat'),
                    'inst': g(ks, 'heldPercentInstitutions'), 'peg': g(ks, 'pegRatio'), 'beta': g(sd, 'beta'), 'dy': g(sd, 'dividendYield'),
                    'earn': j.get('calendarEvents', {}).get('earnings', {}).get('earningsDate'), 'ud': len((j.get('upgradeDowngradeHistory') or {}).get('history', []))}
        t('quoteSummary ' + s, q)
    t('timeseries AAPL', lambda: [ (x['meta']['type'], len(x.get(x['meta']['type'][0], []) or [])) for x in json.loads(get(f'https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/AAPL?symbol=AAPL&type=quarterlyTotalRevenue,quarterlyNetIncome,annualTotalRevenue,annualNetIncome,annualFreeCashFlow,quarterlyDilutedEPS&period1=1600000000&period2={int(time.time())}&crumb={crumb}')[1])['timeseries']['result']])
    t('timeseries NPN.JO', lambda: [ (x['meta']['type'], len(x.get(x['meta']['type'][0], []) or [])) for x in json.loads(get(f'https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/NPN.JO?symbol=NPN.JO&type=quarterlyTotalRevenue,annualTotalRevenue,annualNetIncome&period1=1600000000&period2={int(time.time())}&crumb={crumb}')[1])['timeseries']['result']])
    t('screener sp500? quote batch', lambda: [ (x['symbol'], x.get('marketCap'), x.get('forwardPE')) for x in json.loads(get(f'https://query2.finance.yahoo.com/v7/finance/quote?symbols=AAPL,MSFT,NPN.JO,SBK.JO&crumb={crumb}')[1])['quoteResponse']['result']])
except Exception as e:
    print('FAIL crumb flow', repr(e))
t('wikipedia sp500', lambda: len(re.findall(r'<td><a[^>]*class="external text"[^>]*>([A-Z.\-]+)</a>', get('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies')[1].decode())))
t('wikipedia nasdaq100', lambda: get('https://en.wikipedia.org/wiki/Nasdaq-100')[1][:10])
t('stockanalysis sp500', lambda: get('https://stockanalysis.com/list/sp-500-stocks/')[0])
t('finviz', lambda: get('https://finviz.com/quote.ashx?t=AAPL')[0])
t('sharenet', lambda: get('https://www.sharenet.co.za/')[0])
