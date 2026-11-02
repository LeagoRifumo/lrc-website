#!/usr/bin/env python3
"""Uploads the LRC Top Picks to the members database (Supabase) — never to the public website files.
Needs two GitHub secrets: SUPABASE_URL and SUPABASE_SERVICE_KEY. Without them it does nothing (the site keeps working).
Keeps the date and price each company was first picked (for 'since added' performance) and a history of every pick."""
import os, sys, json, urllib.request, urllib.parse
sys.path.insert(0, os.path.dirname(__file__))
from lrcdata import P, load, now_sast

URL, KEY = os.environ.get('SUPABASE_URL', '').rstrip('/'), os.environ.get('SUPABASE_SERVICE_KEY', '')


def api(method, path, body=None, prefer=None):
    h = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
    if prefer: h['Prefer'] = prefer
    req = urllib.request.Request(f'{URL}/rest/v1/{path}', data=json.dumps(body).encode() if body is not None else None, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=30) as r:
        t = r.read()
        return json.loads(t) if t else None


def main():
    if not URL or not KEY:
        print('members_push: SUPABASE_URL / SUPABASE_SERVICE_KEY not set — skipped (members area not connected yet).'); return
    out = load(P('agents', 'work', 'private', 'top_picks.json'))
    if not out or not out.get('picks'):
        print('members_push: no picks file — skipped'); return
    today = now_sast().date().isoformat()
    cur = {(r['kind'], r['market'], r['ticker']): r for r in (api('GET', 'top_picks?select=kind,market,ticker,added_on,added_price') or [])}
    new = {(p['kind'], p['market'], p['ticker']): p for p in out['picks']}
    rows = []
    for k, p in new.items():
        old = cur.get(k)
        rows.append({'kind': k[0], 'market': k[1], 'ticker': k[2], 'rank': p['rank'], 'data': p,
                     'added_on': old['added_on'] if old else today, 'added_price': old['added_price'] if old else p['price'],
                     'updated_at': out['generated']})
        if not old:
            api('POST', 'picks_history', {'kind': k[0], 'market': k[1], 'ticker': k[2], 'name': p['name'], 'added_on': today, 'added_price': p['price']}, 'return=minimal')
    if rows:
        api('POST', 'top_picks?on_conflict=kind,market,ticker', rows, 'resolution=merge-duplicates,return=minimal')
    # drop names that no longer qualify, and close them in the history
    scan = {r['t']: r for r in load(P('docs', 'data', 'scan', 'stocks.json'))['rows']}
    for k in cur:
        if k in new: continue
        kind, market, ticker = k
        q = f"kind=eq.{kind}&market=eq.{market}&ticker=eq.{urllib.parse.quote(ticker)}"
        api('DELETE', f'top_picks?{q}', prefer='return=minimal')
        api('PATCH', f'picks_history?{q}&removed_on=is.null', {'removed_on': today, 'removed_price': (scan.get(ticker) or {}).get('px')}, 'return=minimal')
    api('POST', 'picks_meta?on_conflict=id', [{'id': 1, 'generated': out['generated'], 'scanner_run': out.get('scanner_run'), 'rules': out['rules']}], 'resolution=merge-duplicates,return=minimal')
    print(f"members_push: {len(rows)} picks live; added {sum(1 for k in new if k not in cur)}, removed {sum(1 for k in cur if k not in new)}")


if __name__ == '__main__':
    main()
