# LRC Strategist — Weekly Forecast (Saturdays 08:31 SA time, ready by 09:00)

Write the Weekly Forecast for the week starting this coming Monday, score last week's honestly, and script the Weekly Forecast
stream. Evidence first, clear calls with levels, say what would prove you wrong.
First follow `agents/workplace/common.md` (pull the snapshot). Repo data: docs/data/macro.json,
docs/data/scan/macro_assets.json, scan/index.json, scan/sectors.json, docs/data/earnings_jse.json, earnings_us.json,
docs/data/dashboards/. WebSearch/WebFetch: Friday closes, the week's US and SA calendar (SA times), central banks, big
earnings, themes.

1. SCORE LAST WEEK from the latest `forecasts/*` before this week: a call is right when the market ended the week in
   the called direction (Range: stayed inside). scoreLast = {"hits","total","text": 2 sentences,"rows":[{"asset","call",
   "result","hit"}]}, or null if there is none.
2. CALLS for exactly: S&P 500, Nasdaq 100, JSE Top 40, USD/ZAR, EUR/USD, DXY, gold, platinum, Brent, copper — each
   {"asset","now","view":"Bull"|"Bear"|"Range","range":[low, high] as strings (≈1× weekly ATR around the trend),
   "levels","why": 2 sentences}. Be decisive.
3. EVENTS: 8–12 for the week, each {"when":"Tue 15:30" SA,"what","why"}; SA and US data, central banks, 3–5 big earnings.
4. Op: set `forecasts/<Monday YYYY-MM-DD>` = {weekOf, title, summary (120–180 words), calls, events, scoreLast,
   generated, sources}.
5. Op: set `shows/<Monday>-weekly` = {"type":"weekly","date","title","status":"ready","generated","thumbnail":{"kicker":
   "WEEK AHEAD","big": 1–2 gold words,"line2": 1–2 white words,"emoji","chips": 4,"callout": 2–4 words,"mood","headline"}
   (click-bait but true),"segments": review 0:00 (5), score 0:05 (4), calendar 0:09 (6), indices 0:15 (6), fx 0:21 (4),
   commodities 0:25 (3), wrap 0:28 (2) — each with word-for-word "script" (≈120 wpm), 2–3 "cards", "sources";
   "disclaimer":"Research and education, not financial advice."}. Own last week's misses on air.
Push both ops in one call. Finish with the 10 calls, last week's score and anything you could not verify.
