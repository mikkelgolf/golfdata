#!/bin/bash
# On-demand wrapper: find + validate + commit conference-championship winners.
#
# Triggered by Ron's !update-conference-winner Discord command. Full flow:
#   1. Sync with origin/main (abort if dirty).
#   2. Re-scrape Clippd tournaments for the last 14 days (fresh data).
#   3. Run detect_new_champions.py --apply-winners. Its Playwright step
#      loads each matching Clippd /scoring/team page and reads row-1 TEAM,
#      so a winner only lands in championships-*.ts when Clippd confirms.
#   4. If championships-{men,women}-2026.ts changed, run
#      verify-championships.ts (name matches, no stale, AQ count). Abort
#      on validator failure — no commit, no deploy, TS changes rolled
#      back, failure posted to Discord.
#   5. On success: commit, push main, vercel --prod, post Discord summary
#      with the list of new winners + the count of needsManual entries.
#   6. If nothing changed: post a "no new confirmed winners" Discord note.
#
# Inherits safety from daily-refresh.sh philosophy:
#   - Kill switch: ~/projects/collegegolfdata/.daily-refresh-disabled
#   - Dirty-tree abort
#   - Discord failure posting via post_daily_summary.py --failed
#
# Usage:
#   bash scripts/update-conference-winner-on-demand.sh
#   bash scripts/update-conference-winner-on-demand.sh --dry-run

set -uo pipefail

TAG="[CGD update-conf-winner]"
CGD_DIR="$HOME/projects/collegegolfdata"
KILL_SWITCH="$CGD_DIR/.daily-refresh-disabled"
REPORT_PATH="/tmp/champion-report-on-demand-$(date -u +%Y%m%dT%H%M%S).json"
DEPLOY_LOG="/tmp/cgd-winner-deploy-$(date -u +%Y%m%dT%H%M%S).log"
LOG_DIR="$CGD_DIR/logs"
LOG_PATH="$LOG_DIR/update-conf-winner-$(date -u +%Y-%m-%dT%H%M%S).log"

CHAMP_FILES=(
    src/data/championships-men-2026.ts
    src/data/championships-women-2026.ts
)

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_PATH") 2>&1

log() {
    echo "$TAG $(date '+%Y-%m-%dT%H:%M:%S%z') $*"
}

dry_run_mode=0
for arg in "$@"; do
    case "$arg" in
        --dry-run) dry_run_mode=1 ;;
    esac
done

log "starting (dry_run=$dry_run_mode)"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

post_failure() {
    local reason="$1"
    log "failure: $reason"
    if [ "$dry_run_mode" = "0" ]; then
        printf "%s" "$reason" | python3 "$CGD_DIR/scripts/post_daily_summary.py" --failed || \
            log "WARN: failure summary post also failed"
    else
        log "[dry-run] would post failure: $reason"
    fi
}

abort_hard() {
    post_failure "$1"
    exit 1
}

# ---------------------------------------------------------------------------
# 0. Kill switch + preconditions
# ---------------------------------------------------------------------------
if [ -f "$KILL_SWITCH" ]; then
    log "kill switch present — exiting without action"
    exit 0
fi

[ -d "$CGD_DIR" ] || abort_hard "repo not found: $CGD_DIR"
cd "$CGD_DIR" || abort_hard "cd failed: $CGD_DIR"

for cmd in node npx git python3 vercel; do
    command -v "$cmd" >/dev/null 2>&1 || abort_hard "missing binary on PATH: $cmd"
done

if [ "$dry_run_mode" = "0" ]; then
    if ! git diff --quiet || ! git diff --cached --quiet; then
        log "working tree dirty:"
        git status --short | head -20
        abort_hard "refusing to run over uncommitted work"
    fi
fi

# ---------------------------------------------------------------------------
# 1. Sync with origin/main (dry-run stays on current branch)
# ---------------------------------------------------------------------------
if [ "$dry_run_mode" = "0" ]; then
    log "step 1: git fetch + checkout main + pull --rebase"
    git fetch origin --prune || abort_hard "git fetch failed"
    git checkout main || abort_hard "git checkout main failed"
    git pull --rebase origin main || abort_hard "git pull --rebase failed"
else
    log "step 1: [dry-run] skipping branch change + pull"
fi

# ---------------------------------------------------------------------------
# 2. Fresh tournaments scrape (so detect_new_champions has current endDates)
# ---------------------------------------------------------------------------
log "step 2: npx tsx scripts/scrape-clippd-tournaments.ts --pull --days 14"
if ! npx --yes tsx scripts/scrape-clippd-tournaments.ts --pull --days 14 2>&1; then
    abort_hard "Clippd tournaments scrape failed — can't validate winners without fresh data"
fi

# ---------------------------------------------------------------------------
# 3. Detect + auto-apply winners via Playwright (Clippd /scoring/team row 1)
# ---------------------------------------------------------------------------
log "step 3: python3 scripts/detect_new_champions.py --apply-winners"
if ! python3 scripts/detect_new_champions.py --days 14 --output "$REPORT_PATH" --apply-winners 2>&1; then
    abort_hard "champion detection + apply failed — see $LOG_PATH"
fi

# ---------------------------------------------------------------------------
# 4. Diff check: did any championships TS files change?
# ---------------------------------------------------------------------------
CHANGED="no"
if ! git diff --quiet "${CHAMP_FILES[@]}" 2>/dev/null; then
    CHANGED="yes"
    log "championships TS files modified:"
    git diff --stat "${CHAMP_FILES[@]}"
fi

if [ "$CHANGED" = "no" ]; then
    log "no new confirmed winners to apply"
    # Count pending needsManual / stillOpen for the Discord message.
    NEEDS_MANUAL=$(python3 -c "import json; r=json.load(open('$REPORT_PATH')); print(len(r.get('needsManual',[])))" 2>/dev/null || echo "?")
    STILL_OPEN=$(python3 -c "import json; r=json.load(open('$REPORT_PATH')); print(len(r.get('stillOpen',[])))" 2>/dev/null || echo "?")
    MSG="No new conference winners to confirm. needsManual=${NEEDS_MANUAL}, stillOpen=${STILL_OPEN}."
    log "step 5: posting no-change summary: $MSG"
    if [ "$dry_run_mode" = "0" ]; then
        printf "%s" "$MSG" | python3 scripts/post_daily_summary.py --failed || \
            log "WARN: no-change summary post failed"
    fi
    log "complete (no-op)"
    exit 0
fi

# ---------------------------------------------------------------------------
# 5. Validate — verify-championships.ts must exit 0 before we commit
# ---------------------------------------------------------------------------
log "step 5: npx tsx scripts/verify-championships.ts"
if ! npx --yes tsx scripts/verify-championships.ts 2>&1; then
    log "verify-championships FAILED — rolling back TS changes"
    git checkout -- "${CHAMP_FILES[@]}" 2>&1 || \
        log "WARN: couldn't roll back — $(git status --short ${CHAMP_FILES[@]})"
    abort_hard "verify-championships.ts failed — changes rolled back, no commit"
fi

# ---------------------------------------------------------------------------
# 6. Commit + push + deploy
# ---------------------------------------------------------------------------
# Collect list of new winners for the commit message / Discord summary.
NEW_WINNERS=$(python3 -c "
import json
r=json.load(open('$REPORT_PATH'))
entries=r.get('autoConfirmed',[])
if not entries:
    print('(none)')
else:
    print(', '.join(f\"{e['conference']} {e['gender'][0]}: {e['winner']}\" for e in entries))
" 2>/dev/null || echo "(unparsed)")

log "new winners: $NEW_WINNERS"

COMMIT_SHA=""
DEPLOY_URL=""
if [ "$dry_run_mode" = "1" ]; then
    log "step 6: [dry-run] skipping git add/commit/push + vercel"
else
    git add "${CHAMP_FILES[@]}" 2>&1
    if ! git commit -m "on-demand conference winners $(date -u +%Y-%m-%d) — ${NEW_WINNERS}" 2>&1; then
        abort_hard "git commit failed"
    fi
    COMMIT_SHA=$(git rev-parse HEAD)
    if ! git push origin main 2>&1; then
        abort_hard "git push origin main failed"
    fi

    log "step 6b: vercel --prod --yes"
    if vercel --prod --yes > "$DEPLOY_LOG" 2>&1; then
        DEPLOY_URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.vercel\.app' "$DEPLOY_LOG" | head -1)
        log "deploy complete: ${DEPLOY_URL:-<url missing>}"
    else
        log "vercel deploy FAILED — log $DEPLOY_LOG"
        post_failure "vercel --prod failed; winners committed but not deployed. log: $DEPLOY_LOG"
        exit 1
    fi
fi

# ---------------------------------------------------------------------------
# 7. Discord summary
# ---------------------------------------------------------------------------
POSTER_ARGS=( --champions-report "$REPORT_PATH" --rankings-changed "no" --diff-stat "$NEW_WINNERS" )
[ -n "$COMMIT_SHA"  ] && POSTER_ARGS+=( --commit "$COMMIT_SHA" )
[ -n "$DEPLOY_URL"  ] && POSTER_ARGS+=( --deploy-url "$DEPLOY_URL" )
[ "$dry_run_mode" = "1" ] && POSTER_ARGS+=( --dry-run )

log "step 7: post Discord summary"
if ! python3 scripts/post_daily_summary.py "${POSTER_ARGS[@]}"; then
    log "ERROR: summary post failed"
    exit 1
fi

log "complete"
exit 0
