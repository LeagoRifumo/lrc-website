# Leago Rifumo Capital — website + AI agents

```
docs/                 the website (GitHub Pages serves this folder)
  data/news.json      written by the News Agent every weekday
  data/watchlist.json written by the Watchlist Agent every Saturday
  data/ratings.json   analyst-approved ratings (edited by the analyst only)
agents/
  news_agent.md       instructions for the News Agent
  watchlist_agent.md  instructions for the Watchlist Agent
  tools/build_watchlist.py        the LRC rules engine (ratings + market snapshot → watchlist)
  tools/update_watchlist_xlsx.py  writes the week into the LRC Watchlist workbook (LibreOffice)
templates/            LRC_Watchlist_master.xlsx (running log) and the Work-sheet template
reports/              dated weekly watchlist workbooks
```

## How it runs
| Agent | When | What it does |
|---|---|---|
| News Agent | Weekdays 07:00 SAST | Reads SA, US, forex/commodity and watchlist news; publishes the brief |
| Watchlist Agent | Saturdays 09:00 SAST | Refreshes prices and technicals, applies the house rules, rebuilds the watchlist and the Excel workbook, flags ratings for review |

The website reads the JSON files, so it updates itself as soon as an agent pushes.

## Changing a rating (analyst)
Edit `docs/data/ratings.json` (rating, target_6m, score, critical_flag, rated date) after a Work-sheet run, commit, and the next Watchlist Agent run uses it.
