#!/usr/bin/env python3
"""LRC Workplace sync (GitHub Actions only: needs SUPABASE_URL, SUPABASE_SERVICE_KEY and WP_KEY secrets).

1. IMPORT: decrypts every agents/drop/*.json.enc (written by the AI agents with wp_bridge.py push), applies the changes
   to the Workplace table (wp_docs) and deletes the drop file.
2. EXPORT: writes an encrypted snapshot of what the agents need to read to agents/mirror/workplace.json.enc.
Stdlib only.
"""
import os, sys, json, glob, subprocess, urllib.request, urllib.parse, datetime as dt

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')
ENC = ['openssl', 'enc', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-salt', '-a', '-A', '-pass', 'env:WP_KEY']
EXPORT = ['ideas', 'flags', 'marks', 'picks', 'pickhist', 'shows', 'forecasts', 'config', 'system']


def crypt(b, decrypt=False):
    r = subprocess.run(ENC + (['-d'] if decrypt else []), input=b, capture_output=True)
    if r.returncode: raise RuntimeError('openssl: ' + r.stderr.decode()[:200])
    return r.stdout


def api(method, path, body=None, prefer=None):
    h = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'}
    if prefer: h['Prefer'] = prefer
    req = urllib.request.Request(URL + '/rest/v1/' + path, method=method, headers=h, data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(req, timeout=60) as r:
        t = r.read().decode()
        return json.loads(t) if t.strip() else None


def coll_id(path):
    c, i = path.rsplit('/', 1)
    return c, i


def apply(ops):
    for o in ops:
        p = o['path']; c, i = coll_id(p); q = urllib.parse.quote(p, safe='')
        if c.split('/')[0] == 'staff': continue
        if o['op'] == 'delete':
            api('DELETE', f'wp_docs?path=eq.{q}')
        else:
            data = o.get('data') or {}
            if o['op'] == 'merge':
                cur = api('GET', f'wp_docs?select=data&path=eq.{q}') or []
                data = {**(cur[0]['data'] if cur else {}), **data}
            api('POST', 'wp_docs?on_conflict=path', {'path': p, 'coll': c, 'id': i, 'data': data}, prefer='resolution=merge-duplicates,return=minimal')


def main():
    if not (URL and KEY and os.environ.get('WP_KEY')): print('Workplace sync not set up yet: add the WP_KEY secret.'); return
    try: api('GET', 'wp_docs?select=path&limit=1')
    except Exception as e: print(f'Workplace table not reachable yet (run supabase/workplace.sql): {e!r}'[:200]); return
    n = 0
    for f in sorted(glob.glob(os.path.join(ROOT, 'agents', 'drop', '*.json.enc'))):
        try:
            d = json.loads(crypt(open(f, 'rb').read(), decrypt=True))
            apply(d.get('ops', [])); n += len(d.get('ops', []))
            print(f"imported {os.path.basename(f)}: {len(d.get('ops', []))} changes from {d.get('by')}")
            os.remove(f)
        except Exception as e:
            print(f'FAILED {os.path.basename(f)}: {e!r}'[:300])
    rows = api('GET', 'wp_docs?select=path,coll,data,updated_at&coll=in.(' + ','.join(EXPORT) + ')') or []
    cut_show = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=14)).isoformat()
    recent_fc = sorted([r for r in rows if r['coll'] == 'forecasts'], key=lambda r: r['updated_at'])[-6:]
    keep = [r for r in rows if (r['coll'] != 'shows' or r['updated_at'] >= cut_show) and (r['coll'] != 'forecasts' or r in recent_fc)]
    snap = {'generated': dt.datetime.now(dt.timezone.utc).isoformat(), 'docs': {r['path']: r['data'] for r in keep}}
    os.makedirs(os.path.join(ROOT, 'agents', 'mirror'), exist_ok=True)
    open(os.path.join(ROOT, 'agents', 'mirror', 'workplace.json.enc'), 'wb').write(crypt(json.dumps(snap, ensure_ascii=False).encode()))
    print(f'imported {n} changes; snapshot of {len(keep)} documents written')


if __name__ == '__main__':
    main()
