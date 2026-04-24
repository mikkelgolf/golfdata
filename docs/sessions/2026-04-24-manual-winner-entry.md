# manual-winner-entry

**Started:** 2026-04-24T00:00:00Z
**Requester:** David Tenneson
**Branch:** ron/manual-winner-entry
**Base:** dev
**Status:** in-progress

## Task
Add a `scripts/apply-manual-winner.sh` script that lets a human-supplied
conference winner (told to Ron in Discord) flow through the same validate
→ commit → push-main → vercel-prod pipeline as the automated cron
(`scripts/update-conference-winner-on-demand.sh`).

Why: conference championships end on specific days and Mikkel wants them
on the live site immediately. The automated cron requires Clippd's
leaderboard page to return row-1 team data, which sometimes lags. A
manual path lets David/Mikkel push a known result straight through.

This script requires a **guardrail amendment** in Ron's system prompt to
add a narrow named-script exception to the "never push to main" rule.
That edit is Mikkel's — this session just builds the script + PRs it to
`dev`. Mikkel reviews, merges `dev → main`, and updates Ron's prompt in
the same sitting.

## Actions
_(filled on !wrap)_

## Diff stats
_(filled on !wrap)_

## Open questions / learnings
_(filled on !wrap)_
