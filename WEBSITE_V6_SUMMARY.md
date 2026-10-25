# Leago Rifumo Capital website — v6 (25 Oct 2026)

Repository: github.com/LeagoRifumo/lrc-website (branch main, GitHub Pages serves /docs)
Give this file (and the zip) to Claude when you next update the website.

## Pages
- index.html — home (LRC Stock Scanner featured)
- scanner.html — LRC Stock Scanner: JSE / New York switch; tabs Stocks (Factor grades | All readings), Setups & entries, Investment ideas, ETFs, Sectors, How scoring works; Full screen; CSV
- stock.html?t=TICKER — free one-page summary (Download PDF) + "Buy the full report — R100"
- watchlist.html — LRC coverage (analyst ratings), trading longs/shorts (up to 10 per market), investment (up to 10 per market), watchlist news, house-rule setups
- track.html — track record of every scanner rating (from 25 Oct 2026)
- dashboard.html, earnings.html, news.html, articles.html, research.html, tools.html, academy.html, markets.html, show.html, contact.html, write.html

## Scoring (agents/tools/scan_engine.py)
- Six factors, each 0-100 = percentile vs same sector & market (momentum/technical: whole market):
  Value 20%, Growth 20%, Profitability 20%, Momentum 20%, Sentiment 10%, Technical 10%. Grades A 80+, B 60+, C 40+, D 20+, F <20.
- LRC score 0-100 = percentile rank of the weighted composite within the market (85 = above 85% of companies).
- Rating: 80+ STRONG BUY, 60-79 BUY, 40-59 HOLD, 20-39 SELL, <20 STRONG SELL.
  BUY needs >= +5% to the LRC Analyst Target (STRONG BUY +10%); SELL needs downside — otherwise HOLD ("held: target x%").
- LRC Analyst Target (6 months): analyst's Work-sheet target where covered (docs/data/ratings.json), else 60% consensus + 40% LRC models
  (P/FCF, PEG, sector P/E), within ±20% of consensus and -35%/+50% of price.
- Setups: Breakout (55-day high / major resistance on 1.5x volume), Retest of major support, Near breakout, Breakdown, Failed retest.
  Entry plans show entry, stop (downside %), two targets (upside %). No position sizes anywhere. Summaries show no entry/trading targets.
- Investment track: 10 quality checks, grade A (8+) / B (6+) / C.

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
