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
# We always inject --force-snapshots: a manual rankings update is an
# explicit "make this an official archive entry" request from the user,
# so we want a snapshot written even if today's content fingerprint
# matches the previous archive entry (option-a dedup). The nightly cron
# does NOT pass --force-snapshots, so its dedup behavior is unchanged.
#
# Usage:
#   bash scripts/update-rankings-on-demand.sh
#   bash scripts/update-rankings-on-demand.sh --dry-run

set -euo pipefail

CGD_DIR="$HOME/projects/collegegolfdata"
cd "$CGD_DIR"

exec bash "$CGD_DIR/scripts/daily-refresh.sh" --force-snapshots "$@"
