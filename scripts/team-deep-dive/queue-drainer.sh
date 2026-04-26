#!/usr/bin/env bash
# queue-drainer.sh — drain the team-deep-dive queue continuously.
#
# Reads one "<slug> <men|women>" line at a time from
# data/team-deep-dive/queue.txt, runs seed-team.sh, and removes the line.
# When the queue is empty, sleeps and rechecks — so new lines appended
# from a separate session get picked up without restarting the drainer.
#
# Run by ~/Library/LaunchAgents/com.local.CGDDeepDive.plist (KeepAlive).
# Manual: ./scripts/team-deep-dive/queue-drainer.sh

set -u

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

QUEUE="$REPO_ROOT/data/team-deep-dive/queue.txt"
LOCK="$REPO_ROOT/data/team-deep-dive/.queue.lock"
LOG="$HOME/Library/Logs/cgd-deep-dive.log"
mkdir -p "$(dirname "$LOG")" "$(dirname "$QUEUE")"
touch "$QUEUE"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

# Single-instance guard.
if [ -e "$LOCK" ]; then
  other_pid=$(cat "$LOCK" 2>/dev/null || echo "")
  if [ -n "$other_pid" ] && kill -0 "$other_pid" 2>/dev/null; then
    log "drainer already running pid=$other_pid; exiting"
    exit 0
  fi
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

log "==== drainer start pid=$$ ===="

IDLE_SLEEP=60   # when queue empty
INTER_SLEEP=2   # between successful jobs

while true; do
  # Pop the first non-empty, non-comment line atomically.
  line=""
  if [ -s "$QUEUE" ]; then
    tmp="$(mktemp)"
    # Read first usable line, stash the rest back.
    while IFS= read -r raw; do
      stripped="${raw## }"; stripped="${stripped%% }"
      if [ -z "$stripped" ] || [ "${stripped#\#}" != "$stripped" ]; then
        continue
      fi
      if [ -z "$line" ]; then
        line="$raw"
      else
        printf '%s\n' "$raw" >> "$tmp"
      fi
    done < "$QUEUE"
    mv "$tmp" "$QUEUE"
  fi

  if [ -z "$line" ]; then
    sleep "$IDLE_SLEEP"
    continue
  fi

  set -- $line
  slug="${1:-}"
  gender="${2:-}"
  if [ -z "$slug" ] || [ -z "$gender" ]; then
    log "bad queue line: '$line' — skipping"
    continue
  fi

  case "$gender" in m|men) g=m ;; w|women) g=w ;; *) log "bad gender '$gender' for $slug"; continue ;; esac

  if [ -f "data/team-deep-dive/careers-${slug}-${g}.json" ]; then
    log "[skip] $slug $gender already built"
    continue
  fi

  log ">>> start $slug $gender"
  ./scripts/team-deep-dive/seed-team.sh "$slug" "$gender" >> "$LOG" 2>&1
  rc=$?
  log "<<< done $slug $gender exit=$rc"
  sleep "$INTER_SLEEP"
done
