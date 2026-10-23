#!/usr/bin/env python3
"""ON EVERY NEW ARTICLE (GitHub Action): turns docs/articles/*.md into finished, shareable, SEO-ready pages.
 * docs/articles/<file>.html  — full page with the site header/footer, Open Graph + NewsArticle structured data
 * docs/data/articles.json    — list used by the Articles page, the home page and "More from the desk"
 * docs/sitemap.xml           — every page + every article, for Google
Article file format (front matter between --- lines, then Markdown):
---
title: "Headline"
date: 2026-10-23
category: Daily            (Daily | Weekly | Research | Education)
author: "Prayer Nkuna, Analyst"
summary: "One sentence"
tickers: "NVDA, NPN"
image: "articles/img/chart.png"   (optional)
premium: false                    (true = shows the "full report for sale" box)
buy: ""                           (payment link for the full report, optional)
---
"""
import os, re, sys, json, glob, html, datetime as dt
sys.path.insert(0, os.path.dirname(__file__))
from lrcdata import P, now_sast

SITE = 'https://www.leagorifumocapital.co.za/'
STATIC = ['', 'articles.html', 'research.html', 'watchlist.html', 'news.html', 'dashboard.html', 'earnings.html', 'markets.html', 'tools.html', 'academy.html', 'show.html', 'contact.html', 'disclaimer.html', 'privacy.html']
BASE_KW = 'Leago Rifumo Capital, market analysis, South Africa, JSE, rand, US stocks, Prayer Nkuna'

def front(txt):
    m = re.match(r'^﻿?---\s*\n(.*?)\n---\s*\n?(.*)$', txt, re.S)
    if not m: return {}, txt
    meta = {}
    for line in m.group(1).splitlines():
        if ':' not in line: continue
        k, v = line.split(':', 1); v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in '"\'': v = v[1:-1]
        meta[k.strip().lower()] = v
    return meta, m.group(2)

def md2html(text):
    try:
        import markdown
        return markdown.markdown(text, extensions=['extra', 'sane_lists', 'smarty'])
    except ImportError:  # small fallback so a page is always produced
        out, para = [], []
        inl = lambda s: re.sub(r'\[(.+?)\]\((.+?)\)', r'<a href="\2">\1</a>', re.sub(r'\*(.+?)\*', r'<em>\1</em>', re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', html.escape(s, quote=False))))
        for ln in text.splitlines() + ['']:
            if not ln.strip():
                if para: out.append('<p>' + inl(' '.join(para)) + '</p>'); para = []
            elif ln.startswith('## '): out.append('<h2>' + inl(ln[3:]) + '</h2>')
            elif ln.startswith('### '): out.append('<h3>' + inl(ln[4:]) + '</h3>')
            elif ln.startswith(('- ', '* ')): out.append('<ul><li>' + inl(ln[2:]) + '</li></ul>')
            elif ln.startswith('> '): out.append('<blockquote>' + inl(ln[2:]) + '</blockquote>')
            else: para.append(ln)
        return re.sub(r'</ul>\s*<ul>', '', '\n'.join(out))

def fix_paths(h):
    # links written relative to the site root (articles/img/x.png, watchlist.html) work from /articles/ too
    return re.sub(r'(src|href)="(?!https?:|mailto:|#|/|\.\./)', r'\1="../', h)

def main():
    tpl = open(P('agents', 'templates', 'article.html'), encoding='utf-8').read()
    arts = []
    for f in sorted(glob.glob(P('docs', 'articles', '*.md'))):
        slug = os.path.splitext(os.path.basename(f))[0].lower()
        slug = re.sub(r'[^a-z0-9-]+', '-', slug).strip('-')
        meta, body = front(open(f, encoding='utf-8').read())
        if meta.get('draft', 'false').lower() == 'true': continue
        title = meta.get('title') or slug.replace('-', ' ').title()
        try: d = dt.date.fromisoformat(meta.get('date', '')[:10])
        except ValueError: d = dt.date.fromtimestamp(os.path.getmtime(f))
        cat = (meta.get('category') or 'Daily').title()
        author = meta.get('author') or 'Prayer Nkuna, Analyst'
        words = len(re.findall(r'\w+', body)); read = max(1, -(-words // 220))
        summ = meta.get('summary') or re.sub(r'\s+', ' ', re.sub(r'[#>*_\[\]()!|-]', ' ', body)).strip()[:200]
        tks = [t.strip().upper() for t in re.split(r'[,;]', meta.get('tickers', '')) if t.strip()]
        img = meta.get('image', '').strip()
        prem = meta.get('premium', 'false').lower() == 'true'; buy = meta.get('buy', '').strip()
        img_abs = img if img.startswith('http') else (SITE + img.lstrip('/') if img else SITE + 'assets/img/og-image.png')
        kw = ', '.join([cat + ' market update' if cat in ('Daily', 'Weekly') else cat.lower()] + tks + [BASE_KW])
        ld = {'@context': 'https://schema.org', '@type': 'NewsArticle', 'headline': title[:110], 'description': summ, 'datePublished': d.isoformat(),
              'dateModified': dt.date.fromtimestamp(os.path.getmtime(f)).isoformat(), 'image': [img_abs], 'inLanguage': 'en-ZA',
              'author': {'@type': 'Person', 'name': author.split(',')[0], 'jobTitle': 'Analyst'},
              'publisher': {'@type': 'Organization', 'name': 'Leago Rifumo Capital', 'logo': {'@type': 'ImageObject', 'url': SITE + 'assets/img/logo-lrc-gold.png'}},
              'mainEntityOfPage': f'{SITE}articles/{slug}.html', 'keywords': kw, 'articleSection': cat}
        premium_box = ''
        if prem:
            premium_box = ('<div class="premium-box"><div><b>FULL REPORT AVAILABLE</b><p>This is the free summary. The full report has the model, valuation and every source.</p></div>' +
                           (f'<a class="btn btn-gold" href="{html.escape(buy)}" target="_blank" rel="noopener">Buy the full report →</a>' if buy else
                            f'<a class="btn btn-gold" href="mailto:info@leagorifumocapital.co.za?subject={html.escape("Full report: " + title)}">Request the full report →</a>') + '</div>')
        cover = f'<div class="cover"><img src="{html.escape(img if img.startswith("http") else "../" + img.lstrip("/"))}" alt="{html.escape(title)}"></div>' if img else ''
        e = lambda s: html.escape(s, quote=True)
        rep = {'%%TITLE%%': e(title), '%%DESC%%': e(summ), '%%KEYWORDS%%': e(kw), '%%SLUG%%': slug, '%%IMAGE%%': e(img_abs), '%%DATE%%': d.isoformat(),
               '%%JSONLD%%': json.dumps(ld, ensure_ascii=False).replace('</', '<\\/'), '%%CATEGORY%%': e(cat), '%%TITLE_H%%': e(title), '%%SUMMARY_H%%': e(summ),
               '%%AUTHOR%%': e(author), '%%DATE_LONG%%': f'{d.day} {d.strftime("%B %Y")}', '%%READ%%': str(read),
               '%%TICKERS%%': ''.join(f'<span class="tk">{e(t)}</span>' for t in tks), '%%COVER%%': cover, '%%PREMIUM%%': premium_box,
               '%%BODY%%': fix_paths(md2html(body))}
        page = tpl
        for k, v in rep.items(): page = page.replace(k, v)
        open(P('docs', 'articles', slug + '.html'), 'w', encoding='utf-8').write(page)
        arts.append({'slug': slug, 'url': f'articles/{slug}.html', 'title': title, 'date': d.isoformat(), 'date_long': f'{d.day} {d.strftime("%b %Y")}',
                     'category': cat, 'author': author, 'summary': summ, 'tickers': tks, 'image': img if not img.startswith('/') else img[1:],
                     'read_min': read, 'premium': prem})
    arts.sort(key=lambda a: (a['date'], a['slug']), reverse=True)
    json.dump({'generated': now_sast().isoformat(timespec='minutes'), 'articles': arts}, open(P('docs', 'data', 'articles.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    today = now_sast().date().isoformat()
    urls = [(SITE + s, today, 'daily' if s in ('', 'news.html', 'watchlist.html', 'articles.html', 'dashboard.html', 'earnings.html') else 'monthly') for s in STATIC]
    urls += [(f"{SITE}{a['url']}", a['date'], 'monthly') for a in arts]
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(
        f'  <url><loc>{u}</loc><lastmod>{m}</lastmod><changefreq>{c}</changefreq></url>\n' for u, m, c in urls) + '</urlset>\n'
    open(P('docs', 'sitemap.xml'), 'w').write(xml)
    print(f'articles: {len(arts)} published; sitemap {len(urls)} urls')

if __name__ == '__main__':
    main()
