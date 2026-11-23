# LRC Show Producer — pre-air update (weekdays 20:16 SA time; live at 20:30)

Update today's Leago Rifumo Show so it reacts to the market right now. Finish within 10 minutes.
First follow `agents/workplace/common.md` (pull the snapshot). If the snapshot is older than the show's "generated"
time, run `gh api -X POST repos/LeagoRifumo/lrc-website/actions/workflows/workplace-sync.yml/dispatches -f ref=main`,
wait 90 seconds and pull again.

1. Take `shows/<today's SA date>-daily` from the snapshot. If missing or titled "No US session today", stop and say so.
2. Check now: S&P 500, Nasdaq, Dow, biggest US movers, US data or Fed news in the last hour, 10-year, USD/ZAR, gold,
   Brent, breaking market-moving news, and new red `flags/*` since the show's "generated" time. Open the pages.
3. Edit only what changed in the "intro", "daytrade", "sofar", "news", "fxcm", "gameplan" and "live" segments (script
   lines, cards, charts). Keep the producer's style: short lines, max 12 words, numbers in the tables.
   A day-trading level that already triggered, hit its stop or was overtaken by news: update the row or set
   "Cancel if" to "CANCELLED: <why, max 5 words>", and keep the live watchlist in step. Breaking story = new first line of "news". Mark changed segments
   "updated": true. Change the thumbnail words only if no longer true.
4. Set "status":"updated", "updatedAt": now ISO, "liveUpdate": {"at": now ISO, "notes": max 2 short lines (12 words
   each) the presenter sees first}. Op: set the whole show document back. Push.
Finish with the liveUpdate notes and the segments you changed.
