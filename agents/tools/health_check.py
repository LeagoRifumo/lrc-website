#!/usr/bin/env python3
"""LRC health check (GitHub Action, every 3 hours): is every automated part of the website still updating?
Checks how old each data file is against its schedule. If anything is late it opens (or updates) one GitHub issue
"LRC health check: …" — GitHub emails the repository owner — and closes that issue again once everything is fresh.
Also writes docs/data/health.json (used by nothing public; handy for a quick look)."""
import os, json, glob, urllib.request, datetime as dt

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = lambda *a: os.path.join(ROOT, *a)
SAST = dt.timezone(dt.timedelta(hours=2))
NOW = dt.datetime.now(SAST)
WEEKDAY_DAY = NOW.weekday() < 5 and 7 <= NOW.hour < 23
TITLE = 'LRC health check: something on the website stopped updating'


def load(p):
    try: return json.load(open(P('docs', 'data', p), encoding='utf-8'))
    except Exception: return None


def age_h(iso):
    try:
        t = dt.datetime.fromisoformat(iso.replace('Z', '+00:00'))
        if t.tzinfo is None: t = t.replace(tzinfo=SAST)
        return (NOW - t).total_seconds() / 3600
    except Exception: return None


# (name, file, field, max hours on weekday daytime, max hours otherwise, what runs it)
CHECKS = [
    ('LRC Stock Scanner', 'scan/stocks.json', 'generated', 30, 62, 'scanner.yml (06:37 Tue–Sat, 17:47 Mon–Fri)'),
    ('Watchlist lists', 'scan/lists.json', 'generated', 30, 62, 'scanner.yml'),
    ('Dividend calendar', 'dividends.json', 'generated', 30, 62, 'scanner.yml'),
    ('Market dashboard (live)', 'dashboards/live.json', 'generated', 3, 60, 'dashboard.yml (hourly, weekdays)'),
    ('Live news wire', 'wire.json', 'generated', 2, 6, 'live-wire.yml (every 15 minutes)'),
    ('News Desk brief', 'news.json', 'generated', 4, 60, 'scheduled task "LRC News Agent" (hourly 06:00–22:00 Mon–Fri)'),
    ('New York earnings calendar', 'earnings_us.json', 'generated', 30, 30, 'daily.yml (06:07 daily)'),
]


def main():
    problems, report = [], []
    for name, f, k, a, b, who in CHECKS:
        d = load(f); lim = a if WEEKDAY_DAY else b
        h = age_h((d or {}).get(k) or '') if d else None
        okay = h is not None and h <= lim
        report.append({'name': name, 'file': f, 'age_hours': round(h, 1) if h is not None else None, 'limit_hours': lim, 'ok': okay})
        if not okay: problems.append(f'- **{name}** (`docs/data/{f}`) — last updated {"never / unreadable" if h is None else f"{h:.0f} hours ago"} (limit {lim} h). Runs from: {who}.')
    # financial statements: most companies refreshed in the last 9 days
    fs = glob.glob(P('docs', 'data', 'fs', '*.json')); cut = (NOW.date() - dt.timedelta(days=9)).isoformat(); fresh = 0
    for p in fs:
        try: fresh += (json.load(open(p)).get('updated') or '') >= cut
        except Exception: pass
    sc = load('scan/stocks.json') or {}; n = len(sc.get('rows') or [])
    ok_fs = n and fresh >= 0.85 * n
    report.append({'name': 'Financial statements', 'fresh': fresh, 'companies': n, 'ok': bool(ok_fs)})
    if not ok_fs: problems.append(f'- **Financial statements** — only {fresh} of {n} companies refreshed in the last 9 days. Runs from: statements.yml (daily 05:23).')
    # track record snapshot
    snaps = sorted(glob.glob(P('docs', 'data', 'track', 'snap', '*.json')))
    last = os.path.basename(snaps[-1])[:10] if snaps else ''
    ok_tr = last >= (NOW.date() - dt.timedelta(days=4)).isoformat()
    report.append({'name': 'Track record', 'last_snapshot': last, 'ok': ok_tr})
    if not ok_tr: problems.append(f'- **Track record** — last snapshot {last or "none"}. Runs from: scanner.yml (track_record.py).')
    json.dump({'checked': NOW.isoformat(timespec='minutes'), 'ok': not problems, 'checks': report}, open(P('docs', 'data', 'health.json'), 'w'), indent=1)
    print('\n'.join(problems) if problems else 'All automated parts are fresh.')
    issue(problems)


def gh(method, path, body=None):
    tok, repo = os.environ.get('GITHUB_TOKEN'), os.environ.get('GITHUB_REPOSITORY')
    if not tok or not repo: return None
    req = urllib.request.Request(f'https://api.github.com/repos/{repo}{path}', method=method, data=json.dumps(body).encode() if body else None,
                                 headers={'Authorization': f'Bearer {tok}', 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r: return json.loads(r.read() or b'null')


def issue(problems):
    try:
        open_ = [i for i in (gh('GET', '/issues?state=open&per_page=50') or []) if i.get('title') == TITLE]
        if problems:
            body = (f'Checked {NOW.strftime("%a %d %b %Y %H:%M")} SAST.\n\n' + '\n'.join(problems) +
                    '\n\nWhat to do: open the Actions tab, click the workflow named above and read the failed run (or ask Claude to fix it). '
                    'This issue closes itself once everything is updating again.\n\n---\n_Automated LRC health check_')
            if open_: gh('POST', f'/issues/{open_[0]["number"]}/comments', {'body': body})
            else: gh('POST', '/issues', {'title': TITLE, 'body': body})
        else:
            for i in open_:
                gh('POST', f'/issues/{i["number"]}/comments', {'body': f'All automated parts are updating again ({NOW.strftime("%d %b %H:%M")} SAST). Closing.\n\n---\n_Automated LRC health check_'})
                gh('PATCH', f'/issues/{i["number"]}', {'state': 'closed', 'state_reason': 'completed'})
    except Exception as e:
        print('issue update failed:', repr(e)[:160])


if __name__ == '__main__':
    main()
