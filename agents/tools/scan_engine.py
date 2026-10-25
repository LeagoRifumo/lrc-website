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
    def rng_pos(x): return (x['close'] - x['low']) / (x['high'] - x['low']) if x['high'] > x['low'] else 0.5
    for j in range(n - 1, n - 3, -1):
        prior = c[j - 55:j]
        if len(prior) < 55: break
        av = sum(x['volume'] for x in bars[j - 20:j]) / 20 or 1
        rv = bars[j]['volume'] / av
        crossed = [l['price'] for l in lv if c[j - 1] <= l['price'] < c[j] and l['touches'] >= 3]
        lvl = max(crossed) if crossed else (max(prior) if c[j] > max(prior) else None)
        if lvl and rv >= 1.5 and rng_pos(bars[j]) >= 0.6 and p > lvl - 0.25 * a and (s50 is None or p > s50):
            return {'setup': 'Breakout', 'setup_level': lvl, 'setup_day': bars[j]['date'], 'setup_bar': j - n}
    # --- BREAKDOWN: mirror image
    breakdown = None
    for j in range(n - 1, n - 3, -1):
        prior = c[j - 55:j]
        if len(prior) < 55: break
        av = sum(x['volume'] for x in bars[j - 20:j]) / 20 or 1
        rv = bars[j]['volume'] / av
        crossed = [l['price'] for l in lv if c[j - 1] >= l['price'] > c[j] and l['touches'] >= 3]
        lvl = min(crossed) if crossed else (min(prior) if c[j] < min(prior) else None)
        if lvl and rv >= 1.5 and rng_pos(bars[j]) <= 0.4 and p < lvl + 0.25 * a and (s50 is None or p < s50):
            breakdown = {'setup': 'Breakdown', 'setup_level': lvl, 'setup_day': bars[j]['date'], 'setup_bar': j - n}
            break
    # --- RETEST of a major support that was broken upward in the last 40 sessions (old resistance = new support)
    lows3 = min(x['low'] for x in bars[-3:])
    best = None
    for L in [l['price'] for l in lv if l['touches'] >= 3]:
        if not (L < p and p - L <= 2.0 * a): continue
        cross = [i for i in range(n - 40, n - 3) if c[i - 1] < L <= c[i]]
        if not cross: continue
        held = all(x >= L - 0.5 * a for x in c[cross[-1]:])
        if held and lows3 <= L + 0.6 * a and (s200 is None or p > s200) and (s50 is None or s200 is None or s50 > s200):
            if not best or L > best: best = L
    if best and not breakdown:
        return {'setup': 'Retest', 'setup_level': best, 'setup_day': bars[-1]['date'], 'setup_note': 'Retest of a broken resistance (now support)'}
    # retest of the rising 50-day average inside an uptrend
    r_ = t.get('rsi') or 50
    if s50 and s200 and p > s50 > s200 and t.get('sma200_rising') and lows3 <= s50 + 0.2 * a and p - s50 <= 1.0 * a and c[-1] > c[-2] and 40 <= r_ <= 60:
        return {'setup': 'Retest', 'setup_level': s50, 'setup_day': bars[-1]['date'], 'setup_note': 'Retest of the rising 50-day average'}
    if breakdown: return breakdown
    # --- FAILED RETEST from below (broken support now resistance)
    highs3 = max(x['high'] for x in bars[-3:])
    for L in sorted(l['price'] for l in lv if l['touches'] >= 3):
        if not (L > p and L - p <= 2.0 * a): continue
        cross = [i for i in range(n - 40, n - 3) if c[i - 1] > L >= c[i]]
        if cross and all(x <= L + 0.5 * a for x in c[cross[-1]:]) and highs3 >= L - 0.5 * a and (s200 is None or p < s200) \
                and (s50 is None or p < s50) and (s50 is None or s200 is None or s50 < s200) and c[-1] < c[-2]:
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
    # consensus ratings lean bullish across the market, so the bands are set tighter than the 1-5 scale suggests
    out['analysts'] = None if rec is None or not f.get('n_analysts') else (2 if rec <= 1.6 else 1 if rec <= 2.0 else 0 if rec <= 2.6 else -1 if rec <= 3.0 else -2)
    tg = f.get('target_median') or f.get('target_mean')
    out['target'] = None if not tg or not price else (1 if tg / price - 1 > 0.25 else -1 if tg / price - 1 < 0.05 else 0)
    sh = f.get('short_float')
    out['short'] = None if sh is None else (-1 if sh > 0.10 else 1 if sh < 0.015 else 0)
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
    g = f.get('rev_growth'); o['rev_growth'] = None if g is None else (1 if g > max(0.15, (med.get('rev_growth') or 0) + 0.05) else -1 if g < 0 else 0)
    e = f.get('eps_growth'); o['eps_growth'] = None if e is None else (1 if e > 0.20 else -1 if e < 0 else 0)
    de = f.get('de')
    o['de'] = None if de is None or sector in ('Financial Services', 'Real Estate') else (1 if de < 50 else -1 if de > 150 else 0)
    roe = f.get('roe'); o['roe'] = None if roe is None else (1 if roe > 0.20 else -1 if roe < 0.08 else 0)
    dy = f.get('div_yield'); o['div_yield'] = None if dy is None else (1 if dy > max(0.025, 1.25 * (med.get('div_yield') or 0)) else 0)
    return o


def lrc_score(total, maxabs):
    """LRC score on a 0-100 scale: 50 = neutral, 100 = every reading at its most bullish, 0 = every reading at its most bearish."""
    return round(50 + 50 * total / maxabs) if maxabs else 50


def verdict(total, maxabs):
    """LRC Stock Scanner rating from the 0-100 LRC score (separate from the analyst rating in ratings.json)."""
    sc = lrc_score(total, maxabs)
    return 'STRONG BUY' if sc >= 72 else 'BUY' if sc >= 61 else 'STRONG SELL' if sc <= 32 else 'SELL' if sc <= 42 else 'HOLD'


def consistent(rating, upside):
    """A BUY needs upside to the LRC Analyst Target and a SELL needs downside, so the rating and the target never contradict.
    Returns (rating, reason or None)."""
    if upside is None: return rating, None
    if rating == 'STRONG BUY' and upside < 0.10: rating = 'BUY' if upside >= 0.05 else 'HOLD'
    elif rating == 'BUY' and upside < 0.05: rating = 'HOLD'
    elif rating == 'STRONG SELL' and upside > -0.05: rating = 'SELL' if upside <= 0 else 'HOLD'
    elif rating == 'SELL' and upside > 0: rating = 'HOLD'
    else: return rating, None
    return rating, 'Capped by the LRC Analyst Target (%+.0f%% from the price)' % (upside * 100)


def sector_medians(rows):
    keys = ['fpe', 'tpe', 'ps', 'pfcf', 'peg', 'pb', 'rev_growth', 'eps_growth', 'eps_growth_fwd', 'eps_growth_next', 'div_yield', 'roe', 'roa', 'de',
            'gross_margin', 'op_margin', 'profit_margin', 'current_ratio']
    signed = {'rev_growth', 'eps_growth', 'eps_growth_fwd', 'eps_growth_next', 'div_yield', 'roe', 'roa', 'de', 'gross_margin', 'op_margin', 'profit_margin', 'current_ratio'}
    out = {}
    for r in rows:
        out.setdefault((r['market'], r.get('sector') or 'Other'), []).append(r['f'])
    med = {}
    for k, fs in out.items():
        med[k] = {}
        for m in keys:
            vals = [f[m] for f in fs if f.get(m) is not None and (m in signed or f[m] > 0)]
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
    # LRC Analyst Target (automated): 60% analyst consensus + 40% LRC valuation models, kept within ±20% of the consensus
    # (or within -40%/+60% of the price when no consensus exists)
    models = [out[k] for k in ('pfcf', 'peg', 'sector_pe') if out.get(k) and 0.4 * price < out[k] < 2.5 * price]
    mdl = median(models) if models else None
    cons = out.get('analyst_median')
    if cons and mdl: t = clamp(0.6 * cons + 0.4 * mdl, 0.8 * cons, 1.2 * cons)
    elif cons: t = cons
    elif mdl: t = clamp(mdl, 0.6 * price, 1.6 * price)
    else: t = None
    if t: out['blend'] = clamp(t, 0.65 * price, 1.5 * price)  # a 6-month target stays within -35% / +50% of the price
    if mdl: out['models'] = mdl
    return out


def cagr(series):
    """Compound annual growth from a list of {'date','value'} (oldest -> newest); needs >= 3 points and positive ends."""
    pts = [x for x in (series or []) if x.get('value') is not None]
    if len(pts) < 3: return None
    a, b = pts[0]['value'], pts[-1]['value']
    yrs = (int(pts[-1]['date'][:4]) - int(pts[0]['date'][:4])) or (len(pts) - 1)
    if a <= 0 or b <= 0 or yrs <= 0: return None
    return (b / a) ** (1 / yrs) - 1


def investment(f, ts, market, price, fair):
    """LRC Investment track (long-only, 5-10 years), from the workbook's Investment preset. Returns pass count, grade, checks."""
    big = 20e9 if market == 'JSE' else 10e9
    pe_cap = 20 if market == 'JSE' else 25
    rev_c = cagr((ts or {}).get('annualTotalRevenue'))
    eps_c = cagr((ts or {}).get('annualDilutedEPS')) or cagr((ts or {}).get('annualNetIncome'))
    checks = [
        ('Market cap', f.get('mcap'), lambda v: v >= big, ('> R20bn' if market == 'JSE' else '> $10bn')),
        ('Return on equity', f.get('roe'), lambda v: v > 0.15, '> 15%'),
        ('Return on assets', f.get('roa'), lambda v: v > 0.07, '> 7%'),
        ('Operating margin', f.get('op_margin'), lambda v: v > 0.15, '> 15%'),
        ('Debt / equity', f.get('de'), lambda v: v < 50, '< 0.5'),
        ('Current ratio', f.get('current_ratio'), lambda v: v > 1, '> 1'),
        ('Forward P/E', f.get('fpe'), lambda v: 0 < v < pe_cap, f'< {pe_cap}'),
        ('Price / FCF', f.get('pfcf'), lambda v: 0 < v < 25, '< 25'),
        ('EPS growth (multi-year)', eps_c, lambda v: v > 0.10, '> 10% a year'),
        ('Revenue growth (multi-year)', rev_c, lambda v: v > 0.05, '> 5% a year'),
    ]
    out, passed, known = [], 0, 0
    for name, v, test, rule in checks:
        ok = None if v is None else bool(test(v))
        if ok is not None: known += 1; passed += ok
        out.append({'k': name, 'v': v, 'rule': rule, 'ok': ok})
    grade = 'A' if passed >= 8 else 'B' if passed >= 6 else 'C'
    mos = fair / price - 1 if fair and price else None
    return {'passed': passed, 'known': known, 'grade': grade, 'checks': out, 'rev_cagr': rev_c, 'eps_cagr': eps_c, 'fair_value': fair, 'mos': mos}


# ======================= LRC factor model (v6) =======================
# Six factors, each scored 0-100 as a percentile rank against peers (same sector in the same market; whole market for
# momentum and technicals). 50 = average, 80 = better than 80% of peers. The LRC score is the percentile rank of the
# weighted factor composite within the market, so an LRC score of 85 means "ranks above 85% of the companies we scan".
FACTORS = {
    'value':         {'w': 0.20, 'peer': 'sector', 'metrics': [('fpe', -1), ('tpe', -1), ('ps', -1), ('pfcf', -1), ('peg', -1)]},
    'growth':        {'w': 0.20, 'peer': 'sector', 'metrics': [('rev_growth', 1), ('eps_growth', 1), ('eps_growth_fwd', 1), ('eps_growth_next', 1)]},
    'profitability': {'w': 0.20, 'peer': 'sector', 'metrics': [('roe', 1), ('roa', 1), ('op_margin', 1), ('profit_margin', 1), ('de', -1), ('current_ratio', 1)]},
    'momentum':      {'w': 0.20, 'peer': 'market', 'metrics': [('perf_1m', 1), ('perf_3m', 1), ('perf_6m', 1), ('perf_1y', 1)]},
    'sentiment':     {'w': 0.10, 'peer': 'sector', 'metrics': [('rec_mean', -1), ('tgt_up', 1), ('short_float', -1), ('net_upgrades', 1)]},
    'technical':     {'w': 0.10, 'peer': 'market', 'metrics': [('tech_points', 1)]},
}
VALUATION_NEG_WORST = {'fpe', 'tpe', 'pfcf', 'peg'}   # negative earnings / cash flow = worst value score
NO_BALANCE_SHEET = {'Financial Services', 'Real Estate'}  # debt/equity and current ratio are not meaningful for banks/insurers/REITs


def pctile(values):
    """values: list of (key, x). Returns {key: percentile 0-100} (average rank for ties)."""
    v = sorted((x, k) for k, x in values)
    n = len(v); out = {}
    if n == 1: return {v[0][1]: 50.0}
    i = 0
    while i < n:
        j = i
        while j + 1 < n and v[j + 1][0] == v[i][0]: j += 1
        r = (i + j) / 2
        for q in range(i, j + 1): out[v[q][1]] = 100.0 * r / (n - 1)
        i = j + 1
    return out


def grade(s):
    return None if s is None else 'A' if s >= 80 else 'B' if s >= 60 else 'C' if s >= 40 else 'D' if s >= 20 else 'F'


def rating_from_score(s):
    return 'STRONG BUY' if s >= 80 else 'BUY' if s >= 60 else 'HOLD' if s >= 40 else 'SELL' if s >= 20 else 'STRONG SELL'


def factor_model(items):
    """items: list of dicts {key, market, sector, m: {metric: value}}. Adds item['pct'] (metric percentiles),
    item['factors'] {name: score 0-100 or None}, item['composite'] and item['score'] (0-100 within market)."""
    metrics = {m for f in FACTORS.values() for m, _ in f['metrics']}
    for it in items: it['pct'] = {}; it['factors'] = {}
    for metric in metrics:
        direction = next(d for f in FACTORS.values() for m, d in f['metrics'] if m == metric)
        peer = next(f['peer'] for f in FACTORS.values() if any(m == metric for m, _ in f['metrics']))
        groups = {}
        for it in items:
            x = it['m'].get(metric)
            if x is None: continue
            if metric in ('de', 'current_ratio') and it['sector'] in NO_BALANCE_SHEET: continue
            if metric in VALUATION_NEG_WORST and x <= 0: x = float('inf')   # loss-making: worst value
            elif direction < 0: x = -x
            else: pass
            if direction < 0 and x == float('inf'): x = float('-inf')
            g = (it['market'], it['sector']) if peer == 'sector' else (it['market'],)
            groups.setdefault(g, []).append((it['key'], x))
        # small sector groups fall back to the whole market
        merged = {}
        for g, vals in groups.items():
            if len(vals) < 6 and len(g) == 2: merged.setdefault((g[0],), []).extend(vals)
            else: merged.setdefault(g, []).extend(vals)
        byk = {it['key']: it for it in items}
        for g, vals in merged.items():
            for k, p in pctile(vals).items(): byk[k]['pct'][metric] = round(p)
    for it in items:
        tot = wsum = 0
        for name, f in FACTORS.items():
            ps = [it['pct'][m] for m, _ in f['metrics'] if m in it['pct']]
            need = 2 if name in ('value', 'profitability', 'growth') else 1
            s = round(sum(ps) / len(ps)) if len(ps) >= need else None
            it['factors'][name] = s
            if s is not None: tot += f['w'] * s; wsum += f['w']
        it['composite'] = tot / wsum if wsum >= 0.5 else None
    for mk in {it['market'] for it in items}:
        vals = [(it['key'], it['composite']) for it in items if it['market'] == mk and it['composite'] is not None]
        for k, p in pctile(vals).items():
            next(it for it in items if it['key'] == k)['score'] = round(p)
    for it in items: it.setdefault('score', None)
    return items


# ======================= LRC readings model (v7, analyst-approved 25 Oct 2026) =======================
# 37 readings, each +1 / 0 / -1 (Trend, Momentum, Setup: +2 .. -2). Fundamentals are judged against the median of the same
# sector in the same market. Score = 50 + 50 x points / maximum possible (0-100, 50 = neutral). Colour intensity is
# display-only: a +1 reading in the best 10% of its sector shows bright green, a -1 in the worst 10% bright red.
GROUPS = [('valuation', 'Valuation'), ('growth', 'Growth'), ('profitability', 'Profitability'), ('health', 'Financial health'),
          ('income', 'Income'), ('sentiment', 'Sentiment'), ('technical', 'Technical')]
NO_BS = {'Financial Services', 'Real Estate'}
# key, label, group, max points, format, higher_is_better (for colour intensity), skip balance-sheet sectors
READINGS = [
    ('fpe', 'Forward P/E', 'valuation', 1, 'x', False, False), ('tpe', 'Trailing P/E', 'valuation', 1, 'x', False, False),
    ('peg', 'PEG ratio', 'valuation', 1, 'r', False, False), ('ps', 'Price / Sales', 'valuation', 1, 'x', False, False),
    ('pb', 'Price / Book', 'valuation', 1, 'x', False, False), ('pfcf', 'Price / Free cash flow', 'valuation', 1, 'x', False, False),
    ('ev_ebitda', 'EV / EBITDA', 'valuation', 1, 'x', False, False),
    ('rev_growth', 'Revenue growth (qtr, y/y)', 'growth', 1, 'p', True, False), ('eps_growth', 'EPS growth (qtr, y/y)', 'growth', 1, 'p', True, False),
    ('eps_growth_fwd', 'EPS growth this year (est.)', 'growth', 1, 'p', True, False), ('eps_growth_next', 'EPS growth next year (est.)', 'growth', 1, 'p', True, False),
    ('rev_cagr3', 'Revenue growth, 3 yrs (a year)', 'growth', 1, 'p', True, False), ('eps_cagr3', 'EPS growth, 3 yrs (a year)', 'growth', 1, 'p', True, False),
    ('gross_margin', 'Gross margin', 'profitability', 1, 'p', True, False), ('op_margin', 'Operating margin', 'profitability', 1, 'p', True, False),
    ('profit_margin', 'Net margin', 'profitability', 1, 'p', True, False), ('roe', 'Return on equity', 'profitability', 1, 'p', True, False),
    ('roa', 'Return on assets', 'profitability', 1, 'p', True, False),
    ('de', 'Debt / Equity', 'health', 1, 'de', False, True), ('current_ratio', 'Current ratio', 'health', 1, 'r', True, True),
    ('quick_ratio', 'Quick ratio', 'health', 1, 'r', True, True), ('fcf_margin', 'Free cash flow margin', 'health', 1, 'p', True, False),
    ('net_cash_pct', 'Net cash / market cap', 'health', 1, 'p', True, True),
    ('div_yield', 'Dividend yield', 'income', 1, 'p', True, False), ('payout', 'Payout ratio', 'income', 1, 'p', None, False),
    ('rec_mean', 'Analyst consensus (1-5)', 'sentiment', 1, 'r1', False, False), ('tgt_up', 'Upside to analyst target', 'sentiment', 1, 'p', True, False),
    ('net_upgrades', 'Upgrades - downgrades (45 days)', 'sentiment', 1, 'i', True, False), ('short_float', 'Short interest', 'sentiment', 1, 'p', False, False),
    ('insiders', 'Insider ownership', 'sentiment', 1, 'p', True, False), ('inst', 'Institutional ownership', 'sentiment', 1, 'p', None, False),
    ('trend', 'Trend (50/200-day)', 'technical', 2, 't', True, False), ('momentum', 'Momentum (6m vs market)', 'technical', 2, 'p', True, False),
    ('setup', 'Setup', 'technical', 2, 's', True, False), ('stretch', 'Stretch / RSI', 'technical', 1, 'r0', None, False),
    ('volume', 'Volume (up vs down days)', 'technical', 1, 'r', True, False), ('beta', 'Beta (risk)', 'technical', 1, 'r', False, False),
]
REL_LOW = {'fpe', 'tpe', 'ps', 'pb', 'pfcf', 'ev_ebitda'}
VAL_NEG_BAD = {'fpe', 'tpe', 'pfcf', 'ev_ebitda', 'peg'}


def reading_points(k, v, med, pct, sector, extra):
    """Points for one reading (None = left out)."""
    if v is None: return None
    if k in REL_LOW:
        if v <= 0: return -1
        if not med: return 0
        return 1 if v <= 0.8 * med else -1 if v >= 1.25 * med else 0
    if k == 'peg': return -1 if v <= 0 else 1 if v < 1.0 else -1 if v > 2.0 else 0
    if k == 'rev_growth': return 1 if v > 0.15 and v > (med if med is not None else 0) else -1 if v < 0 else 0
    if k == 'eps_growth': return 1 if v > 0.20 else -1 if v < 0 else 0
    if k in ('eps_growth_fwd', 'eps_growth_next'): return 1 if v > 0.15 else -1 if v < 0 else 0
    if k in ('rev_cagr3', 'eps_cagr3'): return 1 if v > 0.10 else -1 if v < 0 else 0
    if k == 'gross_margin': return None if pct is None else 1 if pct >= 70 else -1 if pct <= 30 else 0
    if k == 'op_margin': return 1 if v > 0.15 and v > (med if med is not None else 0) else -1 if v < 0 else 0
    if k == 'profit_margin': return -1 if v < 0 else (1 if pct is not None and pct >= 70 else 0)
    if k == 'roe': return 1 if v > 0.20 else -1 if v < 0.08 else 0
    if k == 'roa': return 1 if v > 0.08 else -1 if v < 0.02 else 0
    if k == 'de': return 1 if v < 50 else -1 if v > 150 else 0
    if k == 'current_ratio': return 1 if v > 1.5 else -1 if v < 1.0 else 0
    if k == 'quick_ratio': return 1 if v > 1.0 else -1 if v < 0.5 else 0
    if k == 'fcf_margin': return 1 if v > 0.15 else -1 if v < 0 else 0
    if k == 'net_cash_pct': return 1 if v > 0 else -1 if v < -0.5 else 0
    if k == 'div_yield':
        if extra.get('div_cut'): return -1
        return 1 if v > 0.03 and v > (med or 0) else 0
    if k == 'payout': return None if not extra.get('pays_dividend') else 1 if 0.2 <= v <= 0.7 else -1 if v > 1.0 else 0
    if k == 'rec_mean': return 1 if v <= 2.0 else -1 if v >= 3.0 else 0
    if k == 'tgt_up': return 1 if v > 0.20 else -1 if v < 0.05 else 0
    if k == 'net_upgrades': return 1 if v > 0 else -1 if v < 0 else 0
    if k == 'short_float': return 1 if v < 0.02 else -1 if v > 0.10 else 0
    if k == 'insiders': return 1 if v > 0.05 else 0
    if k == 'inst': return 1 if 0.40 <= v <= 0.90 else -1 if v < 0.15 else 0
    if k == 'beta': return 1 if v < 0.8 else -1 if v > 1.6 else 0
    return None


def readings_model(items):
    """items: list of {key, market, sector, v: {reading: value}, tp: tech points, extra: {...}}.
    Adds it['rd'] {k: [value, points, intensity]}, it['groups'] {group: score 0-100}, it['points'], it['max'], it['score'];
    returns medians {market: {'_market': {k: med}, sector: {k: med}}}."""
    keys = [r[0] for r in READINGS]
    vals = {}
    for it in items:
        for k in keys:
            x = it['v'].get(k)
            if x is None or isinstance(x, (str, bool)) or k in ('trend', 'setup'): continue
            if k in VAL_NEG_BAD and x <= 0: continue  # medians of valuation ratios use positive values only
            vals.setdefault((it['market'], it['sector'], k), []).append((it['key'], x))
            vals.setdefault((it['market'], '_market', k), []).append((it['key'], x))
    med = {}
    for (m, sec, k), xs in vals.items():
        med.setdefault(m, {}).setdefault(sec, {})[k] = median([x for _, x in xs]) if len(xs) >= 3 else None
    # sector percentiles (higher = better for that reading; market-wide when the sector has fewer than 6 names)
    hib = {r[0]: r[5] for r in READINGS}
    pct = {}
    for (m, sec, k), xs in vals.items():
        if sec == '_market' or hib.get(k) is None: continue
        use = xs if len(xs) >= 6 else vals.get((m, '_market', k), xs)
        sign = 1 if hib[k] else -1
        pp = pctile([(kk, sign * x) for kk, x in use])
        for kk, _ in xs: pct[(kk, k)] = pp.get(kk)
    for it in items:
        m, sec = it['market'], it['sector']
        smed = (med.get(m, {}).get(sec) or {}); mmed = (med.get(m, {}).get('_market') or {})
        rd, P, M, gp = {}, 0, 0, {}
        for k, label, grp, mx, fmt, hi, skip_bs in READINGS:
            v = it['v'].get(k)
            if skip_bs and sec in NO_BS: continue
            if grp == 'technical' and k in ('trend', 'momentum', 'setup', 'stretch', 'volume'):
                pts = it['tp'].get({'stretch': 'extension'}.get(k, k))
            else:
                mref = smed.get(k) if smed.get(k) is not None else mmed.get(k)
                pts = reading_points(k, v, mref, pct.get((it['key'], k)), sec, it['extra'])
            if pts is None:
                if v is not None: rd[k] = [v, None, 0]
                continue
            p_ = pct.get((it['key'], k))
            inten = pts if mx == 2 else (2 if pts == 1 and p_ is not None and p_ >= 90 else -2 if pts == -1 and p_ is not None and p_ <= 10 else pts)
            rd[k] = [v, pts, inten]
            P += pts; M += mx
            g = gp.setdefault(grp, [0, 0]); g[0] += pts; g[1] += mx
        it['rd'] = rd; it['points'] = P; it['max'] = M
        it['score'] = round(50 + 50 * P / M) if M else 50
        it['groups'] = {g: (round(50 + 50 * a / b) if b else None) for g, (a, b) in gp.items()}
        it['val_points'] = gp.get('valuation', [0, 0])[0]
    return med


def rating_v7(score):
    return 'STRONG BUY' if score >= 75 else 'BUY' if score >= 60 else 'HOLD' if score >= 40 else 'SELL' if score >= 25 else 'STRONG SELL'


def valuation_verdict(val_points, upside):
    if val_points >= 2 and upside is not None and upside >= 0.10: return 'UNDERVALUED'
    if val_points <= -2 or (upside is not None and upside < -0.05): return 'OVERVALUED'
    return 'FAIR VALUE'
