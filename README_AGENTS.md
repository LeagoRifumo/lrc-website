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
agents/
  news_agent.md, watchlist_agent.md   instructions for the two Claude scheduled agents
  config/feeds.json                   newsrooms for the live wire + breaking-news words
  tools/                              the scripts the Actions run
  templates/article.html              article page template
.github/workflows/          live-wire.yml · daily.yml · articles.yml
```

## What runs when
| What | When | Who | Cost |
|---|---|---|---|
| Live news wire + BREAKING bar | every 15 min | GitHub Action | free |
| Watchlist (house rules), NY earnings, dashboard | every day 06:07 SAST | GitHub Action | free |
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
