# 2026-04-22 — On-demand Discord commands for rankings + conference winners

**Branch:** `ron/on-demand-commands`
**Requested by:** Mikkel (Discord: mikkelgolf)
**Collaborators:** David (allowed to invoke both commands)

## Goal

Expose two new `!`-prefixed Discord commands in Ron so either Mikkel or David
can kick off production updates without waiting for the nightly LaunchAgent:

1. **`!update-rankings`** — pull fresh Clippd rankings, regenerate
   `rankings-{men,women}.ts` + `all-teams-{men,women}-2026.ts`, commit to
   `main`, deploy to Vercel, post a Discord summary. Effectively the same
   pipeline as `scripts/daily-refresh.sh`, run on demand.
2. **`!update-conference-winner`** — detect conference championships that
   ended without a `winner` field, validate each winner against Clippd's
   `/scoring/team` leaderboard via Playwright (not just a name fuzzy-match),
   run `scripts/verify-championships.ts`, commit + deploy only if the
   validator passes.

## Design decisions

- **Main-branch writes are opt-in via the sanctioned daily-refresh path.**
  Mikkel confirmed 2026-04-22 that on-demand invocations of
  `daily-refresh.sh` (which commits to `main` + `vercel --prod`) are fine —
  Ron's standing "never push to main" guardrail only blocks direct
  `git push origin main` from the bot. The scripts are the sanctioned
  exception with their own kill-switch (`.daily-refresh-disabled`) and
  >50%-rows-changed sanity gate.
- **"Validate" for winners means external cross-check, not structural-only.**
  Option (b) from the 2026-04-22 Discord thread: before writing a winner
  into `championships-{men,women}-2026.ts`, the script must load the
  matching Clippd `/scoring/team` page and confirm the row-1 TEAM cell
  (Playwright) — the same approach `detect_new_champions.py
  --apply-winners` already takes. If Playwright can't confirm, the script
  posts the `needsManual` entries to Discord and does NOT commit.
- **`daily-refresh.sh` left untouched.** An earlier version of this plan
  added a `CGD_REFRESH_SOURCE` env var so on-demand commits could be
  tagged differently in `git log`. That edit was reverted — the script
  stays as-is. Tradeoff: on-demand and nightly-cron commits are visually
  identical. Distinguish by commit time (cron fires ~01:00 UTC).
- **No new handler code in this repo.** `ron.py` lives outside
  `collegegolfdata`. The handler snippet + install steps are in
  `docs/ron-bot/on-demand-handlers.md` for Mikkel to paste into Ron.

## Files in this branch

- `scripts/update-rankings-on-demand.sh` — thin `exec` wrapper around
  `daily-refresh.sh`. Purely a named entry point for Ron.
- `scripts/update-conference-winner-on-demand.sh` — runs
  `scrape-clippd-tournaments.ts --pull`, then
  `detect_new_champions.py --apply-winners`, then
  `verify-championships.ts`, then commits + deploys iff any winners
  changed AND verify exits 0. Rolls back TS changes on validator
  failure.
- `docs/ron-bot/on-demand-handlers.md` — the exact snippet Mikkel pastes
  into `ron.py`, with an auth allowlist of Mikkel + David.

## Safety / guardrails summary

Both scripts:
- Refuse to run if the working tree is dirty on `main`.
- Refuse to run if `.daily-refresh-disabled` kill switch file exists.
- Respect the 50% sanity gate (rankings only — the winner script touches
  at most a few lines in championships TS files, so no gate needed).
- Post a Discord failure note via `scripts/post_daily_summary.py` on any
  abort.
- The winner script additionally rolls back any TS-file writes if
  `verify-championships.ts` fails, so we never commit bad data.

## Merge path

1. `ron/on-demand-commands` → `dev` via PR (Mikkel merges).
2. `dev` → `main` (Mikkel merges) — required before `!update-rankings`
   actually works, since the scripts run against the `main` checkout.
3. Paste the handler snippet into `~/projects/ron/ron.py` and restart
   Ron.

## Open questions

_To be filled on `!wrap`._
