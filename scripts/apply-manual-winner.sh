#!/bin/bash
# Manual-entry wrapper: write a human-supplied conference-championship winner
# straight to main + the live Vercel deploy.
#
# Use when Mikkel/David know the conference winner (saw it posted, got a text,
# etc.) but the automated cron (update-conference-winner-on-demand.sh) can't
# confirm it — usually because Clippd's /scoring/team page hasn't surfaced row-1
# yet. The automated path prefers a Clippd-confirmed winner; this path trusts
# the human caller.
#
# Full flow (mirrors update-conference-winner-on-demand.sh):
#   0. Kill switch + dirty-tree + binary checks.
#   1. Sync with origin/main (abort if dirty).
#   2. Run apply_manual_winner.py — edits championships-{gender}-2026.ts in
#      place and emits a JSON descriptor of the edit on stdout.
#   3. Run verify-championships.ts (name match, stale check). Rollback TS on
#      fail.
#   4. Synthesize a champions-report JSON with a single autoConfirmed entry
#      (so post_daily_summary.py renders it like a cron-applied winner).
#   5. Commit, push main, vercel --prod.
#   6. Post Discord summary.
#
# Usage:
#   bash scripts/apply-manual-winner.sh \
#       --conference MAAC --gender women --winner "Queens-Charlotte"
#   bash scripts/apply-manual-winner.sh ... --requested-by "David Tenneson"
#   bash scripts/apply-manual-winner.sh ... --force    # overwrite existing
#   bash scripts/apply-manual-winner.sh ... --dry-run  # validate only
#
# Exits 0 on success (including --dry-run). Exits 1 on any failure; the
# failure summary is posted to Discord unless --dry-run.

set -uo pipefail

TAG="[CGD manual-winner]"
CGD_DIR="$HOME/projects/collegegolfdata"
KILL_SWITCH="$CGD_DIR/.daily-refresh-disabled"
TS_STAMP=$(date -u +%Y%m%dT%H%M%S)
REPORT_PATH="/tmp/champion-report-manual-${TS_STAMP}.json"
DEPLOY_LOG="/tmp/cgd-manual-deploy-${TS_STAMP}.log"
LOG_DIR="$CGD_DIR/logs"
LOG_PATH="$LOG_DIR/manual-winner-${TS_STAMP}.log"

CHAMP_FILES=(
    src/data/championships-men-2026.ts
    src/data/championships-women-2026.ts
)

# Conference-championship history database — populated alongside the .ts edit
# so the Conference Championships page picks up the stroke-play medalist,
# match-play runner-up, and final score for the conference we're updating.
# See scripts/populate_conf_championship_winners.py.
CONF_HISTORY_JSON="src/data/conference-championship-history.json"

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_PATH") 2>&1

log() {
    echo "$TAG $(date '+%Y-%m-%dT%H:%M:%S%z') $*"
}

# ---------------------------------------------------------------------------
# Arg parsing
# ---------------------------------------------------------------------------
conference=""
gender=""
winner=""
force=0
requested_by=""
dry_run_mode=0

while [ $# -gt 0 ]; do
    case "$1" in
        --conference)    conference="$2"; shift 2 ;;
        --gender)        gender="$2"; shift 2 ;;
        --winner)        winner="$2"; shift 2 ;;
        --requested-by)  requested_by="$2"; shift 2 ;;
        --force)         force=1; shift ;;
        --dry-run)       dry_run_mode=1; shift ;;
        -h|--help)
            sed -n '2,32p' "$0"
            exit 0
            ;;
        *) echo "$TAG unknown arg: $1" >&2; exit 1 ;;
    esac
done

missing=()
[ -z "$conference" ] && missing+=("--conference")
[ -z "$gender"     ] && missing+=("--gender")
[ -z "$winner"     ] && missing+=("--winner")
if [ "${#missing[@]}" -gt 0 ]; then
    echo "$TAG missing required args: ${missing[*]}" >&2
    echo "usage: bash $0 --conference CODE --gender men|women --winner \"Team\" [--force] [--requested-by Name] [--dry-run]" >&2
    exit 1
fi
case "$gender" in
    men|women) ;;
    *) echo "$TAG --gender must be men or women, got: $gender" >&2; exit 1 ;;
esac

log "starting: conf=$conference gender=$gender winner=\"$winner\" force=$force dry_run=$dry_run_mode requested_by=\"${requested_by:-<unset>}\""
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
# 2. Apply the manual edit
# ---------------------------------------------------------------------------
log "step 2: python3 scripts/apply_manual_winner.py"
APPLY_ARGS=( --conference "$conference" --gender "$gender" --winner "$winner" --allow-noop )
[ "$force" = "1" ] && APPLY_ARGS+=( --force )

APPLY_OUT=$(python3 scripts/apply_manual_winner.py "${APPLY_ARGS[@]}")
apply_rc=$?
if [ "$apply_rc" -ne 0 ]; then
    abort_hard "apply_manual_winner.py failed (rc=$apply_rc) — no edit made"
fi

# Parse JSON descriptor
log "apply output: $APPLY_OUT"
is_noop=$(printf '%s' "$APPLY_OUT" | python3 -c "import json,sys; r=json.loads(sys.stdin.read()); print('yes' if r.get('noop') else 'no')")
if [ "$is_noop" = "yes" ]; then
    log "no-op: winner already set to \"$winner\" — skipping commit/deploy"
    MSG="Manual winner no-op: $conference $gender is already \"$winner\". Nothing to commit."
    if [ "$dry_run_mode" = "0" ]; then
        printf "%s" "$MSG" | python3 scripts/post_daily_summary.py --failed || \
            log "WARN: no-op summary post failed"
    else
        log "[dry-run] would post: $MSG"
    fi
    log "complete (no-op)"
    exit 0
fi

ts_file=$(printf '%s' "$APPLY_OUT" | python3 -c "import json,sys; print(json.loads(sys.stdin.read())['tsFile'])")
conf_full=$(printf '%s' "$APPLY_OUT" | python3 -c "import json,sys; print(json.loads(sys.stdin.read())['conferenceFull'])")
end_date=$(printf '%s' "$APPLY_OUT" | python3 -c "import json,sys; print(json.loads(sys.stdin.read()).get('endDate') or '')")

log "edited: $ts_file  ($conf_full, endDate=${end_date:-<unknown>})"

# ---------------------------------------------------------------------------
# 3. Validate — verify-championships.ts must exit 0 before we commit
# ---------------------------------------------------------------------------
log "step 3: npx tsx scripts/verify-championships.ts"
if ! npx --yes tsx scripts/verify-championships.ts 2>&1; then
    log "verify-championships FAILED — rolling back TS changes"
    git checkout -- "${CHAMP_FILES[@]}" 2>&1 || \
        log "WARN: couldn't roll back — $(git status --short ${CHAMP_FILES[@]})"
    abort_hard "verify-championships.ts failed — changes rolled back, no commit"
fi

# ---------------------------------------------------------------------------
# 3b. Populate conference-championship-history.json for this conference
# ---------------------------------------------------------------------------
# After the .ts edit + validator pass, run the Phase 2 populator scoped to
# the conference + gender we just updated. This pulls the stroke-play
# medalist, match-play runner-up, and final-score from Clippd into the
# history JSON, which the Conference Championships UI uses to render the
# medal / silver-trophy icons.
#
# Failure mode: populator partial-success returns rc=1 (some legs MISSed,
# typical when the championship just concluded and Clippd hasn't surfaced
# everything yet). We log + continue rather than abort — the manual winner
# entry is the critical write; the JSON detail can catch up on the next
# cron run via update-conference-winner-on-demand.sh's mirror integration.
#
# The populator's --include-2026 flag is required because by default the
# script skips 2026 (Phase 1 seeded current-season data from the .ts files
# and we don't want bulk re-extraction by accident).
log "step 3b: populate conference-championship-history.json"
POPULATE_ARGS=(
    --season 2026
    --gender "$gender"
    --conference "$conference"
    --include-2026
)
[ "$dry_run_mode" = "1" ] && POPULATE_ARGS+=( --dry-run )

if python3 scripts/populate_conf_championship_winners.py "${POPULATE_ARGS[@]}" 2>&1; then
    log "populate complete (all legs OK)"
else
    log "populate finished with partial-success rc — leaving any extracted data in place"
fi

# ---------------------------------------------------------------------------
# 4. Synthesize champions-report for Discord summary
# ---------------------------------------------------------------------------
# post_daily_summary.build_success_message expects a dict with autoConfirmed /
# needsManual / stillOpen. We populate autoConfirmed with the single manual
# entry so it renders like a cron-applied winner.
python3 - "$REPORT_PATH" <<PY
import json, sys
report_path = sys.argv[1]
entry = {
    "gender": "$gender",
    "conference": "$conference",
    "conferenceFull": """$conf_full""",
    "winner": """$winner""",
    "endDate": "$end_date",
    "tsFile": "$ts_file",
    "source": "manual",
}
report = {
    "autoConfirmed": [entry],
    "needsManual": [],
    "stillOpen": [],
    "summary": "manual winner entry",
}
with open(report_path, "w") as fh:
    json.dump(report, fh, indent=2)
PY
log "wrote champions-report: $REPORT_PATH"

# ---------------------------------------------------------------------------
# 5. Commit + push + deploy
# ---------------------------------------------------------------------------
req_trailer=""
if [ -n "$requested_by" ]; then
    req_trailer="(requested by $requested_by)"
fi
NEW_WINNERS="$conference ${gender:0:1}: $winner"
COMMIT_MSG="manual conference winner: $conference $gender — $winner $req_trailer"

COMMIT_SHA=""
DEPLOY_URL=""
if [ "$dry_run_mode" = "1" ]; then
    log "step 5: [dry-run] skipping git add/commit/push + vercel"
    log "  would commit: $COMMIT_MSG"
    # In dry-run, revert the TS edit so the tree ends clean.
    git checkout -- "${CHAMP_FILES[@]}" 2>&1 || \
        log "WARN: couldn't revert TS edit in dry-run"
    # Also revert any populator JSON edits.
    if ! git diff --quiet -- "$CONF_HISTORY_JSON"; then
        git checkout -- "$CONF_HISTORY_JSON" 2>&1 || \
            log "WARN: couldn't revert JSON edit in dry-run"
    fi
else
    # Stage the .ts edit and (if the populator wrote anything) the JSON.
    git add "${CHAMP_FILES[@]}" 2>&1
    if ! git diff --quiet -- "$CONF_HISTORY_JSON" 2>/dev/null; then
        log "staging populator JSON changes for commit"
        git add "$CONF_HISTORY_JSON" 2>&1
    fi
    if ! git commit -m "$COMMIT_MSG" 2>&1; then
        abort_hard "git commit failed"
    fi
    COMMIT_SHA=$(git rev-parse HEAD)
    if ! git push origin main 2>&1; then
        abort_hard "git push origin main failed"
    fi

    log "step 5b: vercel --prod --yes"
    if vercel --prod --yes > "$DEPLOY_LOG" 2>&1; then
        DEPLOY_URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.vercel\.app' "$DEPLOY_LOG" | head -1)
        log "deploy complete: ${DEPLOY_URL:-<url missing>}"
    else
        log "vercel deploy FAILED — log $DEPLOY_LOG"
        post_failure "vercel --prod failed; winner committed but not deployed. log: $DEPLOY_LOG"
        exit 1
    fi
fi

# ---------------------------------------------------------------------------
# 6. Discord summary
# ---------------------------------------------------------------------------
POSTER_ARGS=( --champions-report "$REPORT_PATH" --rankings-changed "no" --diff-stat "$NEW_WINNERS" )
[ -n "$COMMIT_SHA"  ] && POSTER_ARGS+=( --commit "$COMMIT_SHA" )
[ -n "$DEPLOY_URL"  ] && POSTER_ARGS+=( --deploy-url "$DEPLOY_URL" )
[ "$dry_run_mode" = "1" ] && POSTER_ARGS+=( --dry-run )

log "step 6: post Discord summary"
if ! python3 scripts/post_daily_summary.py "${POSTER_ARGS[@]}"; then
    log "ERROR: summary post failed"
    exit 1
fi

log "complete"
exit 0
