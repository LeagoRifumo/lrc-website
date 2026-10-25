"""LRC Scanner engine — pure functions (no network), so it can be tested offline.

TECHNICALS (daily bars)
  Trend     -2..+2  price vs 50/200-day averages and the slope of the 200-day
  Momentum  -2..+2  6-month relative strength vs the market benchmark + RSI(14)
  Setup     -2..+2  BREAKOUT (close through the 55-day high / a major resistance on volume) or RETEST of a major support
                    (a level broken upward in the last 40 sessions, or the rising 50-day average, tested and held) = +2;
                    NEAR BREAKOUT (coiling within 3% under resistance) = +1; BREAKDOWN / FAILED RETEST from below = -2
  Extension -1..+1  stretched more than 3 ATR above the 20-day average or RSI > 78 = -1 (chasing); washed out below = +1
  Volume    -1..+1  up-day vs down-day volume over 20 sessions (accumulation / distribution)
SENTIMENT   Analyst -2..+2 (consensus 1=Strong buy .. 5=Sell), Target upside -1..+1, Short interest -1..+1
FUNDAMENTALS (each -1/0/+1, valuation judged against the median of the same sector in the same market)
  Fwd P/E, TTM P/E, P/Sales, Revenue growth, EPS growth, Debt/Equity, ROE, P/FCF, Dividend yield
Major support/resistance = clusters of swing highs/lows (5-bar pivots, last 12 months) touched at least twice.
Entry plans follow the LRC house rules: risk 1% per trade, stop below the support / breakout level (max 3 ATR), targets 2R and 3R,
results within 14 days = event risk.
"""
import math, datetime as dt
from statistics import median


def sma(xs, n):
    return sum(xs[-n:]) / n if len(xs) >= n else None


def rsi(c, n=14):
    if len(c) <= n: return None
    g = l = 0.0
    for i in range(1, n + 1):
        d = c[i] - c[i - 1]; g += max(d, 0); l += max(-d, 0)
    g /= n; l /= n
    for i in range(n + 1, len(c)):
        d = c[i] - c[i - 1]; g = (g * (n - 1) + max(d, 0)) / n; l = (l * (n - 1) + max(-d, 0)) / n
    return 100.0 if l == 0 else 100 - 100 / (1 + g / l)


def atr(bars, n=14):
    if len(bars) <= n: return None
    tr = [max(b['high'] - b['low'], abs(b['high'] - p['close']), abs(b['low'] - p['close'])) for p, b in zip(bars, bars[1:])]
    a = sum(tr[:n]) / n
    for x in tr[n:]: a = (a * (n - 1) + x) / n
    return a


def perf(c, n):
    return c[-1] / c[-1 - n] - 1 if len(c) > n and c[-1 - n] else None


def levels(bars, a, k=5, lookback=260):
    """Major support/resistance: cluster 5-bar swing highs and lows of the last ~12 months."""
    b = bars[-lookback:]
    piv = []
    for i in range(k, len(b) - k):
        win = b[i - k:i + k + 1]
        if b[i]['high'] >= max(x['high'] for x in win): piv.append((b[i]['high'], i))
        if b[i]['low'] <= min(x['low'] for x in win): piv.append((b[i]['low'], i))
    if not piv: return []
    piv.sort()
    tol = max(0.5 * a, 0.008 * b[-1]['close'])
    groups, cur = [], [piv[0]]
    for p in piv[1:]:
        if p[0] - cur[-1][0] <= tol and p[0] - cur[0][0] <= 2 * tol: cur.append(p)
        else: groups.append(cur); cur = [p]
    groups.append(cur)
    out = [{'price': sum(x[0] for x in g) / len(g), 'touches': len(g), 'last': max(x[1] for x in g) - len(b)} for g in groups]
    return [o for o in out if o['touches'] >= 2]


def technicals(bars, bench=None):
    c = [x['close'] for x in bars]; n = len(c)
    if n < 60: return None
    a = atr(bars) or 0
    t = {'price': c[-1], 'date': bars[-1]['date'], 'sma20': sma(c, 20), 'sma50': sma(c, 50), 'sma200': sma(c, 200) if n >= 200 else None,
         'rsi': rsi(c), 'atr': a, 'chg_1d': perf(c, 1), 'perf_1w': perf(c, 5), 'perf_1m': perf(c, 21), 'perf_3m': perf(c, 63),
         'perf_6m': perf(c, 126), 'perf_1y': perf(c, 252), 'hi52': max(x['high'] for x in bars[-252:]), 'lo52': min(x['low'] for x in bars[-252:])}
    yr = bars[-1]['date'][:4]
    first = next((x['close'] for x in reversed(bars) if x['date'][:4] < yr), None)
    t['perf_ytd'] = c[-1] / first - 1 if first else None
    av = sum(x['volume'] for x in bars[-21:-1]) / 20 if n > 21 else 0
    t['avg_vol'] = av; t['rel_vol'] = bars[-1]['volume'] / av if av else None
    t['value_traded'] = av * c[-1]
    s200_prev = sum(c[-220:-20]) / 200 if n >= 220 else None
    t['sma200_rising'] = (t['sma200'] > s200_prev) if (t['sma200'] and s200_prev) else None
    lv = levels(bars, a) if a else []
    t['supports'] = sorted([l for l in lv if l['price'] < c[-1]], key=lambda l: -l['price'])[:3]
    t['resistances'] = sorted([l for l in lv if l['price'] > c[-1]], key=lambda l: l['price'])[:3]
    up = sum(x['volume'] for p, x in zip(bars[-21:-1], bars[-20:]) if x['close'] > p['close'])
    dn = sum(x['volume'] for p, x in zip(bars[-21:-1], bars[-20:]) if x['close'] < p['close'])
    t['updown_vol'] = up / dn if dn else None
    if bench and len(bench) > 126 and t['perf_6m'] is not None:
        t['rs_6m'] = t['perf_6m'] - (bench[-1] / bench[-127] - 1)
    else:
        t['rs_6m'] = None
    t.update(setup(bars, t, lv))
    return t


def setup(bars, t, lv):
    c = [x['close'] for x in bars]; n = len(c); a = t['atr']; p = c[-1]
    s50, s200 = t['sma50'], t['sma200']
    major = [l['price'] for l in lv]
    res = {'setup': None, 'setup_level': None, 'setup_day': None}
    if not a: return res
    # --- BREAKOUT: close through the 55-day closing high, or through a major resistance, on volume, in the last 3 sessions
    for j in range(n - 1, n - 4, -1):
        prior = c[j - 55:j]
        if len(prior) < 55: break
        av = sum(x['volume'] for x in bars[j - 20:j]) / 20 or 1
        rv = bars[j]['volume'] / av
        crossed = [l['price'] for l in lv if c[j - 1] <= l['price'] < c[j] and l['touches'] >= 3]
        lvl = max(crossed) if crossed else (max(prior) if c[j] > max(prior) else None)
        if lvl and rv >= 1.3 and p > lvl - 0.25 * a and (s50 is None or p > s50):
            return {'setup': 'Breakout', 'setup_level': lvl, 'setup_day': bars[j]['date'], 'setup_bar': j - n}
    # --- BREAKDOWN: mirror image
    breakdown = None
    for j in range(n - 1, n - 4, -1):
        prior = c[j - 55:j]
        if len(prior) < 55: break
        av = sum(x['volume'] for x in bars[j - 20:j]) / 20 or 1
        rv = bars[j]['volume'] / av
        crossed = [l['price'] for l in lv if c[j - 1] >= l['price'] > c[j] and l['touches'] >= 3]
        lvl = min(crossed) if crossed else (min(prior) if c[j] < min(prior) else None)
        if lvl and rv >= 1.4 and p < lvl + 0.25 * a and (s50 is None or p < s50):
            breakdown = {'setup': 'Breakdown', 'setup_level': lvl, 'setup_day': bars[j]['date'], 'setup_bar': j - n}
            break
    # --- RETEST of a major support that was broken upward in the last 40 sessions (old resistance = new support)
    lows3 = min(x['low'] for x in bars[-3:])
    best = None
    for L in major:
        if not (L < p and p - L <= 2.5 * a): continue
        cross = [i for i in range(n - 40, n - 3) if c[i - 1] < L <= c[i]]
        if not cross: continue
        held = all(x >= L - 0.5 * a for x in c[cross[-1]:])
        if held and lows3 <= L + 0.6 * a and (s200 is None or p > s200) and (s50 is None or s200 is None or s50 > s200):
            if not best or L > best: best = L
    if best and not breakdown:
        return {'setup': 'Retest', 'setup_level': best, 'setup_day': bars[-1]['date'], 'setup_note': 'Retest of a broken resistance (now support)'}
    # retest of the rising 50-day average inside an uptrend
    if s50 and s200 and p > s50 > s200 and t.get('sma200_rising') and lows3 <= s50 + 0.3 * a and p - s50 <= 1.5 * a:
        return {'setup': 'Retest', 'setup_level': s50, 'setup_day': bars[-1]['date'], 'setup_note': 'Retest of the rising 50-day average'}
    if breakdown: return breakdown
    # --- FAILED RETEST from below (broken support now resistance)
    highs3 = max(x['high'] for x in bars[-3:])
    for L in sorted(major):
        if not (L > p and L - p <= 2.5 * a): continue
        cross = [i for i in range(n - 40, n - 3) if c[i - 1] > L >= c[i]]
        if cross and all(x <= L + 0.5 * a for x in c[cross[-1]:]) and highs3 >= L - 0.5 * a and (s200 is None or p < s200) \
                and (s50 is None or p < s50) and (s50 is None or s200 is None or s50 < s200):
            return {'setup': 'Failed retest', 'setup_level': L, 'setup_day': bars[-1]['date'], 'setup_note': 'Rally failed at a broken support (now resistance)'}
    # --- NEAR BREAKOUT: coiling within 3% under the 55-day high / major resistance with a contracting range
    hi55 = max(c[-56:-1])
    near = [L for L in major if L > p and (L - p) / p <= 0.03]
    a_then = atr(bars[:-30]) if n > 50 else None
    if (near or (hi55 > p and (hi55 - p) / p <= 0.03)) and s50 and p > s50 and a_then and a < a_then * 0.9:
        return {'setup': 'Near breakout', 'setup_level': min(near) if near else hi55, 'setup_day': bars[-1]['date']}
    return res


def plan(bars, t, next_earnings=None, today=None):
    """Entry plan for the setup, LRC house rules (risk 1%, stop max 3 ATR, targets 2R / 3R)."""
    s = t.get('setup'); a = t['atr']; L = t.get('setup_level')
    if s not in ('Breakout', 'Retest', 'Breakdown', 'Failed retest', 'Near breakout') or not a or not L: return None
    hi1, lo1 = bars[-1]['high'], bars[-1]['low']
    if s in ('Breakout', 'Retest', 'Near breakout'):
        side = 'Long'
        if s == 'Breakout':
            entry = max(hi1, bars[t.get('setup_bar', -1)]['high']) * 1.002; stop = min(L - 0.5 * a, entry - 1.0 * a); how = 'Buy stop above the breakout-day high'
        elif s == 'Retest':
            entry = hi1 * 1.002; stop = min(L - 0.75 * a, entry - 1.0 * a); how = 'Buy stop above yesterday\'s high once support holds'
        else:
            entry = L * 1.003; stop = entry - 2 * a; how = 'Buy stop just above resistance (only if it breaks on volume)'
        stop = max(stop, entry - 3 * a)
        r = entry - stop; t1, t2 = entry + 2 * r, entry + 3 * r
        nxt = next((l['price'] for l in t.get('resistances', []) if l['price'] > entry), None)
    else:
        side = 'Short'
        if s == 'Breakdown':
            entry = min(lo1, bars[t.get('setup_bar', -1)]['low']) * 0.998; stop = max(L + 0.5 * a, entry + 1.0 * a); how = 'Sell stop below the breakdown-day low'
        else:
            entry = lo1 * 0.998; stop = max(L + 0.75 * a, entry + 1.0 * a); how = 'Sell stop below yesterday\'s low while under resistance'
        stop = min(stop, entry + 3 * a)
        r = stop - entry; t1, t2 = entry - 2 * r, entry - 3 * r
        nxt = next((l['price'] for l in t.get('supports', []) if l['price'] < entry), None)
    ev = None
    if next_earnings:
        try:
            d = (dt.date.fromisoformat(next_earnings) - (today or dt.date.fromisoformat(bars[-1]['date']))).days
            if 0 <= d <= 14: ev = f'Results in {d} days ({next_earnings}) — event risk: wait or trade smaller'
        except Exception: pass
    return {'side': side, 'how': how, 'entry': entry, 'stop': stop, 't1': t1, 't2': t2, 'risk_per_share': r,
            'risk_pct': r / entry, 'next_level': nxt, 'event_risk': ev, 'rule': '1% of account at risk; size = (account × 1%) ÷ risk per share'}


# ---------------- scoring ----------------
def clamp(x, lo, hi): return max(lo, min(hi, x))


def tech_scores(t):
    p, s50, s200 = t['price'], t['sma50'], t['sma200']
    if s200:
        if p > s50 > s200 and t.get('sma200_rising'): trend = 2
        elif p < s50 < s200 and t.get('sma200_rising') is False: trend = -2
        elif p > s200: trend = 1
        else: trend = -1
    else:
        trend = 1 if p > s50 else -1
    rs, r = t.get('rs_6m'), t.get('rsi') or 50
    if rs is None: mom = 1 if r > 55 else -1 if r < 45 else 0
    elif rs > 0.10 and r >= 50: mom = 2
    elif rs > 0: mom = 1
    elif rs < -0.10 and r < 50: mom = -2
    else: mom = -1
    st = {'Breakout': 2, 'Retest': 2, 'Near breakout': 1, 'Breakdown': -2, 'Failed retest': -2}.get(t.get('setup'), 0)
    ext = 0
    if t['atr'] and t['sma20']:
        z = (p - t['sma20']) / t['atr']
        if z > 3 or r > 78: ext = -1
        elif z < -3 or r < 22: ext = 1
    uv = t.get('updown_vol')
    vol = 0 if uv is None else 1 if uv >= 1.3 else -1 if uv <= 0.77 else 0
    return {'trend': trend, 'momentum': mom, 'setup': st, 'extension': ext, 'volume': vol}


def sentiment_scores(f, price):
    out = {}
    rec = f.get('rec_mean')
    out['analysts'] = None if rec is None or not f.get('n_analysts') else (2 if rec <= 1.8 else 1 if rec <= 2.4 else -2 if rec >= 3.5 else -1 if rec >= 3.0 else 0)
    tg = f.get('target_median') or f.get('target_mean')
    out['target'] = None if not tg or not price else (1 if tg / price - 1 > 0.15 else -1 if tg / price - 1 < 0 else 0)
    sh = f.get('short_float')
    out['short'] = None if sh is None else (-1 if sh > 0.12 else 1 if sh < 0.03 else 0)
    return out


def fund_scores(f, med, sector):
    def rel(v, m, lower_better=True, neg_bad=True):
        if v is None: return None
        if neg_bad and v <= 0: return -1
        if not m: return 0
        if lower_better: return 1 if v < 0.8 * m else -1 if v > 1.25 * m else 0
        return 1 if v > 1.25 * m else -1 if v < 0.8 * m else 0
    o = {'fpe': rel(f.get('fpe'), med.get('fpe')), 'tpe': rel(f.get('tpe'), med.get('tpe')), 'ps': rel(f.get('ps'), med.get('ps')),
         'pfcf': rel(f.get('pfcf'), med.get('pfcf'))}
    g = f.get('rev_growth'); o['rev_growth'] = None if g is None else (1 if g > max(0.10, med.get('rev_growth') or 0) else -1 if g < 0 else 0)
    e = f.get('eps_growth'); o['eps_growth'] = None if e is None else (1 if e > 0.15 else -1 if e < 0 else 0)
    de = f.get('de')
    o['de'] = None if de is None or sector in ('Financial Services', 'Real Estate') else (1 if de < 50 else -1 if de > 150 else 0)
    roe = f.get('roe'); o['roe'] = None if roe is None else (1 if roe > 0.15 else -1 if roe < 0.05 else 0)
    dy = f.get('div_yield'); o['div_yield'] = None if dy is None else (1 if dy > max(0.02, med.get('div_yield') or 0) else 0)
    return o


def verdict(total, maxabs):
    x = total / maxabs if maxabs else 0
    return 'Strong bullish' if x >= 0.45 else 'Bullish' if x >= 0.18 else 'Strong bearish' if x <= -0.45 else 'Bearish' if x <= -0.18 else 'Neutral'


def sector_medians(rows):
    keys = ['fpe', 'tpe', 'ps', 'pfcf', 'rev_growth', 'div_yield', 'roe', 'de']
    out = {}
    for r in rows:
        out.setdefault((r['market'], r.get('sector') or 'Other'), []).append(r['f'])
    med = {}
    for k, fs in out.items():
        med[k] = {}
        for m in keys:
            vals = [f[m] for f in fs if f.get(m) is not None and (m in ('rev_growth', 'div_yield', 'roe', 'de') or f[m] > 0)]
            med[k][m] = median(vals) if len(vals) >= 3 else None
    return med


def model_targets(f, med, price):
    """Target triangulation: analyst median, P/FCF-based, PEG-based (P/E = growth), sector P/E-based, and their blend."""
    out = {}
    if f.get('target_median'): out['analyst_median'] = f['target_median']
    fcfps = f.get('fcf_per_share'); mp = med.get('pfcf')
    if fcfps and fcfps > 0 and mp: out['pfcf'] = fcfps * mp
    feps, g = f.get('forward_eps'), f.get('eps_growth_fwd') if f.get('eps_growth_fwd') is not None else f.get('eps_growth')
    if feps and feps > 0 and g is not None: out['peg'] = feps * clamp(g * 100, 8, 30)
    if feps and feps > 0 and med.get('fpe'): out['sector_pe'] = feps * med['fpe']
    vals = [v for v in out.values() if v and v > 0 and 0.2 * price < v < 5 * price]
    if vals: out['blend'] = median(vals)
    return out
