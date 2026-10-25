"""Yahoo Finance client for the LRC Scanner (stdlib only, runs in GitHub Actions).
Prices: v8 chart API. Fundamentals: v7 quote (batch) + v10 quoteSummary + fundamentals-timeseries (need a cookie + crumb)."""
import json, time, gzip, urllib.request, urllib.parse, http.cookiejar, threading, datetime as dt

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'


class Yahoo:
    def __init__(self):
        self.cj = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cj))
        self.crumb = None
        self.lock = threading.Lock()

    def get(self, url, tries=3, timeout=25):
        err = None
        for k in range(tries):
            try:
                r = self.op.open(urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*', 'Accept-Encoding': 'gzip', 'Accept-Language': 'en-US,en;q=0.9'}), timeout=timeout)
                b = r.read()
                return gzip.decompress(b) if r.headers.get('Content-Encoding') == 'gzip' else b
            except urllib.error.HTTPError as e:
                err = e
                if e.code == 404: break
                time.sleep(1.5 + 2.5 * k)
            except Exception as e:
                err = e; time.sleep(1.5 + 2.5 * k)
        raise err

    def ensure_crumb(self):
        with self.lock:
            if self.crumb: return self.crumb
            try: self.get('https://fc.yahoo.com', tries=1)
            except Exception: pass  # 404 is normal; it still sets the cookie
            self.crumb = self.get('https://query2.finance.yahoo.com/v1/test/getcrumb').decode().strip()
            return self.crumb

    # ---------- prices ----------
    def bars(self, symbol, rng='2y'):
        j = json.loads(self.get(f'https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}?range={rng}&interval=1d&includePrePost=false&events=div'))
        res = j['chart']['result'][0]; q = res['indicators']['quote'][0]; m = res.get('meta', {})
        off = dt.timezone(dt.timedelta(seconds=m.get('gmtoffset', 0)))
        out = []
        for i, t in enumerate(res.get('timestamp') or []):
            c = q['close'][i]
            if c is None: continue
            out.append({'date': dt.datetime.fromtimestamp(t, dt.timezone.utc).astimezone(off).date().isoformat(),
                        'open': q['open'][i] or c, 'high': q['high'][i] or c, 'low': q['low'][i] or c, 'close': c, 'volume': q['volume'][i] or 0})
        rp, rt = m.get('regularMarketPrice'), m.get('regularMarketTime')
        if rp and rt and out:
            rd = dt.datetime.fromtimestamp(rt, dt.timezone.utc).astimezone(off).date().isoformat()
            if rd > out[-1]['date']:
                out.append({'date': rd, 'open': rp, 'high': m.get('regularMarketDayHigh') or rp, 'low': m.get('regularMarketDayLow') or rp, 'close': rp, 'volume': m.get('regularMarketVolume') or 0})
            elif rd == out[-1]['date']:
                out[-1]['close'] = rp
        divs = [{'date': dt.datetime.fromtimestamp(int(k), dt.timezone.utc).date().isoformat(), 'amount': v.get('amount')}
                for k, v in ((res.get('events') or {}).get('dividends') or {}).items()]
        return out, {'currency': m.get('currency'), 'name': m.get('longName') or m.get('shortName'), 'exchange': m.get('fullExchangeName'),
                     'type': m.get('instrumentType'), 'dividends': sorted(divs, key=lambda d: d['date'])}

    # ---------- fundamentals ----------
    def quotes(self, symbols):
        """Batch quote (up to ~100 per call)."""
        out = {}
        for i in range(0, len(symbols), 80):
            chunk = symbols[i:i + 80]
            try:
                j = json.loads(self.get('https://query2.finance.yahoo.com/v7/finance/quote?symbols=' + urllib.parse.quote(','.join(chunk)) + '&crumb=' + urllib.parse.quote(self.ensure_crumb())))
                for x in j['quoteResponse']['result']: out[x['symbol']] = x
            except Exception as e:
                print('  quote batch failed:', repr(e)[:120])
        return out

    def summary(self, symbol):
        mods = 'price,summaryDetail,defaultKeyStatistics,financialData,calendarEvents,recommendationTrend,assetProfile,upgradeDowngradeHistory,earningsTrend,majorHoldersBreakdown'
        j = json.loads(self.get(f'https://query2.finance.yahoo.com/v10/finance/quoteSummary/{urllib.parse.quote(symbol)}?modules={mods}&crumb={urllib.parse.quote(self.ensure_crumb())}'))
        return j['quoteSummary']['result'][0]

    def timeseries(self, symbol):
        types = ['quarterlyTotalRevenue', 'quarterlyNetIncome', 'quarterlyOperatingIncome', 'quarterlyDilutedEPS',
                 'annualTotalRevenue', 'annualNetIncome', 'annualOperatingIncome', 'annualFreeCashFlow', 'annualDilutedEPS']
        u = (f'https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/{urllib.parse.quote(symbol)}?symbol={urllib.parse.quote(symbol)}'
             f'&type={",".join(types)}&period1=1577836800&period2={int(time.time())}&crumb={urllib.parse.quote(self.ensure_crumb())}')
        out = {}
        for x in json.loads(self.get(u))['timeseries']['result']:
            k = x['meta']['type'][0]
            out[k] = [{'date': v['asOfDate'], 'value': (v.get('reportedValue') or {}).get('raw'), 'currency': v.get('currencyCode')} for v in (x.get(k) or []) if v]
        return out


def raw(d, k):
    v = (d or {}).get(k)
    return v.get('raw') if isinstance(v, dict) else v
