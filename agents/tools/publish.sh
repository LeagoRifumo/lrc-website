#!/usr/bin/env bash
# Commit whatever the automation changed and push it (retries if another job pushed first).
set -e
git config user.name "LRC Automation"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
for d in docs agents/work reports templates; do [ -e "$d" ] && git add -A "$d"; done
if git diff --cached --quiet; then echo "Nothing changed."; exit 0; fi
git commit -q -m "$1 — $(TZ=Africa/Johannesburg date '+%Y-%m-%d %H:%M SAST')"
for i in 1 2 3 4; do
  # -X theirs: if another job changed the same generated file, this job's fresh output wins (during a rebase "theirs" = our commit)
  git pull -q --rebase -X theirs origin main && git push -q origin HEAD:main && { echo "Published."; exit 0; }
  git rebase --abort 2>/dev/null || true
  sleep $((i * 5))
done
echo "Push failed after retries"; exit 1
