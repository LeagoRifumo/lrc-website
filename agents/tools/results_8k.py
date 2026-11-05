#!/usr/bin/env python3
"""AFTER RESULTS (GitHub Action, free): reads each US company's results filing at the SEC and keeps what matters.

For every New York company in docs/data/earnings_log.json that reported in the last LOOKBACK days (market value >= $2bn or
tracked by the LRC Stock Scanner):
  1. finds the 8-K with Item 2.02 "Results of Operations" filed on or just after the results day (6-K for foreign companies),
  2. downloads the press release (Exhibit 99.1) and any further exhibits (99.2 = CFO commentary / prepared remarks / letter),
  3. pulls out, automatically:  revenue this quarter and a year ago (from the income-statement table, checked against the
     analysts' revenue estimate), the Outlook / Guidance section, and the guidance wording (raised / reaffirmed / lowered / given),
  4. writes docs/data/results/<TICKER>.json (last 8 reports per company; the Results Desk adds its written summary under "desk")
     and docs/data/results/index.json (what the earnings calendar can open),
  5. saves the plain text of the exhibits to agents/work/8k/<TICKER>_<date>.txt (tracked companies, kept 10 days) and the companies still waiting
     for a written summary to agents/work/results_queue.json, most important first.
Nothing here is an opinion: the automatic layer only repeats what the company filed.
"""
import sys, os, re, json, glob, html, time, threading, datetime as dt, urllib.request, gzip
from html.parser import HTMLParser
sys.path.insert(0, os.path.dirname(__file__))
from lrcdata import P, load, now_sast

UA = 'Leago Rifumo Capital research info@leagorifumocapital.co.za'
LOOKBACK = 10          # days back to look for results
MIN_CAP = 2.0          # $bn
KEEP_TXT_DAYS = 10
OUT = P('docs', 'data', 'results')
TXT = P('agents', 'work', '8k')
_lock = threading.Lock(); _last = [0.0]


def get(url, as_json=False):
    with _lock:                                    # SEC: max 10 requests a second
        w = 0.12 - (time.time() - _last[0])
        if w > 0: time.sleep(w)
        _last[0] = time.time()
    err = None
    for k in range(3):
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'gzip'}), timeout=30)
            b = r.read()
            b = gzip.decompress(b) if r.headers.get('Content-Encoding') == 'gzip' else b
            return json.loads(b) if as_json else b.decode('utf-8', 'replace')
        except Exception as e:
            err = e; time.sleep(1.5 * (k + 1))
    raise err


# ---------------------------------------------------------------- HTML -> paragraphs + tables
BLOCK = {'p', 'div', 'br', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'ul', 'ol', 'center'}


class Doc(HTMLParser):
    """Turns a press release into a list of blocks: ('p', text) paragraphs and ('table', [[cells]]) tables."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks, self.buf, self.tables, self.skip = [], [], [], 0
    def flush(self):
        t = re.sub(r'\s+', ' ', ''.join(self.buf)).strip(); self.buf = []
        if t: self.blocks.append(('p', t))
    def handle_starttag(self, tag, a):
        if tag in ('script', 'style'): self.skip += 1; return
        if tag == 'table':
            self.flush(); self.tables.append({'rows': [], 'row': None, 'cell': None}); return
        if self.tables:
            T = self.tables[-1]
            if tag == 'tr': T['row'] = []
            elif tag in ('td', 'th') and T['row'] is not None: T['cell'] = []
            return
        if tag in BLOCK: self.flush()
    def handle_endtag(self, tag):
        if tag in ('script', 'style'): self.skip = max(0, self.skip - 1); return
        if self.tables:
            T = self.tables[-1]
            if tag in ('td', 'th') and T['cell'] is not None and T['row'] is not None:
                T['row'].append(re.sub(r'\s+', ' ', ''.join(T['cell'])).strip()); T['cell'] = None
            elif tag == 'tr' and T['row'] is not None:
                if any(c for c in T['row']): T['rows'].append(T['row'])
                T['row'] = None
            elif tag == 'table':
                T = self.tables.pop()
                self.blocks.append(('table', T['rows']))
            return
        if tag in BLOCK: self.flush()
    def handle_data(self, d):
        if self.skip: return
        if self.tables:
            c = self.tables[-1]['cell']
            if c is not None: c.append(d)
            return
        self.buf.append(d)


def parse(htm):
    if not re.search(r'<(p|div|table|font)\b', htm, re.I):        # plain-text exhibit
        return [('p', re.sub(r'\s+', ' ', x).strip()) for x in re.split(r'\n\s*\n', htm) if x.strip()]
    d = Doc(); d.feed(htm); d.flush()
    out = []
    for kind, v in d.blocks:
        if kind == 'table':
            rows = [[c for c in r if c not in ('', '$', '%', ')')] for r in v]
            rows = [r for r in rows if r]
            # one-cell tables are usually layout boxes around text: treat as paragraphs
            if rows and max(len(r) for r in rows) <= 1:
                out += [('p', r[0]) for r in rows if r]
            elif rows:
                out.append(('table', rows))
        else:
            out.append((kind, v))
    return out


def to_text(blocks):
    lines = []
    for kind, v in blocks:
        lines.append(v if kind == 'p' else '\n'.join(' | '.join(r) for r in v) + '\n')
    return '\n'.join(lines)


# ---------------------------------------------------------------- numbers
NUM = re.compile(r'^\(?-?\$?\s*\(?\d[\d,]*(\.\d+)?\)?%?$')


def num(c):
    c = c.replace('$', '').replace(' ', '').replace('—', '').replace('–', '')
    if not NUM.match(c) or c.endswith('%'): return None
    neg = c.startswith('(') or c.startswith('-')
    try: v = float(c.strip('()-').replace(',', ''))
    except ValueError: return None
    return -v if neg else v


REV_LABEL = re.compile(r'^(total\s+)?(net\s+)?(operating\s+)?(revenues?|sales|net sales|revenues?,?\s*net|total net revenues?|total revenues? and other income)\s*(\(note.*\))?:?$', re.I)
SCALE = [(re.compile(r'in\s+billions', re.I), 1e9), (re.compile(r'in\s+millions|\$\s*millions|\(millions\)|millions of', re.I), 1e6),
         (re.compile(r'in\s+thousands|\$\s*thousands|\(thousands\)|thousands of', re.I), 1e3)]


def revenue(blocks, est=None, mcap=None):
    """Revenue this quarter and a year ago from the first income-statement-like table. Checked against the estimate."""
    ctx = ''
    for kind, v in blocks:
        if kind == 'p':
            ctx = (ctx + ' ' + v)[-600:]; continue
        tab_txt = ' '.join(' '.join(r) for r in v[:6])
        scale = next((s for rx, s in SCALE if rx.search(tab_txt) or rx.search(ctx)), None)
        for r in v:
            if not r or not REV_LABEL.match(r[0].strip()): continue
            vals = [x for x in (num(c) for c in r[1:]) if x is not None]
            if len(vals) >= 3 and float(vals[0]).is_integer() and vals[0] <= 40 and vals[1] > 20 * vals[0]:
                vals = vals[1:]                             # a "Note" column before the numbers
            if not vals or vals[0] <= 0: continue
            cands = [scale] if scale else [1e6, 1e3, 1, 1e9]
            for s in cands:
                cur = vals[0] * s
                ok = (0.6 <= cur / est <= 1.6) if est else bool(scale) and (not mcap or mcap / 500 <= cur <= mcap * 2)
                if ok:
                    prior = vals[1] * s if len(vals) > 1 and vals[1] > 0 else None
                    if prior and not (0.3 <= cur / prior <= 3): prior = None
                    return {'rev': cur, 'rev_prior': prior, 'label': r[0].strip(), 'checked_vs_estimate': bool(est)}
        ctx = ''
    return None


# ---------------------------------------------------------------- guidance
HEAD = re.compile(r'^(\W*)((business|financial|fiscal(\s+year)?(\s+20\d\d)?|full[- ]year(\s+20\d\d)?|20\d\d|q[1-4]|first|second|third|fourth|quarter|quarterly|annual|updated|company|outlook and)\s+)*(outlook|guidance|forecast|expectations)\b.{0,60}$', re.I)
SAFE = re.compile(r'forward[- ]looking statements|safe harbor|private securities litigation|non-gaap financial measures? (is|are) included|reconciliation of', re.I)
GUIDE = re.compile(r'\b(expects?|expected|anticipates?|outlook|guidance|reaffirm\w*|reiterat\w*|rais(es|ed|ing)|lower(s|ed|ing)?|narrow\w*|forecasts?|projected|now sees)\b', re.I)
BOILER = re.compile(r'^\W*(forward[- ]looking statements|safe harbou?r|cautionary (note|statement))|private securities litigation reform', re.I)
FWD = re.compile(r'\b(fourth|third|second|first|next|coming)\s+quarter|\bfull[- ]year|\bfiscal\s+(year\s+)?20\d\d|\bfiscal\s+20\d\d|\b(fy|q[1-4])\s?20?\d\d\b|\b20(2[6-9]|3\d)\b|\bfor the (year|quarter)', re.I)
HASNUM = re.compile(r'\$\s?\d|\d+(\.\d+)?\s?(%|percent|billion|million|cents?)|\d+\.\d+')
STATUS = [('raised', re.compile(r'\b(rais(es|ed|ing)|increas(es|ed|ing)|lift(s|ed)?|boost(s|ed)?)\b[^.]{0,60}\b(guidance|outlook|forecast|expectations)|\b(guidance|outlook)\b[^.]{0,40}\b(raised|increased)', re.I)),
          ('lowered', re.compile(r'\b(lower(s|ed|ing)|reduc(es|ed|ing)|cut(s|ting)?|trim(s|med)?)\b[^.]{0,60}\b(guidance|outlook|forecast|expectations)|\b(guidance|outlook)\b[^.]{0,40}\b(lowered|reduced|cut)', re.I)),
          ('narrowed', re.compile(r'\bnarrow(s|ed|ing)?\b[^.]{0,60}\b(guidance|outlook|range)', re.I)),
          ('reaffirmed', re.compile(r'\b(reaffirm\w*|reiterat\w*|maintain(s|ed|ing)?|confirm(s|ed|ing)?)\b[^.]{0,60}\b(guidance|outlook|forecast)', re.I)),
          ('initiated', re.compile(r'\b(initiat\w*|introduc\w*|provid(es|ed|ing) (initial|its first))\b[^.]{0,60}\b(guidance|outlook)', re.I)),
          ('withdrawn', re.compile(r'\b(withdr[ae]w\w*|suspend\w*)\b[^.]{0,60}\b(guidance|outlook)', re.I)),
          ('none', re.compile(r'\b(does not|do not|will not|no longer)\s+(provide|give|issue)\w*\b[^.]{0,40}\b(guidance|outlook)', re.I))]


def sentences(t):
    return [s.strip() for s in re.split(r'(?<=[.;])\s+(?=[A-Z(“"])', t) if s.strip()]


def guidance(blocks):
    """The Outlook / Guidance section (heading + what follows) and, failing that, forward-looking sentences with numbers."""
    section, heading, grab = [], None, 0
    for i, (kind, v) in enumerate(blocks):
        if kind == 'p' and len(v) <= 90 and HEAD.match(v) and not SAFE.search(v):
            if heading is None: heading = v.strip(' :'); grab = 1; continue
        if grab:
            if kind == 'p':
                if SAFE.search(v) and not BOILER.search(v) and len(v) < 400:
                    continue                                # "The following forward-looking statements reflect…" intro line
                if BOILER.search(v) or (len(v) <= 60 and not HASNUM.search(v) and section and not HEAD.match(v)) or sum(len(x) for x in section) > 2400:
                    grab = 0; continue
                section.append(v)
            else:
                rows = [' | '.join(r) for r in v if len(r) >= 2][:14]
                if rows and sum(len(x) for x in section) < 2400: section.append('\n'.join(rows))
                elif section: grab = 0
    lines = []
    if not section:
        for kind, v in blocks:
            if kind != 'p' or SAFE.search(v): continue
            for s in sentences(v):
                if GUIDE.search(s) and FWD.search(s) and HASNUM.search(s) and 25 < len(s) < 420:
                    lines.append(s)
            if len(lines) >= 6: break
    alltxt = ' '.join(section + lines) or ' '.join(v for k, v in blocks if k == 'p' and not SAFE.search(v))
    status = next((name for name, rx in STATUS if rx.search(alltxt)), None)
    if not status and (section or lines): status = 'given'
    return {'heading': heading, 'section': section[:12], 'lines': lines[:6], 'status': status or 'not found'}


# ---------------------------------------------------------------- SEC filings
def results_filing(cik, day):
    """The 8-K (Item 2.02) or 6-K filed from the day before to 3 days after the results day."""
    j = get(f'https://data.sec.gov/submissions/CIK{cik:010d}.json', True)
    r = j['filings']['recent']; d0 = dt.date.fromisoformat(day)
    best = None
    for i, form in enumerate(r['form']):
        fd = dt.date.fromisoformat(r['filingDate'][i])
        if not (-1 <= (fd - d0).days <= 3): continue
        items = r.get('items', [''] * len(r['form']))[i] or ''
        if form in ('8-K', '8-K/A') and '2.02' in items:
            return {'form': form, 'filed': r['filingDate'][i], 'acc': r['accessionNumber'][i], 'primary': r['primaryDocument'][i], 'items': items}
        if form == '6-K' and best is None:
            best = {'form': form, 'filed': r['filingDate'][i], 'acc': r['accessionNumber'][i], 'primary': r['primaryDocument'][i], 'items': ''}
    return best


def exhibits(cik, f):
    acc = f['acc']; base = f'https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace("-", "")}/'
    idx = get(base + acc + '-index.htm')
    docs = []
    for row in re.findall(r'<tr[^>]*>(.*?)</tr>', idx, re.S | re.I):
        cells = [re.sub(r'<[^>]+>', '', c).strip() for c in re.findall(r'<td[^>]*>(.*?)</td>', row, re.S | re.I)]
        href = re.search(r'href="([^"]+)"', row)
        if len(cells) >= 4 and href:
            typ, name = cells[3].upper(), href.group(1).split('/')[-1]
            if name.lower().endswith(('.htm', '.html', '.txt')):
                docs.append({'type': typ, 'desc': html.unescape(cells[1]), 'name': name, 'url': base + name})
    ex = [d for d in docs if d['type'].startswith('EX-99')]
    if not ex and f['form'] == '6-K':
        ex = [d for d in docs if d['type'].startswith('EX-') or d['type'] == '6-K'][:3]
    return base + acc + '-index.htm', docs, ex


# ---------------------------------------------------------------- main
def main():
    today = now_sast().date()
    log = load(P('docs', 'data', 'earnings_log.json'), {}) or {}
    stocks = {r['t']: r for r in load(P('docs', 'data', 'scan', 'stocks.json'), {}).get('rows', []) if r.get('m') == 'US'}
    lists = load(P('docs', 'data', 'scan', 'lists.json'), {}).get('lists', {})
    on_list = {x['t'] for l in lists.values() for v in l.values() if isinstance(v, list) for x in v if isinstance(x, dict) and 't' in x}
    covered = set(load(P('docs', 'data', 'ratings.json'), {}).get('ratings', {}))
    os.makedirs(OUT, exist_ok=True); os.makedirs(TXT, exist_ok=True)
    try:
        sys.path.insert(0, os.path.dirname(__file__)); import sec_quarters
        ciks = sec_quarters.cik_map()
    except Exception as e:
        print('SEC company list unavailable:', e); return
    todo = []
    for k, e in log.items():
        if e.get('m') != 'US' or not e.get('date'): continue
        d = dt.date.fromisoformat(e['date'])
        if not (0 <= (today - d).days <= LOOKBACK): continue
        t = e['t']
        if (e.get('market_cap_bn') or 0) < MIN_CAP and t not in stocks: continue
        pri = 3 if (t in on_list or t in covered) else 2 if t in stocks else 1
        todo.append((pri, e.get('market_cap_bn') or 0, t, e))
    todo.sort(key=lambda x: (-x[0], -x[1]))
    done = found = 0
    t0 = time.time(); budget = float(os.environ.get('RESULTS_BUDGET_MIN', '18')) * 60
    for pri, cap, t, e in todo:
        if time.time() - t0 > budget:
            print('  time budget reached — the rest is picked up next run'); break
        path = os.path.join(OUT, t + '.json')
        R = load(path, {}) or {'t': t, 'name': e.get('name'), 'm': 'US', 'reports': []}
        rep = next((r for r in R['reports'] if r['date'] == e['date']), None)
        if rep and rep.get('filing'):
            # already read; refresh the estimate fields only (they can arrive after the first read)
            continue
        if rep and rep.get('tries', 0) >= 6: continue
        cik = ciks.get(t.upper().replace('.', '-'))
        if not cik: continue
        rep = rep or {'date': e['date'], 'quarter': e.get('quarter'), 'tries': 0}
        rep['tries'] = rep.get('tries', 0) + 1
        try:
            f = results_filing(cik, e['date'])
        except Exception as ex_:
            print('  ', t, 'submissions failed', str(ex_)[:60]); continue
        done += 1
        if not f:
            if rep not in R['reports']: R['reports'].append(rep)
            save(path, R); continue
        if any((r.get('filing') or {}).get('index', '').endswith(f['acc'] + '-index.htm') for r in R['reports'] if r is not rep):
            rep['tries'] = 99                               # this filing belongs to another listed date: nothing new
            if rep not in R['reports']: R['reports'].append(rep)
            save(path, R); continue
        try:
            index_url, docs, ex = exhibits(cik, f)
        except Exception as ex_:
            print('  ', t, 'index failed', str(ex_)[:60]); continue
        blocks_all, texts = [], []
        for d in ex[:4]:
            try:
                b = parse(get(d['url']))
            except Exception:
                continue
            blocks_all.append((d, b)); texts.append(f"===== {d['type']} — {d['desc'] or d['name']} =====\n{to_text(b)}")
        if not blocks_all:
            continue
        found += 1
        main_blocks = blocks_all[0][1]
        rev_est = e.get('rev_est')
        rv = revenue(main_blocks, rev_est, (e.get('market_cap_bn') or 0) * 1e9 or None)
        g = guidance([x for _, b in blocks_all for x in b])
        paras = [v for k_, v in main_blocks[:60] if k_ == 'p' and 20 < len(v) < 240 and '@' not in v and not re.match(r'^(exhibit|ex-|for immediate release|contacts?\b|media|investor)', v, re.I)]
        title = next((v for v in paras if re.search(r'\b(reports?|announces?|results|quarter|earnings)\b', v, re.I)), paras[0] if paras else None)
        rep.update({'filing': {'form': f['form'], 'filed': f['filed'], 'items': f['items'], 'index': index_url,
                               'docs': [{'type': d['type'], 'desc': d['desc'], 'url': d['url']} for d in ex[:4]]},
                    'title': title, 'auto': {'revenue': rv, 'guidance': g}, 'read': now_sast().isoformat(timespec='minutes')})
        rep.pop('tries', None)
        if rep not in R['reports']: R['reports'].append(rep)
        R['reports'] = sorted(R['reports'], key=lambda r: r['date'])[-8:]
        R['name'] = e.get('name') or R.get('name')
        save(path, R)
        if pri >= 2 and (today - dt.date.fromisoformat(e['date'])).days <= 7:      # text for the Results Desk (tracked companies only)
            open(os.path.join(TXT, f"{t}_{e['date']}.txt"), 'w', encoding='utf-8').write('\n\n'.join(texts)[:60000])
        print(f"  {t} {e['date']} {f['form']} {len(ex)} exhibit(s) · revenue {'%.3gbn' % (rv['rev'] / 1e9) if rv else '—'} · guidance {g['status']}")
    for p in glob.glob(os.path.join(TXT, '*.txt')):       # keep 10 days of filing text
        m = re.search(r'_(\d{4}-\d{2}-\d{2})\.txt$', p)
        if m and (today - dt.date.fromisoformat(m.group(1))).days > KEEP_TXT_DAYS: os.remove(p)
    index_and_queue(stocks, on_list | covered)
    print(f'results_8k: {len(todo)} companies in window, {done} looked up, {found} filings read')


def save(path, R):
    json.dump(R, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))


def index_and_queue(stocks, prio):
    """docs/data/results/index.json (what the calendar can open) + agents/work/results_queue.json (waiting for a written summary)."""
    items, queue = {}, []
    today = now_sast().date()
    for p in glob.glob(os.path.join(OUT, '*.json')):
        if p.endswith('index.json'): continue
        R = load(p, {}) or {}
        reps = [r for r in R.get('reports', []) if r.get('filing') or r.get('desk')]
        if not reps: continue
        r = reps[-1]; t = R['t']
        g = ((r.get('desk') or {}).get('guidance') or {}).get('status') or ((r.get('auto') or {}).get('guidance') or {}).get('status')
        items[t] = {'date': r['date'], 'g': g, 'desk': bool(r.get('desk')), 'n': len(reps)}
        if not r.get('desk') and r.get('filing') and (today - dt.date.fromisoformat(r['date'])).days <= 7 and os.path.exists(os.path.join(TXT, f"{t}_{r['date']}.txt")):
            s = stocks.get(t, {})
            queue.append({'t': t, 'name': R.get('name'), 'm': R.get('m', 'US'), 'date': r['date'], 'text': f"agents/work/8k/{t}_{r['date']}.txt",
                          'priority': 3 if t in prio else 2 if s else 1, 'mcap_bn': round((s.get('mcap') or 0) / 1e9, 1)})
    sens = load(P('docs', 'data', 'jse_sens.json'), {}) or {}           # JSE: results announcements recorded from SENS
    jse = {r['t']: r for r in load(P('docs', 'data', 'scan', 'stocks.json'), {}).get('rows', []) if r.get('m') == 'JSE'}
    for x in sens.get('results', []):
        if not x.get('date') or (today - dt.date.fromisoformat(x['date'])).days > 7: continue
        R = load(os.path.join(OUT, x['t'] + '.json'), {}) or {}
        if any(r.get('date') == x['date'] and r.get('desk') for r in R.get('reports', [])): continue
        s = jse.get(x['t'], {})
        queue.append({'t': x['t'], 'name': x.get('name'), 'm': 'JSE', 'date': x['date'], 'period': x.get('period'), 'source': x.get('source'),
                      'priority': 3 if x['t'] in prio else 2, 'mcap_bn': round((s.get('mcap') or 0) / 1e9 / 18, 1)})
    queue.sort(key=lambda x: (-x['priority'], x['date'] < (today - dt.timedelta(days=3)).isoformat(), -x['mcap_bn']))
    json.dump({'updated': now_sast().isoformat(timespec='minutes'), 'items': dict(sorted(items.items()))},
              open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump({'updated': now_sast().isoformat(timespec='minutes'), 'queue': queue}, open(P('agents', 'work', 'results_queue.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)


if __name__ == '__main__':
    main()
