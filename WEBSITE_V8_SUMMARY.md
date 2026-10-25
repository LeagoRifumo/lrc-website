# Leago Rifumo Capital website — v8 (25 Oct 2026)

Repository: github.com/LeagoRifumo/lrc-website (branch main, GitHub Pages serves /docs)
Give this file (and the zip) to Claude when you next update the website.

## Pages
- index.html — home (LRC Stock Scanner featured)
- scanner.html — LRC Stock Scanner (Sort dropdown + tap the rating header to sort STRONG BUY↔STRONG SELL): JSE / New York switch; tabs Stocks (Factor grades | All readings), Setups & entries, Investment ideas, ETFs, Sectors, How scoring works; Full screen; CSV
- stock.html?t=TICKER — free one-page summary (Download PDF) + "Buy the full report — R100"
- watchlist.html — FULLY AUTOMATED from the scanner (agents/tools/watchlist_lists.py → docs/data/scan/lists.json, rebuilt every scanner run): per market Top 5 BUY + Top 5 SELL for Trading (3-12m, by Trading score) and Top 5 BUY + Top 5 SELL for Investment (5-10y, by Investment score); watchlist news; LRC analyst coverage (re-priced daily). Home page card reads the same lists.
- track.html — track record of every scanner rating (from 25 Oct 2026)
- dashboard.html — colour-coded one-screen market dashboard: 6 headline tiles, analyst/auto view, SA | US & global | Commodities | Top movers cards; green/red = good/bad for investors (rand, inflation, yields inverted); live edition every 4 h on weekdays
- earnings.html, news.html, articles.html, research.html, tools.html, academy.html, markets.html, show.html, contact.html, write.html

## v8 changes
- Automated watchlist (above). The old house-rule swing list (build_watchlist.py → watchlist.json) still feeds the Excel workbook but is no longer shown on the website.
- Location pricing: visitors whose device time zone is Africa/Johannesburg see rand (store.json report_price, report_pay_link); everyone else sees US dollars (report_price_usd = $6, report_pay_link_usd). Visitors can switch with the "Show rand / Show US dollars" link; ?cur=USD or ?cur=ZAR in a URL also sets it.
- Mobile: JSE/NY switch stays in the header on phones; watchlist, setups, investment and track-record tables become one card per row; scanner tabs scroll sideways; filters in a 2-column grid; shorter page heroes; scrollable menu. Assets are ?v=8.0.

- Bottom line on the one-page summary is a SHORT thesis: who the company is (size, market, industry), ratings + valuation verdict; Why buy/sell = 3 reasons from different areas (business quality vs rivals, growth vs sector, industry backdrop, balance sheet, management/dividend, valuation, price trend); Risk; Next. Company context (size rank, sector backdrop) comes from agents/tools/peers.py ("context" in scan/t/*.json, every scanner run). Research files may add thesis.summary / thesis.risks_to_thesis.
- Branding: the public site never names the tools behind it (no GitHub, Claude, "agent"). Labels: LRC Stock Scanner, LRC Watchlist, LRC News Desk, LRC Research, LRC Market Dashboard, LRC Track Record. main.js brandName() strips tool names from any data label. write.html (private, noindex) still uses GitHub to publish articles.

## Scoring (agents/tools/scan_engine.py) — analyst-approved 37 readings (v7)
- 37 readings in 7 groups: Valuation (Fwd P/E, Trailing P/E, PEG, P/S, P/B, P/FCF, EV/EBITDA), Growth (revenue & EPS qtr y/y, EPS this/next year est., 3-yr revenue & EPS CAGR),
  Profitability (gross, operating, net margin, ROE, ROA), Financial health (D/E, current, quick, FCF margin, net cash/market cap),
  Income (dividend yield, payout), Sentiment (consensus, target upside, upgrades-downgrades, short interest, insider %, institutional %),
  Technical (trend ±2, momentum ±2, setup ±2, stretch/RSI, volume, beta). Each +1/0/-1 vs sector median or fixed lines (thresholds in READINGS / reading_points).
- Group score = 50 + 50 × points ÷ possible. Two scanners:
  * Trading (3-12 months, 6-month target): technical 35, growth 20, sentiment 20, valuation 10, profitability 10, health 5. BUY needs ≥ +5% to LRC target (STRONG BUY +10%), SELL needs downside.
  * Investment (5-10 years): valuation 25, profitability 25, health 20, growth 20, income 10. BUY cannot be OVERVALUED, SELL cannot be UNDERVALUED.
  * Bands: 75+ STRONG BUY, 60-74 BUY, 40-59 HOLD, 25-39 SELL, <25 STRONG SELL.
- Valuation verdict: UNDERVALUED (valuation net ≥ +2 and ≥ 10% upside to LRC target), OVERVALUED (net ≤ -2 or target 5%+ below price), else FAIR VALUE.
- LRC Analyst Target (6 months): Work-sheet target where covered (ratings.json), else 60% consensus + 40% models (P/FCF, PEG, sector P/E), within ±20% of consensus, -35%/+50% of price.
- Colours: bright green (+1, best 10% of sector) / green / grey / red / bright red (-1, worst 10%). Scanner group views show company value + sector median (hover: market median).
- Setups: Breakout, Retest, Near breakout, Breakdown, Failed retest; entry plans show entry, stop (downside %), two targets (upside %). No position sizes. Summaries show no entry/trading targets.
- One-page summary bottom line = mini thesis (Thesis / Why / What next); all 37 readings vs sector & market; both ratings + valuation verdict.
- Track record (track.html): trading and investment ratings measured separately.

## Automation (all in .github/workflows unless noted)
| Job | When (SAST) | What |
|---|---|---|
| scanner.yml | 06:37 Tue-Sat, 17:47 Mon-Fri | scanner.py (Yahoo prices/fundamentals/analysts + SEC quarterly), company_intel.py (news + SEC filings), track_record.py |
| dashboard.yml | every 4 h, weekdays | live market dashboard |
| daily.yml | 06:07 daily | house-rule watchlist, NY earnings, weekend dashboard edition, Saturday Excel workbook, rating-alert issues |
| live-wire.yml | every 15 min | news wire + breaking bar |
| articles.yml | on new article | article pages, sitemap |
| Claude: LRC News Agent | hourly 06:00-22:00 Mon-Fri | AI brief (docs/data/news.json) |
| Claude: LRC Weekly Research Agent | Saturday 08:37 | agents/watchlist_agent.md: fundamentals, dashboard notes/movers/view, JSE results calendar, screening issue, 5 company research files (agents/research_agent.md) |

## Settings you edit
- docs/data/store.json — report price (R100), report_pay_link (paste Paystack link), brokers (referral partners)
- docs/data/ratings.json — analyst ratings (only the analyst)
- agents/config/scanner.json — JSE universe, ETF list, sector→ETF map
- agents/config/focus.json — extra companies to research / track news
- docs/assets/js/main.js LIBRARY — research library entries

## Pending / to do
- Paystack R100 payment link → store.json
- Broker referral links → store.json brokers
- Optional: weekday Company Research Agent schedule (needs approval in the app)
- Optional: switch analyst-rated coverage (ratings.json) to fully automated

## SAFE MODE (pre-licence) — switched ON 26 Oct 2026
- Switch: `window.LRC_SAFE = true;` near the middle of docs/assets/js/main.js (search "SAFE MODE"). Set to `false` to bring everything back once LRC is FSCA-authorised.
- The one-page summary (stock.html) is NOT in safe mode: it keeps BUY/SELL ratings, the LRC Analyst Target and "Why buy" (owner decision, 26 Oct 2026).
- ON = other public pages show scores and grades only: STRONG BUY/BUY/HOLD/SELL/STRONG SELL shown as Top scoring / Strong / Average / Weak / Lowest scoring; watchlist lists "Trading: top scoring" etc.; entry prices, stop-losses, targets and the LRC Analyst Target hidden (columns, Setups tab, track-record setups and target hit rate, stock-page target table, analyst coverage section); stock bottom line = Thesis / Strengths / Weaknesses / Next; valuation badges say "· MODEL EST."; CSV download has grades, no plans or targets.
- Nothing is deleted: the data and the scanner are unchanged, only what the website displays. Full backup of the pre-safe site: git tag `backup-before-safe-mode` (commit bc0ca0d).
- Not changed: the Live Show page (live trades with stops/targets on screen), the rating-rules article and the tools page calculators (education). Raw JSON under /data still contains ratings and plans.

## Research page (26 Oct 2026)
- research.html top = "The LRC Focus List" (Spotlight + four theme tabs: Value & quality, Score leaders, Technical setups, Earnings watch; ranked rows), built every scanner run by agents/tools/research_ideas.py -> docs/data/scan/research_ideas.json: per market up to 6 each of Quality at a model discount, Strongest all-round scores, Chart setups worth a look, Results in the next 14 days (a company appears once).
- Each card links to: one-page summary, watchlist tag (if on a list), earnings calendar (results date), our articles on it (articles.json tickers), latest news (intel).
- Fed back into the site: company_intel collects news for research ideas; research_agent.md researches them; earnings_sync tags them "Research idea" on the earnings calendar.
- Research library = LIBRARY in main.js (company reports removed 26 Oct) + every article (articles.json) + every weekly dashboard (dashboards/index.json), newest first, sectors built automatically.

## Fully automated (26 Oct 2026)
- Hand ratings retired: docs/data/ratings.json has "ratings": {} (old ratings in git history). No analyst coverage table, no "LRC covered" filter, no LRC analyst tags. Every rating and target comes from the LRC Stock Scanner. Earnings ticks = watchlist names.
