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
SANITY_PCT=75   # abort if more than this share of data-file lines change.
                # History: started at 25%, raised to 50% on 2026-04-08 after
                # --generate was shown to rewrite every team row (so "normal"
                # runs touch ~40% of lines). Raised to 75% on 2026-04-23
                # after Clippd's afternoon push legitimately hit 63% — one
                # new tournament result for Tulsa (events 10→11) cascaded
                # rank movement across ~two thirds of the women's board.
                # Re-tighten if we see a run of ≤50% deltas for a week.

mkdir -p "$LOG_DIR"
# Duplicate stdout + stderr into the per-run log file.
exec > >(tee -a "$LOG_PATH") 2>&1

log() {
    echo "$TAG $(date '+%Y-%m-%dT%H:%M:%S%z') $*"
}

dry_run_mode=0
force_snapshots=0
args_extra=()
for arg in "$@"; do
    case "$arg" in
        --dry-run)
            dry_run_mode=1
            ;;
        --force-snapshots)
            # Bypass content-aware dedup (option-a) inside snapshot-rankings.
            # Wired by update-rankings-on-demand.sh so manual rankings
            # updates always become official archive entries even if the
            # fingerprint matches the previous snapshot. The nightly cron
            # invokes this script directly without the flag, so its dedup
            # behavior is unchanged.
            force_snapshots=1
            ;;
        *)
            args_extra+=("$arg")
            ;;
    esac
done

log "starting (dry_run=$dry_run_mode, force_snapshots=$force_snapshots)"

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
# 2. Rankings scrape + regenerate both rankings-*.ts AND all-teams-*.ts
# ---------------------------------------------------------------------------
# --generate does: pull Clippd rankings JSON + emit
# data/clippd/rankings-{men,women}-<timestamp>.ts staged TS files. The site
# reads from src/data/rankings-{men,women}.ts, so we mirror the latest
# staged file into src/data after a successful generate.
log "step 2: npx tsx scripts/scrape-clippd-teams.ts --generate"
if ! npx --yes tsx scripts/scrape-clippd-teams.ts --generate 2>&1; then
    abort_hard "Clippd rankings scrape/generate failed"
fi

log "step 2b: mirror latest rankings-*.ts → src/data/"
LATEST_MEN=$(ls -t data/clippd/rankings-men-*.ts 2>/dev/null | head -1)
LATEST_WOMEN=$(ls -t data/clippd/rankings-women-*.ts 2>/dev/null | head -1)
if [ -z "$LATEST_MEN" ] || [ -z "$LATEST_WOMEN" ]; then
    abort_hard "scrape --generate did not produce staged rankings-*.ts"
fi
cp "$LATEST_MEN"   src/data/rankings-men.ts   || abort_hard "cp men rankings failed"
cp "$LATEST_WOMEN" src/data/rankings-women.ts || abort_hard "cp women rankings failed"
log "mirrored $(basename "$LATEST_MEN") + $(basename "$LATEST_WOMEN") → src/data/"
# Remove staged files so Next.js doesn't index them and so they don't accumulate.
rm -f data/clippd/rankings-men-*.ts data/clippd/rankings-women-*.ts

# Step 2b': snapshot today's live rankings into the archive at
# src/data/rankings-archive/{men,women}/YYYY-MM-DD.ts and regenerate the
# per-gender index. The archive is what the Regional Predictions page reads
# (via loadActive in src/lib/rankings-archive.ts), so this MUST run on every
# successful refresh — otherwise pin/latest drift apart.
#
# Flags:
#   --require-publication-day  Option-b prep: gate the write on
#       isPublicationDay(date, gender) inside snapshot-rankings.ts. Today
#       that function is stubbed to return true (so this flag is a no-op
#       today). When the NCAA publication calendar is wired in, this
#       cron will automatically stop writing snapshots on off-days —
#       no daily-refresh.sh edits required.
#   --force (only when force_snapshots=1) Bypass content-aware dedup.
#       Set by update-rankings-on-demand.sh so manual !update-rankings
#       runs always create an official archive entry. Cron runs do NOT
#       pass this flag — they keep dedup on so duplicate Clippd pulls
#       don't pollute the archive.
#   (when not --force) Default content-aware dedup is on. If BOTH
#       genders' live-data fingerprints match the previous snapshot, no
#       write — catches the trivial "Clippd returned identical data"
#       case. If EITHER gender's fingerprint changed, both write
#       (coupled — see snapshot-rankings.ts for the rationale).
SNAPSHOT_FLAGS=(--from-live --require-publication-day)
if [ "$force_snapshots" = "1" ]; then
    SNAPSHOT_FLAGS+=(--force)
fi
log "step 2b': npx tsx scripts/snapshot-rankings.ts ${SNAPSHOT_FLAGS[*]}"
if ! npx --yes tsx scripts/snapshot-rankings.ts "${SNAPSHOT_FLAGS[@]}" 2>&1; then
    abort_hard "snapshot-rankings --from-live failed"
fi

log "step 2c: node scripts/build-all-teams.mjs"
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
RANKINGS_FILES=(
    src/data/rankings-men.ts
    src/data/rankings-women.ts
    src/data/all-teams-men-2026.ts
    src/data/all-teams-women-2026.ts
)
if ! git diff --quiet "${RANKINGS_FILES[@]}" 2>/dev/null; then
    RANKINGS_CHANGED="yes"
    DIFF_STAT=$(git diff --shortstat "${RANKINGS_FILES[@]}" | sed 's/^ //')
    log "rankings delta: $DIFF_STAT"

    # Sanity gate: reject runs that rewrite a huge share of rows.
    CHANGED=$(git diff --numstat "${RANKINGS_FILES[@]}" | awk '{s += $1 + $2} END {print s}')
    TOTAL=$(wc -l "${RANKINGS_FILES[@]}" | tail -1 | awk '{print $1}')
    if [ "$TOTAL" -gt 0 ] && [ -n "$CHANGED" ]; then
        PCT=$(( CHANGED * 100 / (TOTAL * 2) ))
        log "sanity: ${PCT}% of rankings+all-teams rows changed (threshold ${SANITY_PCT}%)"
        if [ "$PCT" -gt "$SANITY_PCT" ]; then
            abort_hard "sanity gate tripped: ${PCT}% of rows changed (> ${SANITY_PCT}%)"
        fi
    fi
fi

# ---------------------------------------------------------------------------
# 4b. Coordinate verifier (deploy blocker)
# ---------------------------------------------------------------------------
# Fails (exit 1) when:
#   - any eligible/AQ team in rankings-*.ts or all-teams-*-2026.ts is at
#     lat:0, lng:0 (which would land them in the Atlantic for the S-curve
#     closest-site logic);
#   - any team in the KNOWN_GOOD canonical map drifted >0.5° from its
#     hand-verified campus coords (regression guard against a coord-fix
#     getting reverted by the daily refresh — the exact bug this whole
#     branch is plugging).
# Same abort_hard semantics as the 75%-rows sanity gate above: we Discord
# the failure reason and bail before touching git or vercel.
log "step 4b: npx tsx scripts/verify-team-coords.ts"
if ! npx --yes tsx scripts/verify-team-coords.ts 2>&1; then
    abort_hard "coord verifier failed — see log for FAIL lines"
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
        git add "${RANKINGS_FILES[@]}" \
                src/data/championships-men-2026.ts src/data/championships-women-2026.ts 2>&1
        if ! git commit -m "daily refresh $(date -u +%Y-%m-%d) — rankings${CHAMPIONS_CHANGED:+ + champions}" 2>&1; then
            abort_hard "git commit failed"
        fi
        COMMIT_SHA=$(git rev-parse HEAD)
        if ! git push origin main 2>&1; then
            abort_hard "git push origin main failed"
        fi

        log "step 6b: vercel --prod --yes --archive=tgz"
        # --archive=tgz is required: the repo carries >15k files (PDFs,
        # snapshots, cached scrape JSON) and Vercel's bare upload path tops
        # out at 15000.
        if vercel --prod --yes --archive=tgz > "$DEPLOY_LOG" 2>&1; then
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
