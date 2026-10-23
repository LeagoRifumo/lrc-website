#!/usr/bin/env python3
"""EVERY 15 MINUTES (GitHub Action): read the newsroom RSS feeds, tag regions / our coverage, flag BREAKING, write docs/data/wire.json.
Headline + link + source only — the full story stays with the publisher."""
import sys, os, re, html, json, datetime as dt, email.utils, xml.etree.ElementTree as ET
sys.path.insert(0, os.path.dirname(__file__))
from lrcdata import P, load, http, save_if_changed, now_sast, SAST

def parse_date(s):
    if not s: return None
    s = s.strip()
    try:
        d = email.utils.parsedate_to_datetime(s)
    except Exception:
        try: d = dt.datetime.fromisoformat(s.replace('Z', '+00:00'))
        except Exception: return None
    if d.tzinfo is None: d = d.replace(tzinfo=dt.timezone.utc)
    return d.astimezone(SAST)

def clean(t):
    t = html.unescape(re.sub(r'<[^>]+>', ' ', t or ''))
    return re.sub(r'\s+', ' ', t).strip()

def items_from(xml_bytes):
    root = ET.fromstring(xml_bytes)
    out = []
    for it in root.iter():
        tag = it.tag.split('}')[-1]
        if tag not in ('item', 'entry'): continue
        g = lambda name: next((c for c in it if c.tag.split('}')[-1] == name), None)
        title = clean((g('title').text if g('title') is not None else ''))
        link_el = g('link'); link = ''
        if link_el is not None: link = (link_el.text or link_el.attrib.get('href', '')).strip()
        if not link and g('guid') is not None and (g('guid').text or '').startswith('http'): link = g('guid').text.strip()
        when = None
        for n in ('pubDate', 'published', 'updated', 'date'):
            e = g(n)
            if e is not None and e.text: when = parse_date(e.text); break
        src = g('source')
        src = clean(src.text) if src is not None and src.text else ''
        if src and title.endswith(' - ' + src): title = title[:-len(src) - 3].strip()
        if title and link: out.append((title, link, when, src))
    return out

def main():
    cfg = load(P('agents', 'config', 'feeds.json'))
    ratings = load(P('docs', 'data', 'ratings.json'), {'ratings': {}})['ratings']
    cover = {t: r['name'] for t, r in ratings.items()}
    al = cfg.get('coverage_aliases', {})
    names = {t: [k.strip() for k in al.get(t, [n])] for t, n in cover.items()}
    B = cfg['breaking']; words = [w.lower() for w in B['words']]; mwords = [w.lower() for w in B['move_words']]
    now = now_sast(); keep = now - dt.timedelta(hours=cfg['keep_hours'])
    prev = {i['url']: i for i in load(P('docs', 'data', 'wire.json'), {'items': []}).get('items', [])}
    items, ok, fail = {}, 0, []
    for f in cfg['feeds']:
        url = f['url'].replace('{COVERAGE}', ','.join(cover))
        try:
            got = items_from(http(url, timeout=20))
            ok += 1
        except Exception as e:
            fail.append(f"{f['source']}: {str(e)[:80]}"); continue
        for title, link, when, osrc in got[:40]:
            when = when or (parse_date(prev[link]['published']) if link in prev else now)
            if when < keep or when > now + dt.timedelta(hours=1): continue
            low = title.lower()
            tks = [t for t, keys in names.items() if any(re.search(r'(?<![A-Za-z])' + re.escape(k) + r'(?![A-Za-z])', title) for k in keys)]
            age_h = (now - when).total_seconds() / 3600
            brk = age_h <= B['max_age_hours'] and (f.get('breaking') or any(w in low for w in words) or (tks and any(w in low for w in mwords)))
            key = re.sub(r'[^a-z0-9]', '', low)[:90]
            if key in items:
                if f.get('coverage'): items[key]['tickers'] = sorted(set(items[key]['tickers'] + tks))
                continue
            items[key] = {'title': title, 'url': link, 'source': (osrc if f.get('aggregator') and osrc else f['source'].replace(' (our coverage)', '')), 'region': f['region'],
                          'published': when.isoformat(timespec='minutes'), 'breaking': bool(brk), 'tickers': tks}
    rows = sorted(items.values(), key=lambda i: i['published'], reverse=True)[:cfg['max_items']]
    if not rows:
        sys.exit('no feeds answered — keeping the previous wire')
    out = {'generated': now.isoformat(timespec='minutes'), 'agent': 'LRC Live Wire', 'sources_ok': ok, 'sources_failed': fail, 'items': rows}
    changed = save_if_changed(P('docs', 'data', 'wire.json'), out, ignore=('generated',))
    print(f"wire: {len(rows)} items, {sum(i['breaking'] for i in rows)} breaking, feeds ok {ok}/{len(cfg['feeds'])}, changed={changed}")
    for x in fail: print('  FEED FAIL', x)

if __name__ == '__main__':
    main()
