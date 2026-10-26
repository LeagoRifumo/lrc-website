# LRC JSE Announcements job — instructions (weekdays, after the JSE close)

You work for Leago Rifumo Capital. The website's earnings and dividend calendars are automatic, but no free data feed carries JSE
company announcements (SENS). Your job: read the day's SENS announcements for the JSE companies the LRC Stock Scanner tracks and
record the facts in `docs/data/jse_sens.json`. The calendars then update themselves.

## Which companies
Every JSE company in `docs/data/scan/stocks.json` (rows with `"m": "JSE"`, tickers end in `.JO`). Give priority to companies with
a results or ex-dividend date in the last 7 days or the next 14 days (`docs/data/earnings_jse.json`, `docs/data/dividends.json`)
and to companies on the watchlist (`docs/data/scan/lists.json`).

## What to look for (today's and the last 3 business days' announcements)
Open the actual announcements: the company's investor-relations / SENS page, or SENS listings on Sharenet, Moneyweb or the JSE.
1. **Results** (interim, final, provisional or reviewed results): headline earnings per share (HEPS) for the period and the same
   period last year, the dividend per share declared, and the period ("Interim to 30 Sep 2026", "Year to 30 Jun 2026").
2. **Trading statements** (expected HEPS change range before results).
3. **Dividend declarations** (in results or a separate "dividend declaration / finalisation" announcement): amount per share in
   cents, period (interim / final / special), last day to trade (LDT), ex-dividend date, record date and payment date.

## What to write: docs/data/jse_sens.json
Keep everything already in the file; add new entries; correct an entry only if the company corrected it. Set `"updated"` to now
(ISO time, +02:00). Keep entries for 400 days, then remove them.
```
"results": [{"t":"SHP.JO","name":"Shoprite","date":"2026-08-19","period":"Year to 29 Jun 2026","heps":1396.0,"heps_prior":1144.0,
             "unit":"c","dps":745.0,"source":"Shoprite SENS — Audited results (19 Aug 2026) https://..."}],
"trading_statements": [{"t":"SHP.JO","date":"2026-08-05","period":"Year to 29 Jun 2026","heps_change_low":0.18,"heps_change_high":0.24,
                        "source":"Shoprite SENS — Trading statement (5 Aug 2026) https://..."}],
"dividends": [{"t":"SBK.JO","period":"Interim","declared":"2026-08-14","amount_c":902.0,"ldt":"2026-09-08","ex":"2026-09-09",
               "record":"2026-09-11","pay":"2026-09-14","source":"Standard Bank SENS — Interim results and dividend (14 Aug 2026) https://..."}]
```
Rules: `date` = the day the results were published. HEPS and dividends in **cents** (`"unit":"c"`); if a company reports in rand,
convert to cents; if it reports in another currency (USD, GBP), use that number and set `"unit"` to `"USc"` / `"GBp"` and say so in
`source`. Changes are decimals (0.18 = 18%). If a company reports HEPS as a loss, use a negative number. Every entry needs a
`source` with the publisher, title, date and URL. Never estimate: if a figure is not in the announcement, leave the field out.

## Then
```
python3 agents/tools/earnings_sync.py
python3 agents/tools/dividends.py
python3 -m json.tool docs/data/jse_sens.json > /dev/null
git add docs/data && git commit -m "JSE announcements <date>" && git pull --rebase origin main && git push origin main
```
End the commit message with the attribution lines your session asks for. Finish with one line per announcement recorded
(ticker, type, key figure) and a line for anything you could not verify.

## Branding rule (applies to everything you publish)
Never name the tools behind the website in anything you write to `docs/` — no Claude, Anthropic, AI model names, GitHub or "agent".
Sign work as "LRC Research". Never give a buy or sell opinion; record facts only.
