#!/bin/bash
# Weekly Conference Championships refresh.
#
# Called from ~/projects/mikkel-system/scripts/rankings_pipeline.sh as the
# final step of the Wednesday rankings cron, but also runnable standalone:
#
#     bash scripts/weekly-refresh.sh
#
# Pipeline:
#   1. git pull --rebase   (sync local main with origin)
#   2. scrape Clippd API   (refresh data/clippd/rankings-YYYY-MM-DD.json)
#   3. node build-all-teams.mjs  (regenerate src/data/all-teams-*.ts)
#   4. git diff check     (exit early if no changes)
#   5. git commit + push  (commit the refreshed data files)
#   6. vercel --prod      (deploy to production)
#
# Safety:
#   - Every destructive step is guarded. On ANY failure, the script prints
#     a message and exits 0 so the parent cron pipeline treats it as
#     non-fatal and continues to the next weekly run.
#   - Uses the osxkeychain credential helper for git push and the Vercel
#     CLI auth stored in ~/Library/Application Support/com.vercel.cli.
#   - NEVER runs git reset, git push --force, or any destructive git.

# Do NOT enable `set -e` — we handle errors manually so a single failure
# never aborts the outer cron pipeline.

TAG="[Rankings/cgd]"
CGD_DIR="$HOME/projects/collegegolfdata"

log() {
    echo "$TAG $(date '+%H:%M:%S') $*"
}

abort_soft() {
    # Print reason and exit 0 so parent pipeline treats the step as non-fatal.
    log "$1 — aborting refresh (non-fatal)"
    exit 0
}

# Ensure homebrew binaries are on PATH when running under LaunchAgent.
export PATH="/opt/homebrew/bin:$PATH"

# ---------------------------------------------------------------------------
# 0. Sanity checks
# ---------------------------------------------------------------------------
[ -d "$CGD_DIR" ] || abort_soft "collegegolfdata repo not found at $CGD_DIR"
cd "$CGD_DIR" || abort_soft "cd to $CGD_DIR failed"

command -v node >/dev/null 2>&1 || abort_soft "node not found on PATH"
command -v npx  >/dev/null 2>&1 || abort_soft "npx not found on PATH"
command -v git  >/dev/null 2>&1 || abort_soft "git not found on PATH"
command -v vercel >/dev/null 2>&1 || abort_soft "vercel CLI not found on PATH"

log "starting refresh in $CGD_DIR"

# Fail fast if the working tree already has uncommitted changes — we don't
# want to accidentally stage unrelated work during auto-commit.
if ! git diff --quiet || ! git diff --cached --quiet; then
    log "working tree dirty:"
    git status --short | head -20
    abort_soft "refusing to auto-commit over uncommitted work"
fi

# ---------------------------------------------------------------------------
# 1. Sync with remote main
# ---------------------------------------------------------------------------
log "step 1: git pull --rebase origin main"
if ! git pull --rebase origin main 2>&1; then
    abort_soft "git pull failed"
fi

# ---------------------------------------------------------------------------
# 2. Pull fresh Clippd rankings JSON
# ---------------------------------------------------------------------------
log "step 2: pulling fresh Clippd rankings (npx tsx scrape-clippd-teams.ts --pull)"
if ! npx --yes tsx scripts/scrape-clippd-teams.ts --pull 2>&1; then
    abort_soft "Clippd scrape failed"
fi

# ---------------------------------------------------------------------------
# 3. Rebuild all-teams data files from the fresh JSON
# ---------------------------------------------------------------------------
log "step 3: node scripts/build-all-teams.mjs"
if ! node scripts/build-all-teams.mjs 2>&1; then
    abort_soft "build-all-teams.mjs failed"
fi

# ---------------------------------------------------------------------------
# 4. Early exit if the generated TS files didn't change
#    (data/clippd/*.json is intentionally untracked — raw Clippd pulls live
#    on local disk only; the generated all-teams TS files are the only
#    canonical output we commit.)
# ---------------------------------------------------------------------------
if git diff --quiet src/data/all-teams-men-2026.ts src/data/all-teams-women-2026.ts 2>/dev/null; then
    log "no ranking changes detected — skipping commit + deploy"
    exit 0
fi

log "step 4: data changed, preparing commit"
git diff --stat src/data/all-teams-men-2026.ts src/data/all-teams-women-2026.ts 2>&1 | tail -5

# ---------------------------------------------------------------------------
# 5. Commit + push (staged files only — never git add .)
# ---------------------------------------------------------------------------
log "step 5: staging + committing"
if ! git add src/data/all-teams-men-2026.ts src/data/all-teams-women-2026.ts 2>&1; then
    abort_soft "git add failed"
fi

if ! git commit -m "rankings: weekly Clippd refresh $(date -u +%Y-%m-%d)" 2>&1; then
    abort_soft "git commit failed (possibly nothing staged)"
fi

log "step 5b: git push origin main"
if ! git push origin main 2>&1; then
    abort_soft "git push failed"
fi

# ---------------------------------------------------------------------------
# 6. Deploy to Vercel
# ---------------------------------------------------------------------------
log "step 6: vercel --prod --yes"
DEPLOY_LOG="/tmp/cgd-weekly-deploy-$(date -u +%Y%m%d).log"
if vercel --prod --yes > "$DEPLOY_LOG" 2>&1; then
    DEPLOY_URL=$(grep -E "^https://" "$DEPLOY_LOG" | head -1)
    log "deploy complete: ${DEPLOY_URL:-<url missing from log>}"
else
    log "vercel deploy FAILED — log at $DEPLOY_LOG"
    exit 0
fi

log "refresh complete"
