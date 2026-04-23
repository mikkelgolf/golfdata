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

## Wrap — 2026-04-22 evening

**What landed on this branch (vs origin/dev):**

- My work (commit `4ae3f8f`): the four new files listed above
  (on-demand wrappers + handler doc + session doc).
- **Two unexpected commits from Mikkel's parallel session** that landed
  on `ron/on-demand-commands` between my push and the wrap:
  - `e840264` — "Confirm 2026 women's conference champions: Tennessee
    (SEC), Murray State (MVC), Cal Poly (BWEST), Little Rock (OVC),
    Tulsa (AAC), Richmond (A10)" — writes 6 confirmed winners into
    `src/data/championships-women-2026.ts`.
  - `7aab7ce` — "Wire Playwright-based Clippd winner extractor into
    `--apply-winners`" — replaces the stub `resolve_winner()` with a
    real Playwright-driven extractor. Adds
    `scripts/clippd_winner_extractor.py`, modifies
    `scripts/detect_new_champions.py`. Tested against the 6 winners
    above.
  - Wrap-time commit `db...` (pending): adds this wrap section + fixes
    David's Discord handle in the handler doc (`collegegolfbook`, not
    the `djtenneson` I guessed initially).

All three unexpected-commit contents are legitimate work that should
land on `dev` anyway. Leaving them in this PR is cleaner than
cherry-picking them out + force-pushing.

**Diff vs dev:** (see `gh pr view 7 --json additions,deletions`).

**Stash cleanup for Mikkel:**

After my juggling to keep WIP out of the feature branch, there are five
stashes. Most represent duplicates of the same WIP captured at different
points. Safe action:

```bash
# Verify stash@{4} (original bundle) matches what's now committed on
# this PR branch. If yes, drop them all:
git stash list
git stash drop stash@{0}   # stray-detect-champions-wip (now in commit 7aab7ce)
git stash drop stash@{0}   # stray-champ-women-ts-not-mine (now in commit e840264)
git stash drop stash@{0}   # mikkel-wip-detect-champions-re-stash-2 (dup)
git stash drop stash@{0}   # ron/on-demand-commands WIP pre dev-main push
                           # (ron's own daily-refresh env-var edit, reverted,
                           # safe to drop)
git stash drop stash@{0}   # mikkel-wip-playwright-and-champ-ts (original bundle,
                           # contents now in the two commits above)
```

**Open questions / deferred:**

- David's Discord handle confirmed (`collegegolfbook`), fixed in
  `docs/ron-bot/on-demand-handlers.md`. The handler snippet is ready
  to paste.
- Not yet tested: running `bash scripts/update-rankings-on-demand.sh
  --dry-run` and `bash scripts/update-conference-winner-on-demand.sh
  --dry-run` end-to-end. Worth doing before Mikkel restarts Ron.
- `post_daily_summary.py` was designed for daily-refresh's output
  shape. When the winner script calls it in the no-change path (no
  rankings, no deploy), the summary format might render awkwardly —
  acceptable for v1, tweak later if noisy.
