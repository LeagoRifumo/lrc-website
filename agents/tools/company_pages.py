#!/usr/bin/env python3
"""LRC company pages for search engines (runs daily after the financial statements job).
One static, crawlable page per company in the LRC Stock Scanner: docs/shares/<slug>.html
  * unique title, description, keywords, canonical, Open Graph, JSON-LD (BreadcrumbList, WebPage about Corporation, FAQPage)
  * company profile, LRC scores and grades, key ratios vs sector and market, financial statement highlights (5+ years),
    dividends, results date, peers (internal links), FAQ
  * live price is filled in by the page script from the latest scan; the interactive one-page summary is linked
Pages follow SAFE MODE (scores and grades, no BUY/SELL wording, no targets) like the other public pages.
A page is rebuilt when it is missing, older than 7 days, or the company's statements were refreshed since.
Also writes docs/shares/index.html (A-Z of every company) and adds every page to docs/sitemap.xml."""
import os, re, json, html, datetime as dt

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = lambda *a: os.path.join(ROOT, *a)
SITE = 'https://www.leagorifumocapital.co.za/'
OUT = P('docs', 'shares')
SAST = dt.timezone(dt.timedelta(hours=2))
E = lambda s: html.escape(str(s if s is not None else ''), quote=True)
GRADE = {'STRONG BUY': 'Top scoring', 'BUY': 'Strong', 'HOLD': 'Average', 'SELL': 'Weak', 'STRONG SELL': 'Lowest scoring'}
GROUPS = [('valuation', 'Valuation'), ('growth', 'Growth'), ('profitability', 'Profitability'), ('health', 'Financial health'), ('income', 'Income'), ('sentiment', 'Sentiment'), ('technical', 'Technical')]
KEY_RATIOS = ['tpe', 'fpe', 'peg', 'pb', 'ps', 'pfcf', 'ev_ebitda', 'gross_margin', 'op_margin', 'profit_margin', 'roe', 'roa', 'rev_growth', 'eps_growth', 'de', 'current_ratio', 'div_yield', 'payout']
FS_LINES = [('rev', 'Revenue'), ('gp', 'Gross profit'), ('op', 'Operating income'), ('ni', 'Net income'), ('eps', 'EPS (diluted)'), ('ta', 'Total assets'), ('tl', 'Total liabilities'),
            ('eq', "Shareholders' equity"), ('debt', 'Total debt'), ('cfo', 'Cash from operations'), ('capex', 'Capital expenditure'), ('fcf', 'Free cash flow'), ('div', 'Dividends paid')]
PCT_KEYS = {'div_yield', 'payout', 'short_float', 'insiders', 'inst', 'gross_margin', 'op_margin', 'profit_margin', 'roe', 'roa', 'fcf_margin', 'rev_growth', 'eps_growth', 'eps_growth_fwd', 'eps_growth_next', 'rev_cagr3', 'eps_cagr3'}


def load(p, d=None):
    try: return json.load(open(p, encoding='utf-8'))
    except Exception: return d


def slug(t):
    return re.sub(r'[^a-z0-9-]+', '-', t.lower().replace('.jo', '-jse').replace('^', '')).strip('-')


def tk(t): return t.replace('.JO', '')


def cur_sym(c): return {'ZAR': 'R', 'USD': '$', 'GBP': '£', 'EUR': '€'}.get(c, (c or '') + ' ')


def ok(x):
    return isinstance(x, (int, float)) and x == x and abs(x) != float('inf')


def money(x, c):
    if not ok(x): return '—'
    a = abs(x); s = f'{x / 1e12:.2f}T' if a >= 1e12 else f'{x / 1e9:.1f}B' if a >= 1e9 else f'{x / 1e6:.0f}M' if a >= 1e6 else f'{x:,.0f}'
    return cur_sym(c) + s


def fmt_r(k, f, v):
    if not ok(v): return '—'
    if k in PCT_KEYS or f == 'p': return f'{v * 100:.1f}%' if abs(v) < 0.1 else f'{v * 100:.0f}%'
    if f == 'x': return 'neg.' if v <= 0 else f'{v:.1f}x'
    if f == 'de' or k == 'de': return f'{v / 100:.2f}x'
    return f'{v:.2f}'


def pc(x, d=1):
    return '—' if not ok(x) else ('+' if x >= 0 else '') + f'{x * 100:.{d}f}%'


def head(title, desc, kw, canon, jsonld, depth='../'):
    ld = ''.join(f'<script type="application/ld+json">{json.dumps(j, ensure_ascii=False)}</script>' for j in jsonld)
    return f'''<!doctype html>
<html lang="en-ZA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{E(title)}</title>
<meta name="description" content="{E(desc)}">
<meta name="keywords" content="{E(kw)}">
<meta name="author" content="Leago Rifumo Capital">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta name="geo.region" content="ZA-MP"><meta name="geo.placename" content="Ermelo, Mpumalanga">
<meta property="og:site_name" content="Leago Rifumo Capital"><meta property="og:locale" content="en_ZA">
<meta property="og:title" content="{E(title)}">
<meta property="og:description" content="{E(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="{E(canon)}">
<meta property="og:image" content="{SITE}assets/img/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="{E(canon)}">
<meta name="theme-color" content="#07080C">
{ld}
<link rel="icon" type="image/png" href="{depth}assets/img/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;0,700;1,600&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{depth}assets/css/style.css?v={ASSET_V}">
</head>
<body>
'''


def chrome():
    """Header/footer from the article template (paths already ../)."""
    tpl = open(P('agents', 'templates', 'article.html'), encoding='utf-8').read()
    a = tpl.index('<header class="site-header">'); b = tpl.index('<main>')
    c = tpl.index('</main>') + len('</main>'); d_ = tpl.index('<script>window.LRC_DATA')
    foot = tpl[c:d_]
    return tpl[a:b], foot


def fs_table(fs, c):
    A = (fs or {}).get('annual') or {}
    dates, rows = A.get('dates') or [], A.get('rows') or {}
    if not dates: return '', 0
    dates = dates[-6:]; off = len(A['dates']) - len(dates)
    big = max([abs(v) for k in ('ta', 'rev') for v in (rows.get(k) or []) if ok(v)] or [0])
    U, un = (1e9, 'billions') if big >= 5e10 else (1e6, 'millions')
    cur = fs.get('cur') or c
    th = ''.join(f'<th class="n">FY{d[:4]}</th>' for d in dates)
    body = ''
    for k, l in FS_LINES:
        vals = (rows.get(k) or [])[off:]
        if not any(ok(v) for v in vals): continue
        cells = ''
        for v in vals:
            if not ok(v): cells += '<td class="n">—</td>'; continue
            x = v if k == 'eps' else v / U
            s = f'{abs(x):,.2f}' if k == 'eps' else f'{abs(x):,.1f}' if abs(x) < 10 else f'{abs(x):,.0f}'
            cells += f'<td class="n">{"(" + s + ")" if v < 0 else s}</td>'
        body += f'<tr{" class=fs-b" if k in ("rev", "ni", "fcf", "eq") else ""}><td>{E(l)}</td>{cells}</tr>'
    return (f'<div class="tbl-wrap"><table class="wl fs-tbl"><thead><tr><th>{E(cur)} {un}</th>{th}</tr></thead><tbody>{body}</tbody></table></div>', len(A['dates']))


def build_page(d, fs, intel, peers, head_html, foot_html, today):
    r, f, pr, t = d['row'], d.get('f') or {}, d.get('profile') or {}, d.get('tech') or {}
    X = d.get('context') or {}
    T, nm, c, mk = r['t'], r['n'], r.get('cur') or 'USD', r['m']
    mkt = 'JSE' if mk == 'JSE' else 'New York'
    exch = 'JSE' if mk == 'JSE' else 'NYSE / Nasdaq'
    sym = cur_sym(c)
    s = slug(T); canon = f'{SITE}shares/{s}.html'
    word = 'share' if mk == 'JSE' else 'stock'
    title = f'{nm} ({tk(T)}) {word.title()} Analysis, Price & Financial Statements | {exch} | Leago Rifumo Capital'
    if len(title) > 95: title = f'{nm} ({tk(T)}) {word.title()} Analysis & Financials | LRC'
    gr, igr = GRADE.get(r.get('v'), 'Average'), GRADE.get(r.get('iv_v'), 'Average')
    val = (r.get('val') or 'FAIR VALUE').lower()
    fpe = f.get('fpe'); sfpe = (d.get('sector_medians') or {}).get('fpe')
    years = len(((fs or {}).get('annual') or {}).get('dates') or [])
    desc = (f"{nm} ({tk(T)}) on the {exch}: share price {sym}{t.get('price', 0):,.2f}, LRC Trading score {r.get('score')}/100 and Investment score {r.get('iv_score')}/100, "
            f"{'forward P/E ' + format(fpe, '.1f') + 'x vs sector ' + format(sfpe, '.1f') + 'x, ' if ok(fpe) and fpe > 0 and ok(sfpe) else ''}"
            f"{str(years) + ' years of ' if years else ''}financial statements, dividends and results dates. Updated automatically.")
    kw = ', '.join([f'{nm} share price', f'{tk(T)} share price', f'{tk(T)} stock', f'{nm} analysis', f'{nm} financial statements', f'{nm} results', f'{nm} dividend',
                    f'{tk(T)} {"JSE" if mk == "JSE" else "stock forecast"}', f'{r.get("sec", "")} shares {mkt}', 'Leago Rifumo Capital'])
    what = (pr.get('summary') or '').strip()
    # readings vs sector / market
    rd, defs = r.get('rd') or {}, {x['k']: x for x in d.get('readings_def') or []}
    MS, MM = (d.get('medians') or {}).get('sector') or {}, (d.get('medians') or {}).get('market') or {}
    ratio_rows = ''
    for k in KEY_RATIOS:
        dfn = defs.get(k) or {'l': k, 'f': 'p' if k in PCT_KEYS else 'r'}
        v = (rd.get(k) or [None])[0] if k in rd else f.get(k)
        if not ok(v): continue
        p_ = (rd.get(k) or [None, None])[1] if k in rd else None
        tag = '<span class="rchip rp1">better than sector</span>' if p_ and p_ > 0 else '<span class="rchip rm1">worse than sector</span>' if p_ and p_ < 0 else '<span class="rchip r0">in line</span>' if p_ == 0 else ''
        ratio_rows += f'<tr><td>{E(dfn["l"])}</td><td class="n"><b>{fmt_r(k, dfn["f"], v)}</b></td><td class="n">{fmt_r(k, dfn["f"], MS.get(k))}</td><td class="n">{fmt_r(k, dfn["f"], MM.get(k))}</td><td>{tag}</td></tr>'
    pos = sorted([(k, v) for k, v in rd.items() if v and len(v) > 2 and v[1] and v[1] > 0 and k in defs], key=lambda x: -(x[1][2] or 0))[:3]
    neg = sorted([(k, v) for k, v in rd.items() if v and len(v) > 2 and v[1] and v[1] < 0 and k in defs], key=lambda x: (x[1][2] or 0))[:3]
    ph = lambda k, v: f'{defs[k]["l"]} {fmt_r(k, defs[k]["f"], v[0])}' + (f' vs sector {fmt_r(k, defs[k]["f"], MS.get(k))}' if ok(MS.get(k)) and k not in ('trend', 'setup', 'momentum') else '')
    grp = r.get('grp') or {}
    grp_rows = ''.join(f'<div class="fbar"><span>{l}</span><i><b style="width:{grp.get(k) or 0}%;background:{"#0F9D58" if (grp.get(k) or 0) >= 60 else "#9AA0A6" if (grp.get(k) or 0) >= 40 else "#C5221F"}"></b></i><em>{grp.get(k) if grp.get(k) is not None else "—"}</em></div>' for k, l in GROUPS)
    fs_html, fs_years = fs_table(fs, c)
    divs = (d.get('dividends') or [])[-6:]
    div_txt = ', '.join(f'{x["date"]}: {x["amount"]:,.0f}c' if mk == 'JSE' else f'{x["date"]}: ${x["amount"]:.2f}' for x in reversed(divs) if ok(x.get('amount')))
    peer_links = ''.join(f'<a class="chip-l" href="{slug(p["t"])}.html">{E(p["n"])} <small>{E(tk(p["t"]))}</small></a>' for p in peers)
    news = (intel or {}).get('news') or []
    news_html = ''.join(f'<li><a href="{E(n["url"])}" target="_blank" rel="noopener nofollow">{E(n["title"])}</a> <small>— {E(n.get("source", ""))}{", " + E((n.get("published") or "")[:10]) if n.get("published") else ""}</small></li>' for n in news[:6])
    rank = f'number {X["mkt_rank"]} of {X["mkt_n"]} by market value in our {mkt} universe' if X.get('mkt_rank') else ''
    # FAQ
    faq = []
    if what: faq.append((f'What does {nm} do?', what.split('. ')[0].rstrip('.') + '.'))
    if ok(f.get('tpe')) or ok(fpe):
        faq.append((f'What is the P/E ratio of {nm}?', f'{nm} trades on {fmt_r("tpe", "x", f.get("tpe"))} trailing earnings' + (f' and {fpe:.1f}x forward earnings' if ok(fpe) and fpe > 0 else '') +
                    (f', against a median of {sfpe:.1f}x for {r.get("sec")} companies on the {mkt} market.' if ok(sfpe) else '.') + f' Data as of {today}.'))
    if ok(f.get('div_yield')) and f['div_yield'] > 0: faq.append((f'Does {nm} pay a dividend?', f'Yes. The dividend yield is {f["div_yield"] * 100:.1f}%' + (f' and the last ex-dividend date was {f["ex_div"]}.' if f.get('ex_div') else '.')))
    else: faq.append((f'Does {nm} pay a dividend?', f'{nm} does not pay a regular dividend on the latest data.'))
    if f.get('next_earnings'): faq.append((f'When does {nm} report results?', f'The next results are expected on {f["next_earnings"]}.'))
    faq.append((f'How does LRC score {nm}?', f'The LRC Stock Scanner scores {nm} {r.get("score")}/100 for 3–12 months ({gr.lower()}) and {r.get("iv_score")}/100 for 5–10 years ({igr.lower()}), from 37 readings compared with {r.get("sec")} companies on the {mkt} market. On our models the shares look {val} (model estimate). Scores describe the data and are not a recommendation.'))
    faq_html = ''.join(f'<details class="faq"><summary>{E(q)}</summary><p>{E(a)}</p></details>' for q, a in faq)
    jsonld = [
        {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': SITE},
            {'@type': 'ListItem', 'position': 2, 'name': 'Shares A–Z', 'item': SITE + 'shares/'},
            {'@type': 'ListItem', 'position': 3, 'name': f'{nm} ({tk(T)})', 'item': canon}]},
        {'@context': 'https://schema.org', '@type': 'WebPage', 'name': title, 'url': canon, 'description': desc, 'dateModified': today, 'inLanguage': 'en-ZA',
         'publisher': {'@type': 'Organization', 'name': 'Leago Rifumo Capital', 'url': SITE},
         'about': {'@type': 'Corporation', 'name': nm, 'tickerSymbol': f'{"JSE" if mk == "JSE" else "NYSE/NASDAQ"}:{tk(T)}', **({'url': pr['website']} if pr.get('website') else {})}},
        {'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in faq]},
    ]
    hd = head(title, desc, kw, canon, jsonld)
    body = f'''{head_html}<main>
<section class="page-hero co-hero"><div class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="../index.html">Home</a> › <a href="index.html">Shares A–Z</a> › <a href="index.html#{mk.lower()}">{mkt}</a> › <span>{E(nm)}</span></nav>
  <span class="eyebrow">{E(mkt)} · {E(r.get("sec") or "")}{" · " + E(r.get("ind")) if r.get("ind") else ""}</span>
  <h1>{E(nm)} <span class="gold">({E(tk(T))})</span> {word} analysis</h1>
  <p class="lead">Share price, LRC scores, ratios against peers and {str(fs_years) + " years of " if fs_years else ""}financial statements for {E(nm)} — updated automatically from the LRC Stock Scanner.</p>
  <div class="co-live" id="coLive" data-t="{E(T)}"><b>{sym}{t.get("price", 0):,.2f}</b> <span class="{"up" if (t.get("chg_1d") or 0) >= 0 else "dn"}">{pc(t.get("chg_1d"))}</span> <small>close {E(t.get("date") or "")}</small></div>
  <div class="co-cta"><a class="btn btn-gold" href="../stock.html?t={E(T)}">Open the one-page summary</a><a class="btn btn-ghost" href="../analyzer.html?t={E(T)}">Analyse every ratio</a><a class="btn btn-ghost" href="../stock.html?t={E(T)}#fsSec">Full financial statements</a><a class="btn btn-ghost" href="../scanner.html">LRC Stock Scanner</a></div>
</div></section>
<section style="padding-top:26px"><div class="wrap co-grid">
  <div class="th-card th-wide"><h2>About {E(nm)}</h2><p>{E(what) or E(nm) + " is listed on the " + mkt + "."}</p>
    <p>{E(nm)} is in the {E(r.get("sec") or "")}{" · " + E(r.get("ind")) if r.get("ind") else ""} industry{", " + E(rank) if rank else ""}{", based in " + E(pr.get("country")) if pr.get("country") else ""}. Market value {money(f.get("mcap"), c)}; 52-week range {sym}{(t.get("lo52") or 0):,.2f} – {sym}{(t.get("hi52") or 0):,.2f}.</p></div>
  <div class="th-card"><h2>LRC scores</h2>
    <p><b>Trading (3–12 months):</b> {r.get("score")}/100 · {gr}<br><b>Investment (5–10 years):</b> {r.get("iv_score")}/100 · {igr}<br><b>Valuation:</b> {E(val)} (model estimate)</p>
    <div class="fbars co-fbars">{grp_rows}</div>
    <p class="th-foot">Group scores 0–100 (50 = neutral), from 37 readings against {E(r.get("sec") or "")} companies on the {mkt} market.</p></div>
  <div class="th-card"><h2>Strengths &amp; weaknesses</h2>
    <h3>Strengths</h3><ul>{"".join(f"<li>{E(ph(k, v))}</li>" for k, v in pos) or "<li>No standout strength in the data.</li>"}</ul>
    <h3>Weaknesses</h3><ul>{"".join(f"<li>{E(ph(k, v))}</li>" for k, v in neg) or "<li>No major weakness in the data.</li>"}</ul>
    <p class="th-foot">Performance: {pc(t.get("perf_1m"), 0)} in a month, {pc(t.get("perf_6m"), 0)} in 6 months, {pc(t.get("perf_ytd"), 0)} this year.</p></div>
  <div class="th-card th-wide"><h2>{E(nm)} ratios vs peers</h2>
    <div class="tbl-wrap"><table class="wl fs-tbl"><thead><tr><th>Ratio</th><th class="n">{E(tk(T))}</th><th class="n">Sector median</th><th class="n">{mkt} median</th><th>Verdict</th></tr></thead><tbody>{ratio_rows}</tbody></table></div></div>
  {f'<div class="th-card th-wide"><h2>{E(nm)} financial statements (annual)</h2>{fs_html}<p class="th-foot">Highlights of the income statement, balance sheet and cash flow. <a href="../stock.html?t={E(T)}#fsSec">See every line, quarterly figures, ratios and the CSV download →</a> Sources: {E("; ".join((fs or {}).get("src") or []))}.</p></div>' if fs_html else ''}
  <div class="th-card"><h2>Dividends &amp; results</h2><p><b>Dividend yield:</b> {fmt_r("div_yield", "p", f.get("div_yield"))}{" · payout " + fmt_r("payout", "p", f.get("payout")) if ok(f.get("payout")) else ""}<br><b>Recent dividends:</b> {E(div_txt) or "none on record"}<br><b>Next results:</b> {E(f.get("next_earnings") or "not announced yet")}</p>
    <p><a href="../dividends.html">Dividend calendar →</a> · <a href="../earnings.html">Earnings calendar →</a></p></div>
  <div class="th-card"><h2>Peers on the {mkt}</h2><div class="chips-l">{peer_links or "—"}</div><p class="th-foot"><a href="index.html">All companies A–Z →</a></p></div>
  {f'<div class="th-card th-wide"><h2>Latest {E(nm)} news</h2><ul>{news_html}</ul></div>' if news_html else ''}
  <div class="th-card th-wide"><h2>{E(nm)} — questions &amp; answers</h2>{faq_html}</div>
  <p class="th-foot th-wide">Page built {E(today)} from the LRC Stock Scanner; prices and scores refresh twice every weekday and statements weekly. Scores and grades describe the data — they are not a recommendation to buy or sell. <b>Educational only — not financial advice.</b></p>
</div></section>
</main>
{foot_html}<script>window.LRC_DATA = "../data/";</script>
<script src="../assets/js/main.js?v={MAIN_V}"></script>
<script>(()=>{{const el=document.getElementById('coLive');if(!el)return;fetch('../data/scan/t/'+el.dataset.t+'.json?v='+Math.floor(Date.now()/6e5)).then(r=>r.json()).then(d=>{{const t=d.tech||{{}},c=d.row.cur==='ZAR'?'R':'$';const ch=t.chg_1d||0;el.innerHTML='<b>'+c+Number(t.price).toLocaleString('en-ZA',{{minimumFractionDigits:2,maximumFractionDigits:2}})+'</b> <span class="'+(ch>=0?'up':'dn')+'">'+(ch>=0?'+':'')+(ch*100).toFixed(1)+'%</span> <small>close '+(t.date||'')+' · live from the LRC Stock Scanner</small>';}}).catch(()=>{{}});}})();</script>
</body>
</html>
'''
    return s, hd + body


def index_page(rows, head_html, foot_html, today):
    canon = SITE + 'shares/'
    title = 'JSE & US Shares A–Z — Share Analysis, Prices & Financial Statements | Leago Rifumo Capital'
    desc = f'Analysis pages for {len(rows)} JSE and New York companies: share prices, LRC scores, ratios against peers, 5+ years of financial statements, dividends and results dates. Updated automatically.'
    kw = 'JSE shares list, JSE share prices, JSE companies A-Z, US stocks A-Z, share analysis South Africa, financial statements JSE, Leago Rifumo Capital'
    jsonld = [{'@context': 'https://schema.org', '@type': 'CollectionPage', 'name': title, 'url': canon, 'description': desc},
              {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [{'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': SITE}, {'@type': 'ListItem', 'position': 2, 'name': 'Shares A–Z', 'item': canon}]}]
    secs = ''
    for mk, lbl in (('JSE', 'JSE (Johannesburg)'), ('US', 'New York (NYSE / Nasdaq)')):
        by = {}
        for r in rows:
            if r['m'] == mk: by.setdefault(r.get('sec') or 'Other', []).append(r)
        secs += f'<h2 id="{mk.lower()}" style="margin-top:34px">{lbl} <span class="gold">· {sum(len(v) for v in by.values())} companies</span></h2><div class="az-grid">'
        for sec in sorted(by):
            items = ''.join(f'<li data-q="{E((r["n"] + " " + r["t"]).lower())}"><a href="{slug(r["t"])}.html">{E(r["n"])}</a> <small>{E(tk(r["t"]))}</small></li>' for r in sorted(by[sec], key=lambda x: x['n'].lower()))
            secs += f'<div class="th-card"><h3>{E(sec)}</h3><ul class="az">{items}</ul></div>'
        secs += '</div>'
    hd = head(title, desc, kw, canon, jsonld)
    return hd + f'''{head_html}<main>
<section class="page-hero"><div class="wrap">
  <nav class="crumbs"><a href="../index.html">Home</a> › <span>Shares A–Z</span></nav>
  <span class="eyebrow">Shares A–Z</span><h1>JSE &amp; New York <span class="gold">share analysis</span></h1>
  <p class="lead">{E(desc)}</p>
  <input type="search" id="azQ" placeholder="Find a company or ticker (e.g. Sasol, NPN, AAPL)" class="az-q">
</div></section>
<section style="padding-top:10px"><div class="wrap">{secs}
<p class="th-foot">Updated {E(today)}. Educational only — not financial advice.</p></div></section>
</main>
{foot_html}<script>window.LRC_DATA = "../data/";</script>
<script src="../assets/js/main.js?v={MAIN_V}"></script>
<script>document.getElementById('azQ').addEventListener('input',e=>{{const q=e.target.value.trim().toLowerCase();document.querySelectorAll('.az li').forEach(li=>li.style.display=!q||li.dataset.q.includes(q)?'':'none');document.querySelectorAll('.az-grid .th-card').forEach(c=>c.style.display=[...c.querySelectorAll('li')].some(li=>li.style.display!=='none')?'':'none');}});</script>
</body>
</html>
'''


def asset_versions():
    s = open(P('docs', 'stock.html'), encoding='utf-8').read()
    a = re.search(r'style\.css\?v=([0-9.]+)', s); b = re.search(r'main\.js\?v=([0-9.]+)', s)
    return (a.group(1) if a else '1'), (b.group(1) if b else '1')


ASSET_V, MAIN_V = asset_versions()


def update_sitemap(rows, today):
    p = P('docs', 'sitemap.xml')
    try: xml = open(p, encoding='utf-8').read()
    except Exception: return
    xml = re.sub(r'\s*<url><loc>[^<]*(?:/shares/|stock\.html\?t=)[^<]*</loc>.*?</url>', '', xml)
    add = f'  <url><loc>{SITE}shares/</loc><lastmod>{today}</lastmod><changefreq>daily</changefreq></url>\n' + ''.join(
        f'  <url><loc>{SITE}shares/{slug(r["t"])}.html</loc><lastmod>{today}</lastmod><changefreq>weekly</changefreq></url>\n' for r in rows)
    xml = xml.replace('</urlset>', add + '</urlset>')
    open(p, 'w', encoding='utf-8').write(xml)


def main():
    sc = load(P('docs', 'data', 'scan', 'stocks.json'), {}) or {}
    rows = sc.get('rows') or []
    if not rows: print('no scanner rows'); return
    os.makedirs(OUT, exist_ok=True)
    head_html, foot_html = chrome()
    today = dt.datetime.now(SAST).date().isoformat()
    week = (dt.datetime.now(SAST).date() - dt.timedelta(days=7)).isoformat()
    force = os.environ.get('FORCE_PAGES') == '1'
    built = 0
    for r in rows:
        T = r['t']; fp = os.path.join(OUT, slug(T) + '.html')
        fs = load(P('docs', 'data', 'fs', T + '.json'))
        old = None
        if os.path.exists(fp):
            m = re.search(r'Page built (\d{4}-\d{2}-\d{2})', open(fp, encoding='utf-8').read())
            old = m.group(1) if m else None
        if not force and old and old >= week and not (fs and (fs.get('updated') or '') > old): continue
        d = load(P('docs', 'data', 'scan', 't', T.replace('^', '_') + '.json'))
        if not d: continue
        intel = load(P('docs', 'data', 'intel', T + '.json'))
        riv = [x['t'] for x in ((d.get('context') or {}).get('rivals') or [])]
        same = sorted([x for x in rows if x['m'] == r['m'] and x.get('sec') == r.get('sec') and x['t'] != T], key=lambda x: -(x.get('mcap') or 0))
        peers = [x for x in rows if x['t'] in riv] + [x for x in same if x['t'] not in riv]
        s, page = build_page(d, fs, intel, [{'t': x['t'], 'n': x['n']} for x in peers[:10]], head_html, foot_html, today)
        open(fp, 'w', encoding='utf-8').write(page); built += 1
    open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(index_page(rows, head_html, foot_html, today))
    update_sitemap(rows, today)
    print(f'company pages: {built} built, {len(rows)} companies, index + sitemap updated')


if __name__ == '__main__':
    main()
