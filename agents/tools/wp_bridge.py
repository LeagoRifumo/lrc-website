#!/usr/bin/env python3
"""LRC Workplace bridge for the AI agents (they can't reach the website database directly).

  pull                      decrypt the latest Workplace snapshot to /tmp/wp_mirror.json  ({"generated", "docs": {path: data}})
  push OPS.json --by NAME   encrypt a list of changes and commit it to agents/drop/; the "LRC Workplace sync"
                            GitHub Action loads it into the Workplace within a minute or two.

OPS.json is a list of {"op": "set" | "merge" | "delete", "path": "collection/id", "data": {...}}.
Both directions are encrypted with the passphrase in the WP_KEY environment variable (AES-256, PBKDF2), so the public
repo only ever holds unreadable data. Never write decrypted Workplace data into the repo.
"""
import os, sys, json, subprocess, datetime as dt, secrets, time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MIRROR = os.path.join(ROOT, 'agents', 'mirror', 'workplace.json.enc')
DROP = os.path.join(ROOT, 'agents', 'drop')
ENC = ['openssl', 'enc', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-salt', '-a', '-A', '-pass', 'env:WP_KEY']


def crypt(data: bytes, decrypt=False) -> bytes:
    if not os.environ.get('WP_KEY'): sys.exit('WP_KEY is not set.')
    r = subprocess.run(ENC + (['-d'] if decrypt else []), input=data, capture_output=True)
    if r.returncode: sys.exit('openssl failed: ' + r.stderr.decode()[:200])
    return r.stdout


def pull(out='/tmp/wp_mirror.json'):
    subprocess.run(['git', '-C', ROOT, 'pull', '-q', '--rebase', 'origin', 'main'], check=False)
    if not os.path.exists(MIRROR): sys.exit('No Workplace snapshot yet (agents/mirror/workplace.json.enc).')
    data = json.loads(crypt(open(MIRROR, 'rb').read(), decrypt=True))
    json.dump(data, open(out, 'w'), indent=1, ensure_ascii=False)
    colls = {}
    for p in data.get('docs', {}): colls[p.rsplit('/', 1)[0]] = colls.get(p.rsplit('/', 1)[0], 0) + 1
    print(f"snapshot {data.get('generated')} -> {out}: " + ', '.join(f'{k} {v}' for k, v in sorted(colls.items())))


def push(path, by):
    ops = json.load(open(path))
    if isinstance(ops, dict): ops = ops.get('ops', [])
    for o in ops:
        if o.get('op') not in ('set', 'merge', 'delete') or '/' not in str(o.get('path', '')): sys.exit(f'Bad op: {o}')
        if o['path'].split('/')[0] in ('staff',): sys.exit('Agents may not change staff.')
    blob = crypt(json.dumps({'by': by, 'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'ops': ops}, ensure_ascii=False).encode())
    os.makedirs(DROP, exist_ok=True)
    name = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S') + '-' + secrets.token_hex(3) + '.json.enc'
    open(os.path.join(DROP, name), 'wb').write(blob)
    g = lambda *a: subprocess.run(['git', '-C', ROOT] + list(a), capture_output=True, text=True)
    g('add', os.path.join('agents', 'drop', name))
    g('commit', '-q', '-m', f'Workplace drop: {by} ({len(ops)} changes)')
    for k in range(4):
        g('pull', '-q', '--rebase', 'origin', 'main')
        r = g('push', '-q', 'origin', 'HEAD:main')
        if r.returncode == 0: print(f'pushed {name}: {len(ops)} changes'); return
        time.sleep(5 * (k + 1))
    sys.exit('push failed: ' + r.stderr[:300])


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] not in ('pull', 'push'): sys.exit(__doc__)
    if a[0] == 'pull': pull(*a[1:2])
    else:
        by = a[a.index('--by') + 1] if '--by' in a else 'agent'
        push(a[1], by)
