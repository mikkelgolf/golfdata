#!/usr/bin/env bash
# status.sh — print live state of the M1 queue-drainer + M2 dispatcher.
#
# Usage:
#   ./scripts/team-deep-dive/status.sh

set -u

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

echo "=========================================="
echo "  team-deep-dive status — $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

echo ""
echo "## LaunchAgents"
launchctl list 2>/dev/null | grep -iE "CGDDeepDive|HollyCGD" || echo "  (none)"

echo ""
echo "## Active processes"
ps -ef | grep -E "dispatcher\.py|queue-drainer|seed-team|scrape-(school-news|wayback|loc-newspapers|school-archive|rankings|search-aggregator|conference|usga)|extract-facts|reconcile-facts" | grep -v grep | awk '{printf "  PID %s  %s\n", $2, substr($0, index($0,$8))}'

echo ""
echo "## M2 dispatcher jobs"
JOBS_DIR="data/team-deep-dive/jobs"
if [ -d "$JOBS_DIR" ] && ls "$JOBS_DIR"/*.json >/dev/null 2>&1; then
  for f in "$JOBS_DIR"/*.json; do
    python3 -c "
import json, sys
d = json.load(open('$f'))
slug = d.get('school_slug','?')
status = d.get('status','?')
phase = d.get('current_phase') or '-'
phases = ', '.join(d.get('phases_complete') or []) or '-'
print(f'  {slug:24} {status:12} phase={phase:20} done=[{phases}]')
" 2>/dev/null
  done
else
  echo "  (no manifests)"
fi

echo ""
echo "## M1 queue-drainer queue.txt"
QUEUE="data/team-deep-dive/queue.txt"
if [ -f "$QUEUE" ]; then
  size=$(grep -cv "^[[:space:]]*\(#\|$\)" "$QUEUE")
  echo "  $size pending lines"
  head -5 "$QUEUE"
fi

echo ""
echo "## Evidence corpus"
ED="data/team-deep-dive/evidence"
if [ -d "$ED" ]; then
  for d in "$ED"/*/; do
    slug=$(basename "$d")
    count=$(find "$d" -maxdepth 1 -name '*.json' 2>/dev/null | wc -l | tr -d ' ')
    echo "  $slug: $count evidence files"
  done | sort
fi

echo ""
echo "## Extracted facts"
EF="data/team-deep-dive/extracted-facts"
if [ -d "$EF" ]; then
  for f in "$EF"/*.json; do
    [ -f "$f" ] || continue
    slug=$(basename "$f" .json)
    count=$(python3 -c "import json; print(len(json.load(open('$f'))))" 2>/dev/null || echo "?")
    echo "  $slug: $count facts"
  done
fi

echo ""
echo "## Recent dispatcher log (last 10 lines from ndjson)"
LOGS=$(ls -t logs/deep-dive/*.ndjson 2>/dev/null | head -1)
if [ -n "$LOGS" ]; then
  tail -10 "$LOGS" | python3 -c "
import sys, json
for ln in sys.stdin:
    try:
        d = json.loads(ln)
        ts = d.get('ts','')[:19]
        ev = d.get('event','')
        ph = d.get('phase','')
        rc = d.get('returncode')
        extra = f' rc={rc}' if rc is not None else ''
        print(f'  {ts}  {ev:14} phase={ph}{extra}')
    except Exception:
        pass
"
else
  echo "  (no logs yet)"
fi

echo ""
echo "## LaunchAgent stdout (last 5 lines)"
for f in ~/Library/Logs/cgd-deep-dive*.stdout.log; do
  [ -f "$f" ] || continue
  echo "  --- $(basename "$f") ---"
  tail -5 "$f" | sed 's/^/    /'
done

echo ""
echo "=========================================="
