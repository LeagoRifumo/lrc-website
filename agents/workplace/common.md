# LRC Workplace agents — how to read and write the Workplace

The LRC Workplace is the private staff page at leagorifumocapital.co.za/workplace.html. Its data lives in the members
database (Supabase), which agents cannot reach directly. Use the encrypted bridge in this repo:

1. Setup (once per run): the repo is cloned at /tmp/lrc with push access, and `WP_KEY` is exported (it is in your task
   prompt). Never print, log or commit WP_KEY.
2. READ: `python3 agents/tools/wp_bridge.py pull` writes `/tmp/wp_mirror.json` = `{"generated": ISO, "docs": {path: data}}`.
   Paths are `collection/id`, e.g. `ideas/<id>`, `flags/<id>`, `marks/<ideaId>`, `picks/edition`, `picks/p-NPN-JO`,
   `pickhist/<id>`, `shows/<YYYY-MM-DD>-daily`, `forecasts/<Monday>`, `system/<name>`. The snapshot is refreshed every
   15 minutes on weekdays and right after every drop. Check `generated`; if it is more than 30 minutes old, say so.
3. WRITE: put ALL of this run's changes in one JSON list in `/tmp/ops.json`:
   `[{"op": "set", "path": "flags/20261120-1300-MKT-1", "data": {...}}, {"op": "merge", "path": "...", "data": {...}}, {"op": "delete", "path": "..."}]`
   - `set` replaces the whole document, `merge` changes only the given top-level fields, `delete` removes it.
   then run `python3 agents/tools/wp_bridge.py push /tmp/ops.json --by "<your agent name>"`.
   The "LRC Workplace sync" GitHub Action loads it into the Workplace within about two minutes.
   Use letters, digits, `-`, `_`, `.` only in ids.
4. Never write decrypted Workplace data (the snapshot, ops files, theses) into the repo or any public place. Only
   `wp_bridge.py push` touches the repo. Never change `staff`.
5. Same house rules as all LRC agents: every number from a page you opened or from the snapshot/repo data, with its
   date; never estimate; your own words, quotes under 15 words; research and education, not advice; never mention LRC's
   account, money or position sizes in anything for the stream.
