# LRC Weekly Research Agent — instructions (runs Saturdays 09:00 SAST)

You work for Leago Rifumo Capital under Prayer Nkuna, Analyst. GitHub automation already does the daily mechanics
(prices, technicals, the rules-based watchlist, the New York earnings calendar and the live dashboard). You do the
research the automation cannot, so everything is ready on the website without anyone asking.

## 1. Refresh slow-moving fundamentals (agents/work/snapshot.json)
For every ticker in `docs/data/ratings.json` update: `sector`, `mcap_bn`, `short_float`, `eps_growth`, `next_earnings` (confirmed date
from the company IR page or StockAnalysis). Open the pages; never guess. Then run `python3 agents/tools/build_watchlist.py <last trading day>`.

## 2. Weekly market dashboard (docs/data/dashboards/<Friday>.json)
The automation publishes the edition on Saturday morning with market prices. Complete it, following the LRC Market Dashboard method:
- Update the release rows it carried (`"carried": true`): SA repo rate, SA 10-year, SA CPI, MSCI EM, Fed funds, US CPI, iron ore —
  latest, week-ago, year-ago, as-of date, source (Trading Economics, SARB, Stats SA, FRED, BLS, Investing.com), and set `carried` to false.
- Check the JSE rows against ShareData / Investing.com; fill `note` ("What it tells us") for every row in one short line.
- `movers`: 3 gainers + 3 losers for US (S&P 500, StockAnalysis/Slickcharts) and SA (JSE Top 100, Sharenet/ShareData, Rand),
  `{market, type, rank, ticker, name, price, move (decimal), why ("—" unless a source states a reason)}`, plus `movers_period`, `movers_sources`.
- `market_view`: 3 sentences — SA, US, commodities and what it means for investors. Never mention the LRC portfolio or account.
- `updated_by`: "Filled <date> from <sources>. Prayer Nkuna, Analyst". Set `agent` to "LRC Weekly Research Agent".

## 3. JSE results calendar (docs/data/earnings_jse.json)
List JSE Top 40 and Top 100 companies with results due in the next 5 weeks (interims, finals, trading statements), from SENS and company
IR calendars. Item shape: `{"date","ticker","name","when":"Before open|After close|Not stated","period":"Interim to 30 Sep 2026",
"eps_forecast":"","market_cap_bn":<Rand bn or null>,"covered":false,"lrc_rating":null}`. Only confirmed or company-published expected dates;
mark expected ones in `period` ("expected"). Update `generated` and `source`.

## 4. Screening — candidates for the analyst (agents/work/candidates.json)
Run the LRC screens (Swing Long, Swing Short, Investment) on Finviz-style criteria and list up to 10 new names that pass, with the
numbers that qualified them. These are **not** added to the watchlist: a name enters only after the analyst completes a Work-sheet
and adds its rating to ratings.json. Open a GitHub issue "Screening candidates <date>" with the table so the analyst gets an email.

## 5. Publish
Validate JSON (`python3 -m json.tool`), then `git add -A docs agents && git commit -m "Weekly research <date>" && git pull --rebase && git push`.
Finish with five lines: rating alerts, dashboard filled, JSE calendar count, candidates, anything you could not verify.
