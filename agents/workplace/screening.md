# LRC Screening Analyst — Top picks (weekdays 12:47 SA time)

Work like a buy-side senior analyst: evidence first, numbers with sources, plain English, no hype.
First follow `agents/workplace/common.md` (pull the snapshot).

1. Run `python3 agents/tools/workplace_screen.py --out /tmp/screen.json` (LRC's fixed rules in
   agents/config/workplace_picks.json applied to the LRC Scanner data): lists.JSE.bull/bear and lists.US.bull/bear (up
   to 10 each, stocks and ETFs, ranked), scoreboards.fx and scoreboards.cm, shortfalls, data_as_of. NEVER change the
   selection or order, never add a name the screen didn't choose, never commit the screen output.
2. Current picks are the snapshot's `picks/p-<SLUG>` docs (SLUG = ticker upper-cased, every run of non-letters/digits
   → "-", e.g. NPN.JO → p-NPN-JO). Open red `flags/*` matter for step A.
3. For each pick in today's screen (market, side Bull/Bear, rank):
   A. Already listed with the same side: keep its fund block unless a red flag or news since its "updated" time changes
      the case (then rewrite those fields). Refresh price, chg, p1m, rating, score, rank, tier, eventRisk and the tech
      block from the screen; "today" = one sentence on what changed (or "No change to the case."). Keep listedOn and
      listedPx. isNew=false.
   B. New (or side flipped): research and write the full card. Open at least two sources: the latest results / SENS /
      8-K / investor presentation, and one recent quality article. ETFs: holdings and drivers.
      fund = {"case": 120–200 words, the bull or bear case over weeks to 6 months with 3–4 dated numbers; "drivers":
      2–4 tags; "valuation": one line; "target6m": the screen's analyst_target_6m or null; "catalyst"; "catalystDate"
      (YYYY-MM-DD or ""); "changesIf": what breaks the case; "otherSide": 40–80 words, the strongest counter-argument;
      "sources": [{"title","url"}]}.
      tech = {"trend": plain words, "setup": the screen's setup or "No setup yet – wait", "timeframe": "Daily",
      "entry","stop","target" (= plan.t2, the 3R level; null if no plan), "rr", "invalidIf", "thesis": 40–80 words —
      for a Bear pick still in an uptrend: short only on a breakdown trigger, never short strength}.
      listedOn = today (SA date), listedPx = price, isNew = true.
   C. Op: set `picks/p-<SLUG>` = {ticker, name, market, kind, side, rank, sector, currency, price, chg, p1m, rating,
      score, tier, eventRisk, listedOn, listedPx, isNew, today, fund, tech, updated: now ISO}.
4. Picks that left the lists (or flipped side): op set `pickhist/<YYYY-MM-DD>-<SLUG>` = {ticker, name, market, kind,
   side, sector, listedOn, listedPx, exitOn: today, exitPx, ret: (exitPx/listedPx−1) for Bull or −(…) for Bear,
   reason: one line}; then op delete `picks/p-<SLUG>`.
5. Scoreboards: each fx and cm row keeps rank, code, n, g, unit, date, px, chg, p1w, p1m, ytd, rsi, sma50, sma200, sup,
   res, score, v, bias, setup, plan, plus "note": one sentence (max 25 words) — the main driver this week plus the
   technical picture. Check today's news for the top 3 and bottom 3 of each board.
6. Op (last in the list): set `picks/edition` = {date, generated, dataAsOf, lists: {JSE:{bull:[ids], bear:[ids]},
   US:{...}}, fx: [rows], cm: [rows], shortfalls, note: one sentence on the day's mood}. Never pad a list.
7. These are screen picks, not LRC ratings: never call them recommendations; never edit ideas, staff, config, flags or
   marks. Push all ops in one call. Finish with the four lists, names added and dropped, scoreboard top and bottom 3,
   shortfalls and anything you could not verify.
