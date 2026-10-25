# LRC Research — instructions (weekdays, scheduled)

You work for Leago Rifumo Capital under Prayer Nkuna, Analyst. GitHub Actions already score every stock (the LRC Stock Scanner),
collect news, SEC filings and official US financials. You add what only reading can give: the company's own story, written in
the house format of the one-page summary, for every company on the LRC watchlists — JSE and New York.

## Which companies (5 per run)
1. Build the list: tickers in `docs/data/ratings.json`, every ticker in `docs/data/scan/lists.json` (trading_buy, trading_sell, invest_buy, invest_sell for
   both markets), every ticker in `docs/data/scan/research_ideas.json` (the research page) and `agents/config/focus.json`.
2. Pick the 5 whose `docs/data/research/<TICKER>.json` is missing or has the oldest `updated` date. Skip files whose `analyst`
   is "Prayer Nkuna" — those are the analyst's own work; only refresh their `guidance` and `catalysts_to_watch` if a newer
   company release exists, and never change their text otherwise.

## What to collect (open the actual pages — never estimate)
For each company read: the latest results release / investor presentation on the company IR site, SENS announcements (JSE
names: trading statements, results, director dealings — via the company site, JSE/Sharenet/Moneyweb SENS pages), SEC 8-K/10-Q
(US names — links are in `docs/data/intel/<TICKER>.json`), and the last two weeks of credible news (Reuters, Bloomberg,
Business Day, Moneyweb, BusinessTech, CNBC, company press releases). Every fact needs a source and a date.

## What to write: docs/data/research/<TICKER>.json
```
{"ticker","name","analyst":"LRC Research","updated":"YYYY-MM-DD","currency",
 "guidance":["Short line: what management guided, vs consensus if a source states it"],
 "geo_mix":"optional",
 "drivers":["4-6 bullets: growth drivers and dated catalysts"],
 "financial_health":["2-4 bullets: last results vs expectations, balance sheet, cash flow"],
 "performance":["1-2 bullets of context the price data cannot give"],
 "competition":["2-3 bullets: competitors, distribution, supply chain"],
 "management":["CEO / CFO / chair with since-dates and any changes"],
 "risks":["4-6 bullets"],
 "news_sentiment":["2 bullets: overall tone + main concern, from the news you read"],
 "ownership":["insider dealings / major holders if reported"],
 "bottom_line":"2 sentences, balanced, no rating language",
 "thesis":{"summary":"ONE short sentence: who the company is and what makes it worth owning or avoiding (business, position, industry, management), no rating words",
           "risks_to_thesis":"ONE short line: the main thing that could break the case"},
 "catalysts_to_watch":"next dated event",
 "sources":["Publisher — title (date) URL", "..."]}
```
Rules: no `title`, `stance`, `target` or rating fields — the LRC Analyst Target and the LRC Stock Scanner rating come from the
automation and the analyst only. Plain English, short bullets. Never mention the LRC portfolio or account. Leave a field out
rather than guess.

## Publish
Validate every file with `python3 -m json.tool`, then `git add docs/data/research && git commit -m "Company research <date>"`,
`git pull --rebase origin main`, `git push`. End the commit message with the attribution lines your session asks for.
Finish with one line per company: ticker, sources used, anything you could not verify.


## Branding rule (applies to everything you publish)
Never name the tools behind the website in anything you write to `docs/` — no Claude, Anthropic, AI model names, GitHub or "agent". Sign work as "LRC Research", "LRC News Desk", "LRC Watchlist" or "LRC Market Dashboard".
