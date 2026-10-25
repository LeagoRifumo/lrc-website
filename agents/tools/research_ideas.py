#!/usr/bin/env python3
"""Companies worth researching — picked from the LRC Stock Scanner on every scanner run (docs/data/scan/research_ideas.json).

Per market (JSE and New York), up to 6 companies in each of four groups. A company appears in only one group, the first it fits:
  quality_value   Investment score 60+, quality grade A, valuation UNDERVALUED (model estimate): good businesses the models price below fair value
  top_scores      highest average of the Trading and Investment scores: the strongest all-round readings
  momentum        Breakout, Retest or Near-breakout chart setup with a Trading score of 60+: price action worth a closer look
  results_soon    results within 14 days and a Trading or Investment score of 60+: a dated event that will test the numbers
Each idea says why it was picked (its strongest groups vs sector) and links to the one-page summary.
Run on its own to rebuild from the latest stocks.json:  python agents/tools/research_ideas.py
"""
import json, os, datetime as dt

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SCAN = os.path.join(ROOT, 'docs', 'data', 'scan')
SAST = dt.timezone(dt.timedelta(hours=2))
N = 6
GNAME = {'valuation': 'valuation', 'growth': 'growth', 'profitability': 'profitability', 'health': 'financial health',
         'income': 'income', 'sentiment': 'sentiment', 'technical': 'technical'}
GROUPS = [
    ('quality_value', 'Value & quality', 'Quality grade A, an Investment score of 60 or more, and priced below the model\'s fair value (model estimate).'),
    ('top_scores', 'Score leaders', 'The highest combined Trading and Investment scores in the market.'),
    ('momentum', 'Technical setups', 'A breakout, retest or near-breakout on the chart, with a Trading score of 60 or more.'),
    ('results_soon', 'Earnings watch', 'Companies scoring 60 or more that report in the next 14 days.'),
]


def why(r):
    g = sorted(((k, v) for k, v in (r.get('grp') or {}).items() if v is not None), key=lambda kv: -kv[1])
    best = [f"{GNAME.get(k, k)} {v}" for k, v in g[:2] if v >= 60]
    weak = [f"{GNAME.get(k, k)} {v}" for k, v in g[-1:] if v < 45]
    s = ('Strongest: ' + ', '.join(best)) if best else 'No group stands out'
    return s + ('; weakest: ' + weak[0] if weak else '')


def card(r, extra=''):
    return {'t': r['t'], 'n': r['n'], 'sec': r['sec'], 'ind': r.get('ind'), 'cur': r['cur'], 'px': r['px'], 'chg': r.get('chg'),
            'score': r.get('score'), 'v': r.get('v'), 'iv_score': r.get('iv_score'), 'iv_v': r.get('iv_v'), 'val': r.get('val'),
            'setup': r.get('setup'), 'ne': r.get('ne'), 'q': (r.get('inv') or {}).get('g'), 'why': why(r) + (('. ' + extra) if extra else '') + '.'}


def build(rows, today=None):
    today = today or dt.datetime.now(SAST).date()
    soon = (today + dt.timedelta(days=14)).isoformat()
    out = {}
    for m in ('JSE', 'US'):
        rs = [r for r in rows if r.get('m') == m and r.get('px') and not r.get('stale')]
        used, res = set(), {}
        def take(key, cands, extra=lambda r: ''):
            lst = []
            for r in cands:
                if r['t'] in used or len(lst) >= N:
                    continue
                used.add(r['t']); lst.append(card(r, extra(r)))
            res[key] = lst
        avg = lambda r: ((r.get('score') or 50) + (r.get('iv_score') or 50)) / 2
        take('quality_value', sorted([r for r in rs if (r.get('iv_score') or 0) >= 60 and (r.get('inv') or {}).get('g') == 'A' and r.get('val') == 'UNDERVALUED'],
                                     key=lambda r: -(r.get('iv_score') or 0)))
        take('top_scores', sorted(rs, key=lambda r: -avg(r)))
        take('momentum', sorted([r for r in rs if r.get('setup') in ('Breakout', 'Retest', 'Near breakout') and (r.get('score') or 0) >= 60],
                                key=lambda r: -(r.get('score') or 0)), lambda r: f"Setup: {r['setup'].lower()}")
        take('results_soon', sorted([r for r in rs if r.get('ne') and today.isoformat() <= r['ne'] <= soon and max(r.get('score') or 0, r.get('iv_score') or 0) >= 60],
                                    key=lambda r: r['ne']), lambda r: f"Results {r['ne']}")
        out[m] = res
    return out


def payload(meta, rows):
    return {**{k: meta.get(k) for k in ('generated', 'as_of')}, 'groups': [{'key': k, 'title': t, 'rule': d} for k, t, d in GROUPS],
            'note': 'The LRC Focus List is selected automatically by the LRC Stock Scanner after every run. It is a starting point for your own research, not a recommendation to buy or sell.',
            'ideas': build(rows)}


if __name__ == '__main__':
    S = json.load(open(os.path.join(SCAN, 'stocks.json')))
    d = payload(S, S['rows'])
    json.dump(d, open(os.path.join(SCAN, 'research_ideas.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for m, g in d['ideas'].items():
        print(m, {k: [x['t'] for x in v] for k, v in g.items()})
