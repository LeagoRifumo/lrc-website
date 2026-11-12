#!/usr/bin/env python3
"""LRC Portfolio Desk (every 30 minutes, GitHub Actions).

For every company that members hold in their Portfolio Journal:
  * latest price and day move (Yahoo batch quote; covers names outside the LRC Scanner too)
  * company news (Yahoo Finance + Google News, same filters as the company intel desk)
  * next results date (LRC earnings calendars / scanner)
  * market-moving alerts: a day move of 5% or more, results today or tomorrow, and headlines about results,
    trading statements, guidance, CEO/CFO changes, deals, upgrades/downgrades, dividends, regulators or lawsuits
and writes them to the members database (table portfolio_news, readable only by signed-in members).
Then emails each member who holds the company and has 'Email me market-moving news' switched on (one email per run,
each alert sent once: table alert_log).

Needs GitHub secrets SUPABASE_URL + SUPABASE_SERVICE_KEY (already used by Top Picks). Email needs SMTP_HOST, SMTP_PORT,
SMTP_USER, SMTP_PASS and SMTP_FROM (e.g. a Brevo, Resend or Google Workspace mailbox). Without SMTP it still refreshes
prices and news and skips the emails. Member data never leaves the members database except the alert email to that member.
"""
import os, re, sys, json, ssl, hashlib, smtplib, html, urllib.request, urllib.parse, datetime as dt
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(__file__))
from yahoo import Yahoo
import company_intel as CI

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = lambda *a: os.path.join(ROOT, *a)
SAST = dt.timezone(dt.timedelta(hours=2))
URL, KEY = os.environ.get('SUPABASE_URL', '').rstrip('/'), os.environ.get('SUPABASE_SERVICE_KEY', '')
SITE = 'https://www.leagorifumocapital.co.za/'
MOVE = 0.05
HOT = re.compile(r'\b(results?|earnings|trading (statement|update)|profit warning|guidance|outlook|forecast|beats?|miss(es|ed)?|'
                 r'CEO|CFO|chief executive|resign\w*|steps? down|appoint\w*|acqui\w+|merger|takeover|buyout|bid|offer|deal|'
                 r'upgrade\w*|downgrade\w*|price target|dividend|special dividend|buyback|rights issue|SENS|cautionary|'
                 r'lawsuit|probe|investigation|SEC|FDA|recall|fine[ds]?|default|bankrupt\w*|delist\w*|suspend\w*|strike|plunge\w*|soar\w*|surge\w*|tumble\w*)\b', re.I)


def api(method, path, body=None, prefer=None):
    h = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
    if prefer: h['Prefer'] = prefer
    req = urllib.request.Request(f'{URL}/rest/v1/{path}', data=json.dumps(body).encode() if body is not None else None, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=30) as r:
        t = r.read()
        return json.loads(t) if t else None


def load(p, d=None):
    try: return json.load(open(p, encoding='utf-8'))
    except Exception: return d


def next_results(today):
    """ticker -> next results date from the LRC earnings calendars, then the scanner."""
    out = {}
    for f in ('earnings_us.json', 'earnings_jse.json'):
        for it in (load(P('docs', 'data', f)) or {}).get('items') or []:
            t = it.get('t') or it.get('ticker'); d = it.get('date')
            if not t or not d or d < today: continue
            if f == 'earnings_jse.json' and not t.endswith('.JO'): t += '.JO'
            if t not in out or d < out[t]: out[t] = d
    for r in (load(P('docs', 'data', 'scan', 'stocks.json')) or {}).get('rows') or []:
        d = r.get('ne')
        if isinstance(d, dict): d = d.get('date')
        if isinstance(d, str) and d >= today and r['t'] not in out: out[r['t']] = d[:10]
    return out


def main():
    if not URL or not KEY:
        print('::warning::portfolio_desk: SUPABASE_URL / SUPABASE_SERVICE_KEY not set — skipped.'); return
    try:
        pos = api('GET', 'portfolio_positions?select=user_id,ticker,name,market&closed_on=is.null&limit=20000') or []
    except urllib.error.HTTPError as e:
        print(f'::warning::portfolio_desk: positions table not ready ({e.code}). Run supabase/portfolio.sql once.'); return
    if not pos:
        print('portfolio_desk: no open positions yet.'); return
    now = dt.datetime.now(SAST); today = now.date().isoformat(); tomorrow = (now.date() + dt.timedelta(days=1)).isoformat()
    names = {}
    for p in pos: names.setdefault(p['ticker'], (p.get('name'), p.get('market') or ('JSE' if p['ticker'].endswith('.JO') else 'US')))
    tickers = sorted(names)
    print(f'portfolio_desk: {len(pos)} open positions, {len(tickers)} companies')

    # prices
    q = Yahoo().quotes(tickers + ['ZAR=X'])
    quotes = {}
    for s, x in q.items():
        px, ch = x.get('regularMarketPrice'), x.get('regularMarketChangePercent')
        if px is None: continue
        if x.get('currency') in ('ZAc', 'ZAC', 'GBp', 'GBX'): px = px / 100
        t = x.get('regularMarketTime')
        quotes[s] = {'px': round(px, 4), 'chg': round(ch / 100, 5) if ch is not None else None, 'cur': 'ZAR' if x.get('currency') in ('ZAc', 'ZAC', 'ZAR') else x.get('currency'),
                     'at': dt.datetime.fromtimestamp(t, SAST).isoformat(timespec='minutes') if t else None, 'name': x.get('longName') or x.get('shortName')}

    # news
    def nw(t):
        nm = names[t][0] or (quotes.get(t) or {}).get('name') or t
        try: return t, CI.news_for(t, nm, names[t][1])
        except Exception as e: print('  news', t, repr(e)[:80]); return t, []
    with ThreadPoolExecutor(6) as ex: news = dict(ex.map(nw, tickers))
    ne = next_results(today)

    # previous alerts (kept 72 hours)
    prev = {r['ticker']: r for r in (api('GET', 'portfolio_news?select=ticker,alerts&ticker=in.(' + ','.join(urllib.parse.quote(f'"{t}"') for t in tickers) + ')') or [])}
    cutoff = (now - dt.timedelta(hours=72)).isoformat()
    rows, fresh = [], {}
    for t in tickers:
        qd, items, short = quotes.get(t) or {}, news.get(t) or [], t.replace('.JO', '')
        al = {a['k']: a for a in ((prev.get(t) or {}).get('alerts') or []) if (a.get('at') or '') >= cutoff}
        new = []
        def add(k, text, url=None, at=None):
            if k in al: return
            a = {'k': k, 't': t, 'text': text, 'url': url, 'at': at or now.isoformat(timespec='minutes')}; al[k] = a; new.append(a)
        if qd.get('chg') is not None and abs(qd['chg']) >= MOVE and (qd.get('at') or '')[:10] == today:
            add(f'move:{t}:{today}:{"up" if qd["chg"] > 0 else "dn"}', f'{short} {"up" if qd["chg"] > 0 else "down"} {abs(qd["chg"]) * 100:.1f}% today '
                f'({"R" if qd.get("cur") == "ZAR" else "$"}{qd["px"]:,.2f})')
        d = ne.get(t)
        if d in (today, tomorrow):
            add(f'results:{t}:{d}', f'{short} reports results {"today" if d == today else "tomorrow"} ({d}). Decide beforehand: hold, trim or hedge.')
        for it in items:
            pub = it.get('published') or ''
            try: fresh_ok = pub and dt.datetime.fromisoformat(pub) >= now - dt.timedelta(hours=36)
            except Exception: fresh_ok = False
            if fresh_ok and HOT.search(it['title']):
                add('news:' + t + ':' + hashlib.sha1(it['url'].encode()).hexdigest()[:12], it['title'], it['url'], pub)
        fresh[t] = new
        rows.append({'ticker': t, 'name': names[t][0] or qd.get('name'), 'quote': qd or None, 'news': items[:20], 'next_results': d,
                     'alerts': sorted(al.values(), key=lambda a: a.get('at') or '', reverse=True)[:20], 'updated_at': now.isoformat()})
    for i in range(0, len(rows), 200):
        api('POST', 'portfolio_news?on_conflict=ticker', rows[i:i + 200], 'resolution=merge-duplicates,return=minimal')
    try: benchmarks()
    except Exception as e: print('::warning::portfolio_desk: benchmarks failed:', repr(e)[:200])
    try: track_record(quotes, now)
    except Exception as e: print('::warning::portfolio_desk: track record failed:', repr(e)[:200])
    n_new = sum(len(v) for v in fresh.values())
    print(f'::notice::portfolio_desk: {len(rows)} companies refreshed, {len(quotes)} prices, {n_new} new market-moving alerts')
    if n_new: send_alerts(pos, fresh)


def benchmarks():
    """S&P 500, JSE Top 40 (Satrix 40) and USD/ZAR daily closes for the last 2 years -> portfolio_bench."""
    y = Yahoo(); H = {}
    for k, sym in (('spx', '^GSPC'), ('j200', 'STX40.JO'), ('usdzar', 'ZAR=X')):
        bars, meta = y.bars(sym, '2y'); f = 100.0 if (meta.get('currency') or '') in ('ZAc', 'ZAC') else 1.0
        for b in bars: H.setdefault(b['date'], {})[k] = round(b['close'] / f, 4)
    rows = [{'d': d, 'spx': v.get('spx'), 'j200': v.get('j200'), 'usdzar': v.get('usdzar')} for d, v in sorted(H.items())]
    for i in range(0, len(rows), 500):
        api('POST', 'portfolio_bench?on_conflict=d', rows[i:i + 500], 'resolution=merge-duplicates,return=minimal')
    print(f'portfolio_desk: benchmarks {len(rows)} days')


def track_record(quotes, now):
    """Daily book value per member (rand), rebuilt from closing prices since each trade's entry date.
    Full rebuild for members whose positions changed since their last snapshot (and once a day after the US close);
    otherwise only today's row is refreshed from the latest prices."""
    allp = api('GET', 'portfolio_positions?select=user_id,ticker,currency,qty,entry_price,entry_date,side,exit_price,closed_on,updated_at,created_at&limit=50000') or []
    if not allp: return
    today = now.date()
    last = {}
    for r in api('GET', 'portfolio_snapshots?select=user_id,at&d=eq.' + (today - dt.timedelta(days=1)).isoformat() + '&limit=50000') or []: last[r['user_id']] = r['at']
    users = {}
    for p in allp: users.setdefault(p['user_id'], []).append(p)
    full = {u for u, ps in users.items() if u not in last or now.hour == 23 or any((p.get('updated_at') or '') > last[u] for p in ps)}
    y = Yahoo(); start = (today - dt.timedelta(days=730)).isoformat()
    tick = sorted({p['ticker'] for u in full for p in users[u]})
    def hist(t):
        try:
            bars, meta = y.bars(t, '2y'); k = 100.0 if (meta.get('currency') or '') in ('ZAc', 'ZAC', 'GBp', 'GBX') else 1.0
            return t, {b['date']: b['close'] / k for b in bars}
        except Exception as e:
            print('  bars', t, repr(e)[:60]); return t, {}
    with ThreadPoolExecutor(6) as ex: H = dict(ex.map(hist, tick + ['ZAR=X'])) if full else {}
    fxl = (load(P('docs', 'data', 'dashboards', 'live.json')) or {}).get('groups') or []
    fx_now = next((r['latest'] for g in fxl for r in g['rows'] if r['name'] == 'USD / ZAR'), None) or 16.5
    def series(dates, m):
        out, lastv = {}, None
        keys = sorted(m)
        j = 0
        for d in dates:
            while j < len(keys) and keys[j] <= d: lastv = m[keys[j]]; j += 1
            out[d] = lastv
        return out
    rows = []
    for u, ps in users.items():
        ent = lambda p: (p.get('entry_date') or (p.get('created_at') or today.isoformat())[:10])
        if u in full:
            first = max(min(ent(p) for p in ps), start)
            dates = sorted({d for t in {p['ticker'] for p in ps} for d in H.get(t, {}) if d >= first} | set(d for d in H.get('ZAR=X', {}) if d >= first))
            dates = [d for d in dates if d < today.isoformat()] + [today.isoformat()]
            fx = series(dates, H.get('ZAR=X', {}))
            px = {t: series(dates, H.get(t, {})) for t in {p['ticker'] for p in ps}}
        else:
            dates = [today.isoformat()]; fx = {}; px = {}
        for d in dates:
            f = (quotes.get('ZAR=X') or {}).get('px') if d == today.isoformat() else None
            f = f or fx.get(d) or fx_now
            book = inv = flow = 0.0; n = 0; M = {'jse': [0.0, 0.0, 0.0], 'us': [0.0, 0.0, 0.0]}
            for p in ps:
                e, c = ent(p), (p.get('currency') or ('ZAR' if p['ticker'].endswith('.JO') else 'USD'))
                k = f if c == 'USD' else 1.0
                dirn = -1 if p.get('side') == 'short' else 1
                q, ep = float(p['qty']), float(p['entry_price'])
                cost = q * ep * k
                mk = M['jse' if p['ticker'].endswith('.JO') else 'us']
                if e == d: flow += cost; mk[2] += cost
                if p.get('closed_on') and p['closed_on'] == d:
                    xp = float(p.get('exit_price') or ep); out_ = cost + dirn * q * (xp - ep) * k; flow -= out_; mk[2] -= out_
                if e <= d and (not p.get('closed_on') or p['closed_on'] > d):
                    live = (quotes.get(p['ticker']) or {}).get('px') if d == today.isoformat() else None
                    pr = live or (px.get(p['ticker']) or {}).get(d) or ep
                    v_ = cost + dirn * q * (pr - ep) * k; book += v_; inv += cost; n += 1; mk[0] += v_; mk[1] += cost
            rows.append({'user_id': u, 'd': d, 'book': round(book, 2), 'invested': round(inv, 2), 'flow': round(flow, 2), 'n': n, 'at': now.isoformat(),
                         'book_jse': round(M['jse'][0], 2), 'inv_jse': round(M['jse'][1], 2), 'flow_jse': round(M['jse'][2], 2),
                         'book_us': round(M['us'][0], 2), 'inv_us': round(M['us'][1], 2), 'flow_us': round(M['us'][2], 2)})
    for i in range(0, len(rows), 500):
        api('POST', 'portfolio_snapshots?on_conflict=user_id,d', rows[i:i + 500], 'resolution=merge-duplicates,return=minimal')
    print(f'::notice::portfolio_desk: track record {len(rows)} daily rows ({len(full)} members rebuilt in full)')


def send_alerts(pos, fresh):
    host, user, pw, frm = (os.environ.get(k, '') for k in ('SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'))
    if not (host and user and pw and frm):
        print('::warning::portfolio_desk: SMTP_* secrets not set — alerts saved to members\' dashboards, emails skipped.'); return
    port = int(os.environ.get('SMTP_PORT') or 587)
    held = {}
    for p in pos: held.setdefault(p['user_id'], set()).add(p['ticker'])
    users = [u for u in held if any(fresh.get(t) for t in held[u])]
    if not users: return
    profs = {r['id']: r for r in api('GET', 'profiles?select=id,email,full_name,portfolio_alerts&id=in.(' + ','.join(users) + ')') or []}
    sent = 0
    ctx = ssl.create_default_context()
    srv = smtplib.SMTP_SSL(host, port, context=ctx, timeout=30) if port == 465 else smtplib.SMTP(host, port, timeout=30)
    if port != 465: srv.starttls(context=ctx)
    srv.login(user, pw)
    try:
        for u in users:
            pr = profs.get(u) or {}
            if not pr.get('email') or pr.get('portfolio_alerts') is False: continue
            items = [a for t in sorted(held[u]) for a in fresh.get(t) or []]
            done = {r['k'] for r in api('GET', f'alert_log?select=k&user_id=eq.{u}&k=in.(' + ','.join(urllib.parse.quote(f'"{a["k"]}"') for a in items) + ')') or []}
            items = [a for a in items if a['k'] not in done]
            if not items: continue
            first = (pr.get('full_name') or '').split(' ')[0]
            tks = sorted({a['t'].replace('.JO', '') for a in items})
            subj = f'LRC alert: {", ".join(tks[:4])}{" +" + str(len(tks) - 4) if len(tks) > 4 else ""} · {html.unescape(items[0]["text"])[:70]}'
            li = ''.join(f'<tr><td style="padding:8px 10px;border-bottom:1px solid #e5e1d6;font:700 12px Arial;color:#8a6d1e;white-space:nowrap;vertical-align:top">{html.escape(a["t"].replace(".JO", ""))}</td>'
                         f'<td style="padding:8px 10px;border-bottom:1px solid #e5e1d6;font:14px/1.5 Arial;color:#141414">'
                         f'{f"<a href={chr(34)}{html.escape(a["url"])}{chr(34)} style={chr(34)}color:#0b1f4d{chr(34)}>{html.escape(a["text"])}</a>" if a.get("url") else html.escape(a["text"])}</td></tr>' for a in items)
            body = (f'<div style="max-width:620px;margin:auto;font-family:Arial,sans-serif;color:#141414">'
                    f'<div style="background:#07080c;padding:16px 20px;border-bottom:3px solid #c9a227"><span style="color:#c9a227;font:700 13px Arial;letter-spacing:3px">LEAGO RIFUMO CAPITAL</span>'
                    f'<div style="color:#fff;font:700 20px Georgia;margin-top:4px">Market-moving news on your holdings</div></div>'
                    f'<p style="font:14px/1.6 Arial;padding:0 4px">{"Hi " + html.escape(first) + ", h" if first else "H"}ere is what just moved on companies in your LRC Portfolio Journal:</p>'
                    f'<table style="width:100%;border-collapse:collapse">{li}</table>'
                    f'<p style="font:14px/1.6 Arial;padding:0 4px"><a href="{SITE}portfolio.html" style="background:#c9a227;color:#07080c;padding:9px 16px;border-radius:6px;text-decoration:none;font-weight:700">Open my portfolio</a></p>'
                    f'<p style="font:12px/1.5 Arial;color:#666;padding:0 4px">You get this because you hold these companies in your LRC Portfolio Journal and have email alerts on. '
                    f'To stop them, untick "Email me market-moving news" on your <a href="{SITE}portfolio.html">portfolio page</a>. '
                    f'Educational information, not financial advice. Leago Rifumo Capital, Ermelo, South Africa.</p></div>')
            m = MIMEMultipart('alternative'); m['Subject'] = subj; m['From'] = formataddr(('Leago Rifumo Capital', frm)); m['To'] = pr['email']
            m['List-Unsubscribe'] = f'<{SITE}portfolio.html>'
            m.attach(MIMEText('\n'.join(f'{a["t"]}: {a["text"]} {a.get("url") or ""}' for a in items) + f'\n\nOpen your portfolio: {SITE}portfolio.html', 'plain', 'utf-8'))
            m.attach(MIMEText(body, 'html', 'utf-8'))
            try:
                srv.sendmail(frm, [pr['email']], m.as_string()); sent += 1
                api('POST', 'alert_log?on_conflict=user_id,k', [{'user_id': u, 'k': a['k']} for a in items], 'resolution=ignore-duplicates,return=minimal')
            except Exception as e:
                print('  email failed:', repr(e)[:120])
    finally:
        try: srv.quit()
        except Exception: pass
    print(f'::notice::portfolio_desk: {sent} alert emails sent')


if __name__ == '__main__':
    main()
