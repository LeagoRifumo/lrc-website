# Leago Rifumo Capital website — v8 (updated 26 Oct 2026, 04:20 SAST)

Repository: github.com/LeagoRifumo/lrc-website (branch main, GitHub Pages serves /docs)
Give this file (and the zip) to Claude when you next update the website.

## How to start next time
1. Open a new chat and say: "Continue the LRC website — repo LeagoRifumo/lrc-website. Read WEBSITE_V8_SUMMARY.md first."
2. Attach this file (or the zip). Claude reads it, attaches the GitHub repo and carries on from here.
3. Everything on the live site is in the repo; this file explains what each part does and what was decided.

## Decisions made on 25–26 Oct 2026 (keep these unless Prayer changes them)
- Fully automated: no hand ratings; every rating, target and list comes from the LRC Stock Scanner.
- Safe mode ON until LRC is FSCA-authorised (see SAFE MODE below). The one-page summary (stock.html) keeps BUY/SELL, the LRC Analyst Target and "Why buy" by Prayer's choice.
- "Undervalued / overvalued" kept, marked "model estimate". Page names Watchlist and Scanner kept.
- No tool names on the public site (no GitHub, Claude, "agent"); the news section is called News Desk.
- Prices: rand in South Africa, US dollars elsewhere (R100 / $6 report).

## Pages
- index.html — home (LRC Stock Scanner featured)
- scanner.html — LRC Stock Scanner (Sort dropdown + tap the rating header to sort STRONG BUY↔STRONG SELL): JSE / New York switch; tabs Stocks (Factor grades | All readings), Setups & entries, Investment ideas, ETFs, Sectors, How scoring works; Full screen; CSV
- stock.html?t=TICKER — free one-page summary (Download PDF) + "Buy the full report — R100"
- watchlist.html — FULLY AUTOMATED from the scanner (agents/tools/watchlist_lists.py → docs/data/scan/lists.json, rebuilt every scanner run): per market Top 5 BUY + Top 5 SELL for Trading (3-12m, by Trading score) and Top 5 BUY + Top 5 SELL for Investment (5-10y, by Investment score); watchlist news; LRC analyst coverage (re-priced daily). Home page card reads the same lists.
- track.html — track record of every scanner rating (from 25 Oct 2026)
- dashboard.html — Market dashboard (renamed from "Weekly", 28 Oct): one colour-coded table (SA | US & global | Commodities; green/red = good/bad for investors), live edition every hour 06:17–22:17 SAST on weekdays, saved end-of-week snapshots; Market heatmap (sectors → companies, size = market value, colour = move; JSE / New York; Today / Week / Month) and Top gainers / Top losers / Biggest moves from the scanner
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
- Valuation verdict (28 Oct 2026): UNDERVALUED = 20%+ upside to the LRC Analyst Target, or ratios net ≥ +2 with 10%+ upside; OVERVALUED = 20%+ downside, or ratios net ≤ -2 with 5%+ downside; else FAIR VALUE.
- LRC Analyst Target (from 28 Oct 2026, scan_engine.intrinsic/model_targets): AVERAGE of the methods that fit — 1 DCF on FCF (2-stage, 5 yrs fading to terminal), 2 residual income 2-stage (Financial Services), 3 dividend + buyback model (Real Estate, Utilities, Financial Services), 4 EV/EBITDA vs sector median (Basic Materials/Energy on 5-yr average EBITDA) — plus analyst consensus median when 3+ analysts; range = min–max; 5 reverse DCF = implied growth (shown only). Cost of equity = 10y yield (SA/US from the live dashboard) + ERP 5.5% JSE / 5% US ± beta adj (max ±2%); terminal growth 4.5% JSE / 2.5% US; growth yrs 1–5 = avg(analyst EPS growth, 5-yr revenue CAGR) capped -5%..20%. Methods outside 0.25x–4x price dropped; target within 0.5x–2x price. PEG removed from targets (still one of the 37 scoring readings). OLD (before 28 Oct): 60% consensus + 40% models (P/FCF, PEG, sector P/E), within ±20% of consensus, -35%/+50% of price.
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
- Book a FAIS compliance call (e.g. Moonstone or Masthead): is our content advice; Category I licence for shares; joining an existing FSP as a representative; the one-page summary, Live Show page and raw /data files. Then decide when to switch safe mode off.
- Prayer: RE5 exam first (representative), later RE1 + qualifications for Key Individual if LRC gets its own licence.
- Business strategy doc (claude.ai artifact "LRC Business Strategy — Traffic, Monetisation & Running LRC…"): summary written, sections 2–9 still to fill.
- Update the SOP doc to the fully automated site (it still mentions analyst ratings / Work-sheets).
- Payments and monetisation later: Paystack R100 / $6 links → store.json; broker partners → store.json brokers.
- Optional: connect Gmail to Claude so updates can be emailed.

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

## Dividend calendar (26 Oct 2026)
- dividends.html (own top-menu item "Dividends" next to Earnings, plus Markets menu, on every page; in sitemap). Data: docs/data/dividends.json built by agents/tools/dividends.py after every scanner run (scanner.yml step).
- For every scanned company: confirmed next ex-date (feed), payment date (scanner now saves f.div_pay), last day to buy (business day before the ex-date; JSE T+3, US T+1), dividend per share (JSE cents shown in rand), payments a year, yield, payout, grades, watchlist / Focus List tags. Expected dates = last year's ex-date + 1 year with last year's amount, replaced once announced. Last 30 days shown as "went ex".
- Filters: market, period (14 days to 4 months, or last 30 days), confirmed only, minimum yield, search.

## Results tracking — earnings & dividends (26 Oct 2026)
- Earnings: every calendar date is recorded in docs/data/earnings_log.json (earnings_sync.py, every scanner run). After a company reports, the row stays 45 days under "Reported · beat or missed": beat (EPS >1% above estimate, green), missed (red), in line, or awaiting numbers. New York results come from the Nasdaq calendar (earnings_us.py past_results, last 30 days, daily); otherwise from the scanner's EPS history (f.eps_hist, Yahoo earningsHistory). JSE companies rarely have a consensus estimate, so most show "Reported".
- Dividends: every dividend is recorded in docs/data/dividends_log.json (dividends.py). Lifecycle Expected → Confirmed → Went ex → Paid (or Paid (estimated) when the feed has no payment date: JSE 14 days, US 35 days after the ex-date). Paid view = last 60 days with raised (green) / cut (red) / unchanged vs the same payment a year earlier.
- Both pages: Upcoming / Reported switch and a scorecard strip.
- Calendar extras (26 Oct): weekly summary strip on both Upcoming views; countdown chips (Today / In N days; gold when within 3 days); earnings rows show the last 4 quarters as beat/miss/in-line dots (earnings_sync "track" from f.eps_hist); "Add to my calendar" (.ics) per row and for the whole filtered list (window.LRCCal in main.js); dividends income estimate (amount box → ≈ payout per row).

## JSE results & dividends from SENS (26 Oct 2026)
- docs/data/jse_sens.json holds JSE announcements: results (HEPS vs same period last year), trading statements (expected HEPS change range) and dividend declarations (amount in cents, LDT, ex, record, pay dates), each with its source. Filled every weekday by the scheduled task "LRC JSE Announcements" following agents/jse_sens_agent.md.
- earnings_sync.py: JSE reported rows = HEPS up (green) / down (red) / flat vs last year; until SENS is read, year-end results fall back to the feed's annual EPS (marked provisional). Upcoming JSE rows show the latest trading statement.
- dividends.py: SENS declarations replace the feed's dates and amounts (tag "SENS", record date shown); JSE dividends then show Paid on the real payment date.

## 28 Oct 2026 — statements, thesis, heatmap, SEO
- Financial statements: agents/tools/statements.py → docs/data/fs/<TICKER>.json (workflow statements.yml, daily 05:23 SAST, each company refreshed weekly). Income statement, balance sheet, cash flow; annual (US: up to 10 years, Yahoo + SEC 10-K for older headline lines; JSE: 4–5 years from Yahoo, older years are kept so history grows) and quarterly (US) / interim (JSE half-year balance sheets). EPS is never taken from old SEC filings (not split-adjusted).
- Summary page (stock.html): a short "Why we're looking at X" box inside the paper (top 3 radar reasons + jump links), toolbar buttons "LRC Thesis ↓" and "Financial statements ↓"; below the one-page paper (owner chose this layout on 28 Oct, the in-paper version was reverted): "LRC Thesis — why we're looking at X" (radar reasons incl. Watchlist / Focus List, company, fundamentals + statement track record, valuation, bull/bear, recommendation trading + investment, what to watch) and "Financial statements" (Income / Balance / Cash flow × Annual / Quarterly, chart, key ratios, Y/Y, CSV). Not in the PDF.
- SEO: agents/tools/company_pages.py (statements.yml step) builds docs/shares/<slug>.html for every scanned company (e.g. shares/mtn-jse.html, shares/aapl.html) + docs/shares/index.html (Shares A–Z). Unique title/description/keywords, canonical, BreadcrumbList + WebPage(about Corporation) + FAQPage JSON-LD, ratios vs peers, statement highlights, dividends, peers (internal links), FAQ. Safe-mode wording (grades, no targets). Rebuilt weekly or when statements refresh. Sitemap lists shares pages (build_articles.py and company_pages.py); stock.html?t= links removed from the sitemap and the summary sets its canonical to the company page. "Shares A–Z" in the Research menu and footers.
- Site-wide company search: 🔍 button in every header (or press "/"): name or ticker → one-page summary, or "Profile" → shares page (main.js, reads scan/stocks.json).
- Health check: .github/workflows/health.yml every 3 hours runs agents/tools/health_check.py — checks the age of scanner, lists, dividends, live dashboard, wire, News Desk, NY earnings, statements and track record; opens one GitHub issue "LRC health check: …" (GitHub emails the owner) when something is late and closes it when fresh again.

## 28–29 Oct 2026 — scale-up, live prices, strict gates
- Universe (agents/tools/universe.py, every scanner run, cached in agents/work/universe.json): New York = 2,500 largest US common stocks from the Nasdaq screener (market value $300m+, price $2+, no funds/warrants/units/preferreds; in practice ~$1bn+), JSE = every ordinary share Yahoo lists on the JSE (3-character codes; no ETFs/ETNs/AMCs/preference shares) + the curated list in scanner.json. Scanner skips US < $2m and JSE < R100k value traded a day; flags "thin" below R1m (JSE) / $5m (US). First run: 2,563 companies (JSE 139, US 2,424).
- Live: live-wire.yml (minutes 7,22,37,52 every hour) = news wire + quotes_live.py (docs/data/scan/quotes.json: price + day move for every company) + dashboard_auto.py (live market dashboard). dashboard.yml is manual only. GitHub runs scheduled jobs best-effort, so "every 15 minutes" can slip to 20–40 minutes at busy times.
- Front end overlays quotes.json on the scanner table, heatmap, top movers and search (window.LRCIndex in main.js reads scan/index.json, a light file written by the scanner). Dashboard has a market-breadth strip (rising/falling, average move, best/worst sector).
- Strict senior-analyst gates (scan_engine.analyst_gates, after the score-based rating): Trading BUY needs 10%+ upside, price above 200-day, not thin, no results within 3 days, fresh fundamentals; STRONG BUY also 15%+ upside, above 50-day, RSI < 75; broken chart (below 50 & 200-day) + score < 50 + 5% downside → SELL; STRONG SELL = broken + score < 35 + 10% downside; no SELL while the target is above the price. Investment BUY needs not overvalued, quality grade A/B, positive FCF (non-financials), D/E < 2; STRONG BUY needs undervalued + grade A; overvalued + score < 50 → SELL; loss-making + negative FCF + score < 50 → SELL. Reasons go into v_note / iv_note (shown in the scanner and on summaries).
- Statements: 1,000 companies per daily run; SEC 10-K history fetched only when missing or older than 90 days (sec_date).
- Repo size: per-company files are rewritten every scan; .git was 134 MB on 28 Oct. If it passes ~2 GB, squash the history of docs/data (keep the code history) — ask Claude.
