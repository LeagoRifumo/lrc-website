#!/usr/bin/env python3
"""LRC TOP PICKS (members only) — runs after every scanner run (scanner.yml).

Picks are chosen by fixed rules from the LRC Stock Scanner (agents/config/top_picks.json):
  * Liquidity first: enough value traded a day, minimum market value and share price, not flagged thin, fresh data.
  * Trading picks (3-12 months): Trading rating STRONG BUY / BUY, price trend up (above its averages), not stretched,
    RSI in range, no results within 5 days (house event-risk rule; investment picks 3 days).
  * Investment picks (5-10 years): Investment rating STRONG BUY / BUY, quality grade A or B, not overvalued,
    healthy balance sheet, margin of safety to the model value.
  * Best score first, at most 2 per sector, 5 per market (fewer if fewer qualify — quality over quantity).
No entry prices, stop-losses or targets are published with the picks (owner decision, 2 Nov 2026).

The full picks are NOT written to the public website files. They are uploaded to the members database
(agents/tools/members_push.py, needs SUPABASE_URL + SUPABASE_SERVICE_KEY). The public site only gets a teaser
(docs/data/picks_public.json: counts, sectors, update time — no company names).
"""
import os, sys, re, json, datetime as dt
sys.path.insert(0, os.path.dirname(__file__))
from lrcdata import P, load, now_sast

GROUP_WHY = {
    'valuation': ('Valuation', 'priced below its sector peers on our valuation readings'),
    'growth': ('Growth', 'sales and earnings growing faster than its sector'),
    'profitability': ('Profitability', 'margins and returns on capital above its sector'),
    'health': ('Balance sheet', 'low debt and strong cash position'),
    'income': ('Dividends', 'a dividend well covered by earnings'),
    'sentiment': ('Market view', 'professional analysts positive, estimates rising'),
    'technical': ('Price trend', 'share price in an uptrend with buying volume'),
}
GROUP_RISK = {
    'valuation': 'not cheap versus its sector', 'growth': 'growth slower than its sector', 'profitability': 'margins below its sector',
    'health': 'balance sheet weaker than peers', 'income': 'little or no dividend', 'sentiment': 'analysts lukewarm',
    'technical': 'price trend not yet confirmed',
}


def days_to(d, today):
    try: return (dt.date.fromisoformat(d[:10]) - today).days
    except Exception: return None


def liquid(r, rules):
    mk = rules['markets'].get(r.get('m'))
    if not mk: return False
    return ((r.get('vt') or 0) >= mk['min_value_traded'] and (r.get('mcap') or 0) >= mk['min_market_cap']
            and (r.get('px') or 0) >= mk['min_price'] and r.get('liq') != 'thin' and not r.get('stale'))


def why_and_risk(r, kind):
    g = r.get('grp') or {}
    ranked = sorted(((v, k) for k, v in g.items() if v is not None), reverse=True)
    why = [{'area': GROUP_WHY[k][0], 'text': GROUP_WHY[k][1], 'score': v} for v, k in ranked if v >= 60 and k in GROUP_WHY][:3]
    risk = [{'area': GROUP_WHY[k][0], 'text': GROUP_RISK[k], 'score': v} for v, k in sorted(ranked)[:2] if v < 50 and k in GROUP_RISK]
    return why, risk


def pick(rows, kind, rules, today):
    R = rules[kind]; out = {}
    for m in rules['markets']:
        cands = []
        for r in rows:
            if r.get('m') != m or not liquid(r, rules): continue
            dn = days_to(r['ne'], today) if r.get('ne') else None
            if dn is not None and 0 <= dn <= R['no_results_within_days']: continue
            if kind == 'trading':
                tp = r.get('tp') or {}
                if r.get('v') not in R['ratings']: continue
                if (tp.get('trend') or 0) < R['min_trend'] or (tp.get('extension') or 0) < R['min_extension']: continue
                if r.get('rsi') is None or not (R['rsi_range'][0] <= r['rsi'] <= R['rsi_range'][1]): continue
                key = r.get('score') or 0
            else:
                inv = r.get('inv') or {}
                if r.get('iv_v') not in R['ratings'] or inv.get('g') not in R['quality_grades']: continue
                if r.get('val') in R['exclude_valuation']: continue
                if ((r.get('grp') or {}).get('health') or 0) < R['min_health_score']: continue
                if (inv.get('mos') or 0) < R['min_margin_of_safety']: continue
                key = r.get('iv_score') or 0
            cands.append((key, r))
        cands.sort(key=lambda x: (-x[0], -(x[1].get('vt') or 0)))
        chosen, per_sec = [], {}
        for key, r in cands:
            s = r.get('sec') or 'Other'
            if per_sec.get(s, 0) >= rules['max_per_sector']: continue
            per_sec[s] = per_sec.get(s, 0) + 1
            why, risk = why_and_risk(r, kind)
            raw = r.get('raw') or {}
            chosen.append({
                'kind': kind, 'market': m, 'rank': len(chosen) + 1, 'ticker': r['t'], 'name': r.get('n'), 'sector': s, 'industry': r.get('ind'),
                'currency': r.get('cur'), 'price': r.get('px'), 'market_cap': r.get('mcap'), 'value_traded': r.get('vt'), 'rel_volume': r.get('rv'),
                'grade': r.get('v') if kind == 'trading' else r.get('iv_v'), 'score': key,
                'trading_grade': r.get('v'), 'trading_score': r.get('score'), 'investment_grade': r.get('iv_v'), 'investment_score': r.get('iv_score'),
                'quality': (r.get('inv') or {}).get('g'), 'valuation': r.get('val'), 'groups': r.get('grp'), 'why': why, 'risks': risk,
                'note': r.get('v_note') if kind == 'trading' else r.get('iv_note'),
                'results_date': r.get('ne'), 'dividend_yield': raw.get('div_yield'), 'perf_1m': r.get('p1m'), 'perf_6m': r.get('p6m'), 'perf_ytd': r.get('ytd'),
                'rsi': r.get('rsi'), 'news': []})
            if len(chosen) >= rules['per_market']: break
        out[m] = chosen
    return out


def attach_news(picks):
    try:
        import company_intel
    except Exception:
        company_intel = None
    for p in picks:
        d = load(P('docs', 'data', 'intel', f"{p['ticker']}.json"))
        items = (d or {}).get('news') or []
        if not items and company_intel:
            try: items = company_intel.news_for(p['ticker'], p['name'], p['market'])
            except Exception as e: print('  news', p['ticker'], repr(e)[:60])
        # keep recent headlines that are clearly about this company (name or ticker in the headline)
        stop = {'ltd', 'limited', 'group', 'holdings', 'holding', 'inc', 'inc.', 'corp', 'corporation', 'plc', 'co', 'company', 'the', 'sa'}
        words = [w for w in (p['name'] or '').replace(',', ' ').split() if w.lower() not in stop]
        keys = {' '.join(words[:2]).lower(), p['ticker'].replace('.JO', '').lower()} if len(words) > 1 else {(words[0] if words else '').lower(), p['ticker'].replace('.JO', '').lower()}
        GENERIC = {'momentum', 'discovery', 'capital', 'growth', 'value', 'life', 'sun', 'target', 'gap', 'standard', 'first', 'advance', 'fortress', 'pick', 'spar', 'super', 'block', 'alphabet'}
        if len(words) == 1:
            keys.add(' '.join((p['name'] or '').lower().split()[:2]))
            if words[0].lower() in GENERIC: keys.discard(words[0].lower())
        cutoff = (now_sast() - dt.timedelta(days=45)).isoformat()
        keys = {k for k in keys if len(k) >= 3}
        good = [n for n in items if (n.get('published') or '9999') >= cutoff[:10] and any(re.search(r'(?<![a-z])' + re.escape(k) + r'(?![a-z])', (n.get('title') or '').lower()) for k in keys)]
        p['news'] = [{k: n.get(k) for k in ('title', 'url', 'source', 'published')} for n in good[:4]]


def build():
    rules = load(P('agents', 'config', 'top_picks.json'))
    scan = load(P('docs', 'data', 'scan', 'stocks.json'))
    today = now_sast().date()
    rows = scan['rows']
    trading, invest = pick(rows, 'trading', rules, today), pick(rows, 'investment', rules, today)
    picks = [p for d in (trading, invest) for m in d for p in d[m]]
    return {'generated': now_sast().isoformat(timespec='minutes'), 'scanner_run': scan.get('generated'), 'as_of': scan.get('as_of'),
            'rules': {k: v for k, v in rules.items() if not k.startswith('_')}, 'picks': picks}


def main():
    out = build()
    attach_news(out['picks'])
    # private copy for the upload step — outside docs/ and ignored by git
    os.makedirs(P('agents', 'work', 'private'), exist_ok=True)
    json.dump(out, open(P('agents', 'work', 'private', 'top_picks.json'), 'w'), indent=1, default=str)
    # public teaser: no company names
    teaser = {'generated': out['generated'], 'counts': {}, 'sectors': sorted({p['sector'] for p in out['picks']}),
              'note': 'LRC Top Picks are for members. Create a free account to see them.'}
    for p in out['picks']:
        teaser['counts'].setdefault(p['market'], {}).setdefault(p['kind'], 0)
        teaser['counts'][p['market']][p['kind']] += 1
    json.dump(teaser, open(P('docs', 'data', 'picks_public.json'), 'w'), indent=1)
    for p in out['picks']:
        print(f"  {p['kind']:<10} {p['market']:<3} #{p['rank']} {p['ticker']:<8} {p['grade']:<10} score {p['score']}  {p['sector']}  traded/day {p['value_traded']/1e6:,.0f}m")
    print('top picks:', teaser['counts'])


if __name__ == '__main__':
    main()
