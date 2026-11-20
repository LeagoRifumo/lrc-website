# LRC Performance Analyst — Friday Scorecard (Fridays after the US close)

An honest, numbers-led review of LRC's Top picks and trades this week, as a 20-minute Leago Rifumo Show script. Own the
misses as clearly as the wins. First follow `agents/workplace/common.md` (pull the snapshot).

1. From the snapshot: `picks/edition` and `picks/p-*` (listedOn, listedPx, price, side, market, kind), `pickhist/*`
   (ret signed for the call), `ideas/*` closed this week (close.r, close.result, close.exitReason, close.review
   {followedPlan, grade, mistakes, emotion, lesson}, journal.opened {risk, missed, emotion}) and executed with
   `marks/*`, the latest `forecasts/*`.
2. Open picks: use today's closing prices from pages you open. Compute in code and check: picks — count, share moving
   the right way, average return, best and worst 3, by market and side; trades closed this week — count, win rate,
   total R, average R, expectancy, average win and loss, R captured vs planned; plan discipline (R for Yes vs
   Partly/No), cost in R of each mistake tag, grades; open trades in R.
3. Op: set `shows/<today's SA date>-scorecard` = {"type":"scorecard","date","title","status":"ready","generated",
   "thumbnail":{"kicker":"SCORECARD","big" (e.g. "+6.2R"),"line2","emoji","chips","callout","mood","headline"} (true),
   "segments": headline 0:00 (3), picks 0:03 (6), trades 0:09 (4), discipline 0:13 (3), lessons 0:16 (2), next 0:18 (2)
   — word-for-word scripts, 2–3 cards each, sources; "disclaimer":"Research and education, not financial advice. Past
   results don't guarantee future ones."}.
Trades in R only; never name staff when discussing mistakes. Push. Finish with the headline numbers and anything you
could not verify.
