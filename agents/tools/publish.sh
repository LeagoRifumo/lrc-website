#!/usr/bin/env bash
# Commit whatever the automation changed and push it (retries if another job pushed first).
set -e
git config user.name "LRC Automation"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A docs agents/work reports 2>/dev/null || true
if git diff --cached --quiet; then echo "Nothing changed."; exit 0; fi
git commit -q -m "$1 — $(TZ=Africa/Johannesburg date '+%Y-%m-%d %H:%M SAST')"
for i in 1 2 3 4; do
  git pull -q --rebase origin main && git push -q origin HEAD:main && { echo "Published."; exit 0; }
  sleep $((i * 5))
done
echo "Push failed after retries"; exit 1
