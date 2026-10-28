# Leago Rifumo Capital — website + automation

```
docs/                       the website (GitHub Pages serves this folder)
  articles/*.md             YOUR ARTICLES — add a file here and it is published automatically
  data/wire.json            live news wire          (GitHub Action, every 15 minutes)
  data/news.json            AI brief                (Claude News Agent, hourly on weekdays)
  data/watchlist.json       watchlist, house rules  (GitHub Action, daily 06:07 SAST)
  data/earnings_us.json     New York earnings       (GitHub Action, daily)
  data/earnings_jse.json    JSE results calendar    (Claude Weekly Research Agent, Saturdays)
  data/dashboards/*.json    weekly market dashboard (Action daily + weekend edition; agent adds movers & view)
  data/ratings.json         analyst-approved ratings (edited by the analyst only)
  data/scan/*.json          LRC Scanner: stocks, ETFs, sectors + one file per company (GitHub Action, twice a day)
  data/research/*.json      analyst research layer shown on the one-page summaries (analyst only)
  scanner.html, stock.html  the scanner and the one-page stock summary (Download PDF = print to PDF)
agents/
  news_agent.md, watchlist_agent.md   instructions for the two Claude scheduled agents
  config/feeds.json                   newsrooms for the live wire + breaking-news words
  tools/                              the scripts the Actions run
  templates/article.html              article page template
.github/workflows/          live-wire.yml · daily.yml · articles.yml · scanner.yml · dashboard.yml
```

## What runs when
| What | When | Who | Cost |
|---|---|---|---|
| Live news wire + BREAKING bar | every 15 min | GitHub Action | free |
| Watchlist (house rules), NY earnings, dashboard | every day 06:07 SAST | GitHub Action | free |
| LRC Scanner (JSE + New York stocks, ETFs, sectors, entry plans) | 06:37 SAST Tue–Sat and 17:47 SAST Mon–Fri | GitHub Action | free |
| Market dashboard (live) | hourly 06:17–22:17 SAST, weekdays | GitHub Action | free |
| Health check (opens a GitHub issue if anything is late) | every 3 hours | GitHub Action | free |
| Financial statements + company pages (SEO) | daily 05:23 SAST (each company weekly) | GitHub Action | free |
| Weekly dashboard edition + Excel workbook | Saturdays | GitHub Action | free |
| Articles → pages, SEO, sitemap | every time you add one | GitHub Action | free |
| AI brief | hourly 06:00–22:00, Mon–Fri | Claude scheduled task | Claude plan |
| Fundamentals, dashboard movers & view, JSE calendar, screening | Saturdays 09:00 | Claude scheduled task | Claude plan |

## Writing an article
Go to **/write.html** on the site (not in the menu) → write → **Publish on GitHub** → **Commit changes**. Live in ~2 minutes.

## Selling a report
In `docs/assets/js/main.js`, add `price: 'R199', buy: '<payment link>'` to the report in LIBRARY — the button changes to "Buy the full report".
For an article, tick "Premium" in the writer and paste the payment link.

## Changing a rating (analyst only)
Edit `docs/data/ratings.json` after a Work-sheet run and commit. The next daily run uses it. Rating alerts arrive as GitHub issues (email).

## LRC Scanner
- Universe: `agents/config/scanner.json` — the JSE list (Yahoo symbols end in `.JO`), the ETF groups and the sector → ETF map. New York = S&P 500 +
  Nasdaq-100, refreshed automatically each run, plus every covered name.
- Rules: `agents/tools/scan_engine.py` (scores, major support/resistance, Breakout / Retest / Breakdown / Failed retest, entry plans, investment track).
- LRC score (0-100) = percentile rank of six sector-relative factors (Value, Growth, Profitability, Momentum 20% each; Sentiment, Technical 10%). Rating: 80+ STRONG BUY, 60+ BUY, 40+ HOLD, 20+ SELL, below 20 STRONG SELL; a BUY needs upside to the LRC Analyst Target and a SELL needs downside.
- Track record: `agents/tools/track_record.py` saves every rating daily (docs/data/track/snap) and measures it (docs/data/track/performance.json → track.html).
- Company research on the one-page summaries is written automatically by the research agent (`agents/research_agent.md`) into `docs/data/research/<TICKER>.json`.
