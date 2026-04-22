#!/bin/bash
# On-demand wrapper around daily-refresh.sh.
#
# Triggered by Ron's !update-rankings Discord command. Runs the same
# pipeline as the nightly LaunchAgent (scrape Clippd rankings, regenerate
# rankings-*.ts + all-teams-*.ts, detect champions, commit to main, deploy
# to prod, post Discord summary).
#
# Inherits every safety check from daily-refresh.sh:
#   - Kill switch (.daily-refresh-disabled)
#   - Dirty-tree abort
#   - 50% row-change sanity gate
#   - Discord failure posting
#
# NOTE: commit messages on `main` will look identical to nightly-cron
# commits ("daily refresh YYYY-MM-DD — rankings"). Distinguish on-demand
# runs by the commit timestamp — cron fires at ~01:00 UTC, on-demand
# runs any other time of day.
#
# Usage:
#   bash scripts/update-rankings-on-demand.sh
#   bash scripts/update-rankings-on-demand.sh --dry-run

set -euo pipefail

CGD_DIR="$HOME/projects/collegegolfdata"
cd "$CGD_DIR"

exec bash "$CGD_DIR/scripts/daily-refresh.sh" "$@"
