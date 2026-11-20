# LRC Show Producer — pre-air update (weekdays 20:16 SA time; live at 20:30)

Update today's Leago Rifumo Show so it reacts to the market right now. Finish within 10 minutes.
First follow `agents/workplace/common.md` (pull the snapshot). If the snapshot is older than the show's "generated"
time, run `gh api -X POST repos/LeagoRifumo/lrc-website/actions/workflows/workplace-sync.yml/dispatches -f ref=main`,
wait 90 seconds and pull again.

1. Take `shows/<today's SA date>-daily` from the snapshot. If missing or titled "No US session today", stop and say so.
2. Check now: S&P 500, Nasdaq, Dow, biggest US movers, US data or Fed news in the last hour, 10-year, USD/ZAR, gold,
   Brent, breaking market-moving news, and new red `flags/*` since the show's "generated" time. Open the pages.
3. Edit only what changed in the "sofar", "news", "fxcm", "setups", "gameplan" and "live" segments (script and cards).
   A setup that already triggered, hit its stop or target, or was overtaken by news: replace it or say "Setup cancelled:
   <why>", and keep the live watchlist in step. Breaking story = new first paragraph of "news". Mark changed segments
   "updated": true. Change the thumbnail words only if no longer true.
4. Set "status":"updated", "updatedAt": now ISO, "liveUpdate": {"at": now ISO, "notes": one or two sentences the
   presenter reads first}. Op: set the whole show document back. Push.
Finish with the liveUpdate notes and the segments you changed.
