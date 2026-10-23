"""Shared helpers for the LRC automation scripts (stdlib only, so GitHub Actions needs no installs)."""
import json, os, time, urllib.request, urllib.parse, csv, io, datetime as dt, gzip

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = lambda *a: os.path.join(ROOT, *a)
SAST = dt.timezone(dt.timedelta(hours=2))
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

def now_sast():
    return dt.datetime.now(SAST)

def http(url, timeout=25, headers=None, tries=2):
    h = {'User-Agent': UA, 'Accept': '*/*', 'Accept-Language': 'en-US,en;q=0.9', 'Accept-Encoding': 'gzip'}
    h.update(headers or {})
    err = None
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=timeout) as r:
                b = r.read()
                if r.headers.get('Content-Encoding') == 'gzip': b = gzip.decompress(b)
                return b
        except Exception as e:
            err = e; time.sleep(2 + 3 * k)
    raise err

def load(path, default=None):
    try: return json.load(open(path, encoding='utf-8'))
    except Exception: return default

def save_if_changed(path, obj, ignore=('generated',)):
    """Write JSON only when the content (ignoring timestamps) changed. Returns True if written."""
    old = load(path)
    strip = lambda o: {k: v for k, v in o.items() if k not in ignore} if isinstance(o, dict) else o
    if old is not None and strip(old) == strip(obj): return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(obj, open(path, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    return True

def daily_bars(symbol, rng='2y'):
    """Daily OHLCV from Yahoo Finance chart API; falls back to Stooq for plain US tickers.
    Returns list of dicts {date, open, high, low, close, volume} oldest -> newest (no missing closes)."""
    for host in ('query1', 'query2'):
        try:
            j = json.loads(http(f'https://{host}.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}?range={rng}&interval=1d&includePrePost=false'))
            res = j['chart']['result'][0]; q = res['indicators']['quote'][0]
            out = []
            for i, t in enumerate(res['timestamp']):
                c = q['close'][i]
                if c is None: continue
                out.append({'date': dt.datetime.fromtimestamp(t, dt.timezone.utc).astimezone(dt.timezone(dt.timedelta(seconds=res['meta'].get('gmtoffset', 0)))).date().isoformat(),
                            'open': q['open'][i] or c, 'high': q['high'][i] or c, 'low': q['low'][i] or c, 'close': c, 'volume': q['volume'][i] or 0})
            m = res.get('meta', {})
            rp, rt = m.get('regularMarketPrice'), m.get('regularMarketTime')
            if rp and rt and out:  # Yahoo often leaves the latest session's close empty in the arrays — take it from meta
                rd = dt.datetime.fromtimestamp(rt, dt.timezone.utc).astimezone(dt.timezone(dt.timedelta(seconds=m.get('gmtoffset', 0)))).date().isoformat()
                if rd > out[-1]['date']:
                    out.append({'date': rd, 'open': rp, 'high': m.get('regularMarketDayHigh') or rp, 'low': m.get('regularMarketDayLow') or rp, 'close': rp, 'volume': m.get('regularMarketVolume') or 0})
                elif rd == out[-1]['date']:
                    out[-1]['close'] = rp
            if len(out) > 30: return out
        except Exception as e:
            last = e
    if symbol.replace('-', '').replace('.', '').isalpha() and symbol.isupper():
        txt = http(f'https://stooq.com/q/d/l/?s={symbol.lower().replace(".", "-")}.us&i=d').decode()
        rows = list(csv.DictReader(io.StringIO(txt)))
        out = [{'date': r['Date'], 'open': float(r['Open']), 'high': float(r['High']), 'low': float(r['Low']), 'close': float(r['Close']), 'volume': float(r.get('Volume') or 0)} for r in rows if r.get('Close')]
        if len(out) > 30: return out[-520:]
    raise RuntimeError(f'no data for {symbol}')

def sma(xs, n):
    return sum(xs[-n:]) / n if len(xs) >= n else None

def rsi_wilder(closes, n=14):
    if len(closes) <= n: return None
    g = l = 0.0
    for i in range(1, n + 1):
        d = closes[i] - closes[i - 1]; g += max(d, 0); l += max(-d, 0)
    g /= n; l /= n
    for i in range(n + 1, len(closes)):
        d = closes[i] - closes[i - 1]; g = (g * (n - 1) + max(d, 0)) / n; l = (l * (n - 1) + max(-d, 0)) / n
    return 100.0 if l == 0 else 100 - 100 / (1 + g / l)

def atr_wilder(bars, n=14):
    if len(bars) <= n: return None
    tr = [max(b['high'] - b['low'], abs(b['high'] - p['close']), abs(b['low'] - p['close'])) for p, b in zip(bars, bars[1:])]
    a = sum(tr[:n]) / n
    for x in tr[n:]: a = (a * (n - 1) + x) / n
    return a
