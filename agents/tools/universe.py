#!/usr/bin/env python3
"""LRC Scanner universe: as many JSE and New York companies as the data supports, from small caps to mega caps.
  * New York: every US-listed common stock from the Nasdaq stock screener (NYSE, Nasdaq, NYSE American) with a market
    value of at least US_MIN_CAP (default $300m) and a price of $2+, largest first, up to US_MAX (default 2,500).
    Falls back to the stockanalysis.com lists, then to the cached list.
  * JSE: every equity Yahoo Finance lists on the Johannesburg exchange (Yahoo screener, exchange JNB), plus the curated
    list in agents/config/scanner.json (which also supplies clean names and sectors). Falls back to the cached list.
Liquidity is checked later by the scanner (value traded), so thin shares are flagged rather than silently dropped.
Cached in agents/work/universe.json; `python universe.py` prints what it finds."""
import os, re, json, sys, time, urllib.request, urllib.parse

sys.path.insert(0, os.path.dirname(__file__))
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = lambda *a: os.path.join(ROOT, *a)
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
US_MIN_CAP = float(os.environ.get('US_MIN_CAP', '3e8'))
US_MAX = int(os.environ.get('US_MAX', '2500'))
BAD_NAME = re.compile(r'\b(warrant|warrants|right|rights|unit|units|preferred|depositary shares? representing|notes due|debenture|acquisition corp|fund|etf|municipal|closed-end)\b|%', re.I)
JSE_BAD = re.compile(r'\b(ETF|ETN|AMETF|AMC|Exchange Traded|Actively Managed|Feeder|Prescient|Custodial|NewWave|1NVEST|10X|Satrix|CoreShares|Sygnia|EasyETFs?|UBS)\b', re.I)


def http(url, data=None, headers=None, timeout=40):
    h = {'User-Agent': UA, 'Accept': 'application/json, text/plain, */*'}
    h.update(headers or {})
    r = urllib.request.urlopen(urllib.request.Request(url, data=data, headers=h), timeout=timeout)
    return r.read()


def us_nasdaq():
    """Nasdaq screener: all US-listed stocks with market cap. Returns {symbol: name}."""
    out = {}
    for ex in ('nasdaq', 'nyse', 'amex'):
        try:
            j = json.loads(http(f'https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&exchange={ex}&download=true',
                                headers={'Origin': 'https://www.nasdaq.com', 'Referer': 'https://www.nasdaq.com/'}))
            rows = (j.get('data') or {}).get('rows') or []
            for r in rows:
                s = (r.get('symbol') or '').strip().upper().replace('/', '-').replace('^', '')
                name = (r.get('name') or '').strip()
                try: cap = float(r.get('marketCap') or 0)
                except Exception: cap = 0
                try: px = float(str(r.get('lastsale') or '0').replace('$', '').replace(',', ''))
                except Exception: px = 0
                if not re.fullmatch(r'[A-Z]{1,5}(-[A-Z])?', s) or BAD_NAME.search(name): continue
                if cap >= US_MIN_CAP and px >= 2:
                    nm = re.sub(r'\s+(Common Stock|Class [A-C] Common Stock|Ordinary Shares|Common Shares|American Depositary Shares).*$', '', name).strip()
                    out[s] = (nm, cap, (r.get('sector') or '').strip())
            print(f'  nasdaq screener {ex}: {len(rows)} listed')
        except Exception as e:
            print('  nasdaq screener failed', ex, repr(e)[:120])
    ranked = sorted(out.items(), key=lambda kv: -kv[1][1])[:US_MAX]
    return {s: v[0] for s, v in ranked}


def jse_yahoo(y):
    """Yahoo screener, exchange JNB (Johannesburg). Returns {symbol: name}."""
    out = {}
    crumb = y.ensure_crumb()
    for off in range(0, 2000, 250):
        body = json.dumps({'offset': off, 'size': 250, 'sortField': 'intradaymarketcap', 'sortType': 'DESC', 'quoteType': 'EQUITY',
                           'query': {'operator': 'AND', 'operands': [{'operator': 'eq', 'operands': ['exchange', 'JNB']}]}, 'userId': '', 'userIdType': 'guid'}).encode()
        try:
            req = urllib.request.Request(f'https://query2.finance.yahoo.com/v1/finance/screener?crumb={urllib.parse.quote(crumb)}&lang=en-US&region=ZA&formatted=false',
                                         data=body, headers={'User-Agent': UA, 'Content-Type': 'application/json', 'Accept': 'application/json'})
            j = json.loads(y.op.open(req, timeout=40).read())
            q = ((j.get('finance') or {}).get('result') or [{}])[0].get('quotes') or []
        except Exception as e:
            print('  yahoo JNB screener failed at', off, repr(e)[:120]); break
        for x in q:
            s = x.get('symbol') or ''
            nm = x.get('longName') or x.get('shortName') or s
            # ordinary shares only: 3-character JSE codes (preference shares, ETFs, ETNs and notes have longer codes)
            if s.endswith('.JO') and x.get('quoteType') == 'EQUITY' and len(s) == 6 and not JSE_BAD.search(nm):
                out[s] = nm
        if len(q) < 250: break
        time.sleep(1)
    return out


def build(y, cfg):
    import urllib.parse  # noqa (used in jse_yahoo)
    cache = P('agents', 'work', 'universe.json')
    old = {}
    try: old = json.load(open(cache))
    except Exception: pass
    us = us_nasdaq()
    if len(us) < 500:
        print(f'  US screener gave {len(us)}; trying the stockanalysis lists')
        for url in cfg.get('us_lists', []):
            try:
                html = y.get(url).decode('utf-8', 'ignore')
                for sym, name in re.findall(r'href="/stocks/([a-z0-9.\-]+)/"[^>]*>([^<]+)</a>', html):
                    us.setdefault(sym.upper().replace('.', '-'), name.strip())
            except Exception as e: print('  list failed', url, repr(e)[:80])
    if len(us) < 400 and old.get('US'): us = old['US']; print('  using the cached US list')
    jse = {s: n for s, n, sec in cfg['jse']}
    found = jse_yahoo(y)
    for s, n in found.items(): jse.setdefault(s, n)
    if len(found) < 50 and old.get('JSE'):
        for s, n in old['JSE'].items(): jse.setdefault(s, n)
    res = {'US': us, 'JSE': jse, 'counts': {'US': len(us), 'JSE': len(jse), 'jse_screener': len(found)}}
    os.makedirs(os.path.dirname(cache), exist_ok=True)
    json.dump(res, open(cache, 'w'), indent=0)
    print(f'universe: {len(us)} New York, {len(jse)} JSE ({len(found)} from the screener)')
    return res


if __name__ == '__main__':
    import urllib.parse
    from yahoo import Yahoo
    cfg = json.load(open(P('agents', 'config', 'scanner.json')))
    r = build(Yahoo(), cfg)
    print(list(r['US'].items())[:5], list(r['US'].items())[-5:])
    print(sorted(r['JSE'].items())[:400])
