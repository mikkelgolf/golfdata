#!/bin/bash
# Daily collegegolfdata refresh — runs at 02:00 Norway time via LaunchAgent
# com.mikkel.collegegolfdata-daily-refresh.
#
# Pulls fresh Clippd rankings, detects recently-completed conference
# championships, commits any delta directly to `main`, deploys to Vercel,
# and posts a short summary to #ron-collegegolfdata through Ron's bot
# token via the Discord REST API (no gateway session conflict).
#
# Safety:
#   - Kill switch: create ~/projects/collegegolfdata/.daily-refresh-disabled
#     and the script no-ops (posts a disabled note to Discord) until the
#     file is removed.
#   - Sanity gate: if >25% of all-teams-*.ts rows change in one run, the
#     script refuses to commit and posts a failure alert instead.
#   - Works on `main`, so the weekly-refresh.sh behaviour (git pull
#     --rebase origin main, commit, push, deploy) is mirrored.

TAG="[CGD daily-refresh]"
CGD_DIR="$HOME/projects/collegegolfdata"
KILL_SWITCH="$CGD_DIR/.daily-refresh-disabled"
REPORT_PATH="/tmp/champion-report-$(date -u +%Y%m%d).json"
DEPLOY_LOG="/tmp/cgd-daily-deploy-$(date -u +%Y%m%d).log"
LOG_DIR="$CGD_DIR/logs"
LOG_PATH="$LOG_DIR/daily-refresh-$(date -u +%Y-%m-%d).log"
SANITY_PCT=25   # abort if more than this share of data-file lines change

mkdir -p "$LOG_DIR"
# Duplicate stdout + stderr into the per-run log file.
exec > >(tee -a "$LOG_PATH") 2>&1

log() {
    echo "$TAG $(date '+%Y-%m-%dT%H:%M:%S%z') $*"
}

dry_run_mode=0
args_extra=()
for arg in "$@"; do
    case "$arg" in
        --dry-run)
            dry_run_mode=1
            ;;
        *)
            args_extra+=("$arg")
            ;;
    esac
done

log "starting (dry_run=$dry_run_mode)"

# Ensure homebrew/node/npx/vercel/python are on PATH under LaunchAgent.
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
# 0. Kill switch + sanity
# ---------------------------------------------------------------------------
if [ -f "$KILL_SWITCH" ]; then
    log "kill switch present — posting disabled note and exiting"
    if [ "$dry_run_mode" = "0" ]; then
        python3 "$CGD_DIR/scripts/post_daily_summary.py" --disabled || \
            log "WARN: disabled post failed"
    else
        log "[dry-run] would post disabled note"
    fi
    exit 0
fi

[ -d "$CGD_DIR" ] || abort_hard "repo not found: $CGD_DIR"
cd "$CGD_DIR" || abort_hard "cd failed: $CGD_DIR"

for cmd in node npx git vercel python3; do
    command -v "$cmd" >/dev/null 2>&1 || abort_hard "missing binary on PATH: $cmd"
done

if [ "$dry_run_mode" = "0" ]; then
    if ! git diff --quiet || ! git diff --cached --quiet; then
        log "working tree dirty:"
        git status --short | head -20
        abort_hard "refusing to auto-commit over uncommitted work"
    fi
else
    log "[dry-run] skipping working-tree clean check"
fi

# ---------------------------------------------------------------------------
# 1. Sync with remote main (only in real runs; dry-run stays on current branch)
# ---------------------------------------------------------------------------
if [ "$dry_run_mode" = "0" ]; then
    log "step 1: git fetch origin --prune && checkout main && pull --rebase"
    git fetch origin --prune || abort_hard "git fetch failed"
    git checkout main || abort_hard "git checkout main failed"
    git pull --rebase origin main || abort_hard "git pull --rebase failed"
else
    log "step 1: [dry-run] skipping branch change + pull"
fi

# ---------------------------------------------------------------------------
# 2. Rankings scrape + rebuild
# ---------------------------------------------------------------------------
log "step 2: npx tsx scripts/scrape-clippd-teams.ts --pull"
if ! npx --yes tsx scripts/scrape-clippd-teams.ts --pull 2>&1; then
    abort_hard "Clippd rankings scrape failed"
fi

log "step 2b: node scripts/build-all-teams.mjs"
if ! node scripts/build-all-teams.mjs 2>&1; then
    abort_hard "build-all-teams.mjs failed"
fi

# ---------------------------------------------------------------------------
# 3. Tournaments scrape + champion detection
# ---------------------------------------------------------------------------
log "step 3a: npx tsx scripts/scrape-clippd-tournaments.ts --pull --days 14"
if ! npx --yes tsx scripts/scrape-clippd-tournaments.ts --pull --days 14 2>&1; then
    log "WARN: tournaments scrape failed — proceeding without champion detection"
fi

log "step 3b: python3 scripts/detect_new_champions.py --output $REPORT_PATH"
if ! python3 scripts/detect_new_champions.py --days 14 --output "$REPORT_PATH" 2>&1; then
    log "WARN: champion detection failed — summary will omit champion report"
    : > "$REPORT_PATH"
fi

# ---------------------------------------------------------------------------
# 4. Diff + sanity gate
# ---------------------------------------------------------------------------
RANKINGS_CHANGED="no"
DIFF_STAT=""
if ! git diff --quiet src/data/all-teams-men-2026.ts src/data/all-teams-women-2026.ts 2>/dev/null; then
    RANKINGS_CHANGED="yes"
    DIFF_STAT=$(git diff --shortstat src/data/all-teams-men-2026.ts src/data/all-teams-women-2026.ts | sed 's/^ //')
    log "rankings delta: $DIFF_STAT"

    # Sanity gate: reject runs that rewrite a huge share of the data file.
    # Counts changed lines and expresses as percent of total lines.
    CHANGED=$(git diff --numstat src/data/all-teams-men-2026.ts src/data/all-teams-women-2026.ts | awk '{s += $1 + $2} END {print s}')
    TOTAL=$(wc -l src/data/all-teams-men-2026.ts src/data/all-teams-women-2026.ts | tail -1 | awk '{print $1}')
    if [ "$TOTAL" -gt 0 ] && [ -n "$CHANGED" ]; then
        PCT=$(( CHANGED * 100 / (TOTAL * 2) ))
        log "sanity: ${PCT}% of all-teams rows changed (threshold ${SANITY_PCT}%)"
        if [ "$PCT" -gt "$SANITY_PCT" ]; then
            abort_hard "sanity gate tripped: ${PCT}% of rows changed (> ${SANITY_PCT}%)"
        fi
    fi
fi

# ---------------------------------------------------------------------------
# 5. Auto-apply confirmed winners (no-op until Playwright extractor lands)
# ---------------------------------------------------------------------------
log "step 5: python3 scripts/detect_new_champions.py --apply-winners (secondary pass)"
python3 scripts/detect_new_champions.py --days 14 --output "$REPORT_PATH" --apply-winners 2>&1 || \
    log "WARN: champions --apply-winners pass failed (non-fatal)"

CHAMPIONS_CHANGED="no"
if ! git diff --quiet src/data/championships-men-2026.ts src/data/championships-women-2026.ts 2>/dev/null; then
    CHAMPIONS_CHANGED="yes"
    log "champions TS modified by auto-winners"
fi

# ---------------------------------------------------------------------------
# 6. Commit + push + deploy (real runs only; skip in dry-run)
# ---------------------------------------------------------------------------
COMMIT_SHA=""
DEPLOY_URL=""
if [ "$RANKINGS_CHANGED" = "yes" ] || [ "$CHAMPIONS_CHANGED" = "yes" ]; then
    if [ "$dry_run_mode" = "1" ]; then
        log "step 6: [dry-run] skipping git add/commit/push + vercel"
    else
        git add src/data/all-teams-men-2026.ts src/data/all-teams-women-2026.ts \
                src/data/championships-men-2026.ts src/data/championships-women-2026.ts 2>&1
        if ! git commit -m "daily refresh $(date -u +%Y-%m-%d) — rankings${CHAMPIONS_CHANGED:+ + champions}" 2>&1; then
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
            post_failure "vercel --prod failed; see $DEPLOY_LOG"
            exit 1
        fi
    fi
else
    log "no tracked data changes — skipping commit + deploy"
fi

# ---------------------------------------------------------------------------
# 7. Discord summary (always)
# ---------------------------------------------------------------------------
POSTER_ARGS=( --champions-report "$REPORT_PATH" --rankings-changed "$RANKINGS_CHANGED" )
[ -n "$DIFF_STAT"   ] && POSTER_ARGS+=( --diff-stat "$DIFF_STAT" )
[ -n "$COMMIT_SHA"  ] && POSTER_ARGS+=( --commit "$COMMIT_SHA" )
[ -n "$DEPLOY_URL"  ] && POSTER_ARGS+=( --deploy-url "$DEPLOY_URL" )
[ "$dry_run_mode" = "1" ] && POSTER_ARGS+=( --dry-run )

log "step 7: python3 scripts/post_daily_summary.py ${POSTER_ARGS[*]}"
if ! python3 scripts/post_daily_summary.py "${POSTER_ARGS[@]}"; then
    log "ERROR: summary post failed"
    exit 1
fi

log "complete"
exit 0
