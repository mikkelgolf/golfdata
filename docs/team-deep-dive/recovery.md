# team-deep-dive recovery

If the Mac Mini reboots / crashes / has to be wiped, this doc is the
recipe to bring the team-deep-dive system back online.

## What's running

Two LaunchAgents on the Mac Mini run continuously:

| LaunchAgent | Plist | Working dir | Process |
|---|---|---|---|
| `com.local.CGDDeepDive` (M1) | `~/Library/LaunchAgents/com.local.CGDDeepDive.plist` | `~/projects/collegegolfdata` | `queue-drainer.sh` walking `data/team-deep-dive/queue.txt` |
| `com.local.CGDDeepDiveM2` (M2) | `~/Library/LaunchAgents/com.local.CGDDeepDiveM2.plist` | `~/projects/collegegolfdata-m2` (worktree) | `dispatcher.py` walking `data/team-deep-dive/jobs/*.json` |

Both have `KeepAlive=true` + `RunAtLoad=true` so they auto-restart on
crash and come back after reboot.

## Critical paths

```
~/projects/collegegolfdata/         # M1 worktree, branch=dev (or whatever Ron's on)
~/projects/collegegolfdata-m2/      # M2 worktree, branch=dev-mikkel (PINNED)
~/Library/LaunchAgents/             # both plists live here

~/projects/collegegolfdata/data/team-deep-dive/
  jobs/<job_id>.json                # M2 manifests
  evidence/<slug>/<sha1>.json       # raw evidence per source URL
  expected-schedule-<slug>.json     # ground truth (school + Wayback)
  event-bridges.json                # cross-team bridge registry
  bridges-checkpoint-<slug>.json    # resumable per-team progress
  extracted-facts/<slug>.json       # LLM-extracted facts per team
  reconciled-facts-<slug>.json      # post-reconcile per team
  insights-<slug>.json              # Opus-synthesized connections
  coverage-gaps-<slug>.json         # missing-event report
  golfstat-backfill-queue-<slug>.tsv # TIDs to feed back into mikkel-system

~/projects/collegegolfdata/src/data/teams/<slug>-men-record-book.json
                                     # the rendered output Vercel reads
~/projects/collegegolfdata/scripts/team-deep-dive/
                                     # all 25+ M2 scripts live here
                                     # (also in collegegolfdata-m2 worktree)
```

The worktree is the durable thing — it's pinned to `dev-mikkel` and won't
get its branch swapped by Ron-bot.

## After a Mac Mini reboot

LaunchAgents auto-restart. Within ~60s of reboot you should see:

```
$ launchctl list | grep CGDDeepDive
<pid>  0  com.local.CGDDeepDive
<pid>  0  com.local.CGDDeepDiveM2
```

Run `~/projects/collegegolfdata/scripts/team-deep-dive/status.sh` for a
live snapshot of both pipelines.

## After a full Mac wipe

```
# 1. Clone the repo to both paths
git clone https://github.com/mikkelgolf/golfdata.git ~/projects/collegegolfdata
cd ~/projects/collegegolfdata
git worktree add ~/projects/collegegolfdata-m2 dev-mikkel

# 2. Symlink M2 worktree's data dirs to the M1 worktree's (shared state)
cd ~/projects/collegegolfdata-m2
ln -sf ~/projects/collegegolfdata/data/team-deep-dive data/team-deep-dive
ln -sf ~/projects/collegegolfdata/data/cache data/cache
ln -sf ~/projects/collegegolfdata/logs/deep-dive logs/deep-dive

# 3. Set up Python env (if not already)
~/venv/bin/pip install requests beautifulsoup4 google-cloud-bigquery

# 4. Re-install LaunchAgents
cp ~/projects/collegegolfdata/scripts/team-deep-dive/launchd/*.plist \
   ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.local.CGDDeepDive.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.local.CGDDeepDiveM2.plist

# 5. Manually re-login Claude Code (Max plan auth is per-host keychain)
claude  # interactive, then exit
```

Evidence corpus + bridges + extracted-facts will be lost (they're
gitignored). Re-running the dispatcher rebuilds them all.

## Restart M2 dispatcher manually

```
launchctl kickstart -k gui/$(id -u)/com.local.CGDDeepDiveM2
```

## Add a new team to the M2 queue

```bash
SLUG=oklahoma
GENDER=men
TODAY=$(date +%Y-%m-%d)
cat > ~/projects/collegegolfdata/data/team-deep-dive/jobs/${SLUG}-${GENDER}-${TODAY}.json << EOF
{
  "job_id": "${SLUG}-${GENDER}-${TODAY}",
  "school_slug": "${SLUG}",
  "gender": "${GENDER}",
  "status": "pending",
  "phases_complete": [],
  "current_phase": null,
  "started_at": null
}
EOF
# Dispatcher picks it up next idle cycle (~10 min) automatically.
```

## Reset a failed job

```bash
python3 -c "
import json
f = 'data/team-deep-dive/jobs/<slug>-men-<date>.json'
d = json.load(open(f))
d['status'] = 'pending'
d['error'] = None
# Optional: clear specific phases to re-run
# d['phases_complete'] = [p for p in d['phases_complete'] if p != 'schedule_discovery']
json.dump(d, open(f,'w'), indent=2)
"
```
