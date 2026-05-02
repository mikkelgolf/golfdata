# 2026-05-02 — Daily refresh content-aware commit gate

**Branch:** `ron/daily-refresh-content-gate`
**Requested by:** David Tenneson (Discord: collegegolfbook)
**Co-author / reviewer:** Mikkel

## Why

The nightly `daily-refresh.sh` cron has been committing + redeploying
even on days when Clippd's scrape returns byte-identical data to the
day before. The only diff on those days is the auto-generated
date-stamp comment at the top of each data file:

- `src/data/rankings-{men,women}.ts`
  ` * Auto-generated from Clippd leaderboard API on YYYY-MM-DD.`
- `src/data/all-teams-{men,women}-2026.ts`
  `// Source: data/clippd/rankings-YYYY-MM-DD.json`

Concrete evidence (audited in this session before the change):

- **2026-04-29 daily refresh** (`af35e6dd`) — real Clippd update, every
  team row in `rankings-men.ts` rewritten with new numbers. Genuine
  data change.
- **2026-04-30 daily refresh** (`ea7cd17c`) — only diff in
  `rankings-men.ts` was the date comment. No team rows moved. Same
  for the other 3 files.
- **2026-05-01 daily refresh** (`ebf7b4ca`) — same: date-comment-only
  diff across all 4 files.

So roughly 2 of the last 3 nightly commits were no-content rebuilds.

Cost on a no-content day:

1. Commit pushes to `main`.
2. `vercel --prod` rebuilds and re-prerenders all 597 team pages
   (plus rankings, conference, regional pages).
3. CDN entries get invalidated.
4. Next request on each prerendered page now misses CDN, hits ISR
   cache, and bills reads (~10–22 read units per first hit after our
   recent payload-trim).
5. Rough estimate: ~6–12k ISR read units per no-content rebuild just
   to re-warm caches that didn't need warming, plus the writes for
   the fresh prerender.

This sits on top of the team-map static-asset win that just landed on
`dev` and is the next-cheapest lever to pull on the ISR cap fight.

## Plan

1. Add a content-aware check to `daily-refresh.sh` step 4 that
   ignores the auto-generated date-stamp lines when deciding whether
   the rankings/all-teams files actually changed.
2. Use `git diff -I<regex>` (git 2.30+; this machine has 2.53) so
   the filter is a property of the diff itself rather than a sed
   pipeline. Two `-I` patterns:
   - `^ \* Auto-generated from Clippd leaderboard API on [0-9]{4}-[0-9]{2}-[0-9]{2}\.$`
   - `^// Source: data/clippd/rankings-[0-9]{4}-[0-9]{2}-[0-9]{2}\.json$`
3. If only the date-stamp lines differ, **revert the working-tree
   changes** to those 4 files so tomorrow's run starts with a clean
   tree (the dirty-tree check at step 0 would otherwise abort the
   next cron).
4. Keep the existing OR-with-`CHAMPIONS_CHANGED` so a date-only
   rankings day with a new conference winner still commits +
   deploys.
5. Keep the existing 75% sanity gate. It runs only when real
   content changed — same semantics as today.
6. Update the `RANKINGS_CHANGED=yes` log line to make clear when
   the gate filtered date-stamps out so day-to-day debugging is
   easier from `logs/daily-refresh-*.log`.

## Out of scope for this session

- The accumulating untracked `src/data/rankings-archive/{men,women}/YYYY-MM-DD.ts`
  snapshot files. They're a separate issue (the daily-refresh `git
  add` only stages the 4 RANKINGS_FILES + champions, never the
  archive).
- The `src/data/rankings-archive/{men,women}/index.ts` auto-update
  drift Mikkel saw in a previous stash. Pre-existing, separate.
- Switching to on-demand `revalidatePath` instead of full prod
  rebuild. Bigger architectural change; the date-stamp gate is the
  zero-risk win to land first.

## Validation

- Verify the regex on a staged diff that contains only the
  date-stamp lines → `git diff --quiet -I... -I... <files>` should
  exit 0 (no real diff).
- Verify on a real-content diff (use the Apr 29 commit's parent vs
  child as a fixture) → exit 1 (real diff present).
- Confirm the revert step (`git checkout HEAD -- <files>`) cleans
  the working tree so a follow-up `git diff --quiet` is silent.

## Status log

- 2026-05-02 — session started, branch created off `dev`.
- 2026-05-02 — verified `git diff -I<regex>` behavior against the
  May 1 (date-only) and Apr 29 (real-content) historical commits as
  fixtures. Both classify correctly.
- 2026-05-02 — wired the gate into `scripts/daily-refresh.sh` step 4:
  `DATE_STAMP_IGNORE_FLAGS` array carries two `-I` patterns; on a
  date-only diff the script reverts the working-tree changes with
  `git checkout HEAD -- "${RANKINGS_FILES[@]}"` so tomorrow's run
  starts clean. Real-content path unchanged (still hits the 75%
  sanity gate). Champions OR at step 6 still ensures a date-only
  rankings day with a new conference winner commits + deploys.
- 2026-05-02 — end-to-end working-tree simulation:
    1. mutated only the date comment in `rankings-men.ts` → gate
       routed to date-only branch and reverted; tree clean.
    2. bumped Auburn's `avgPoints` → gate routed to real-content
       branch; commit-and-deploy path would proceed.
    3. `bash -n scripts/daily-refresh.sh` syntax OK.
  No actual cron run was triggered — that would push to `main`. The
  fixture + simulation tests are sufficient validation; the gate
  takes effect on the next 02:00 Norway-time LaunchAgent fire.

## Wrap (2026-05-02)

**PR:** https://github.com/mikkelgolf/golfdata/pull/<filled in at merge>
**Branch state at wrap:** 2 commits ahead of `origin/dev`, 2 files
changed (+134 / -2 lines including this doc).

**What shipped:**

- `scripts/daily-refresh.sh` — content-aware gate at step 4. Two
  `-I` regex flags filter out the auto-generated date-stamp comments
  before deciding whether to commit + redeploy. Working-tree revert
  on date-only nights keeps the cron's step-0 dirty-tree check
  satisfied tomorrow.
- `docs/sessions/2026-05-02-daily-refresh-content-gate.md` — this
  doc.

**Expected impact:**

Based on the Apr 29 / 30 / May 1 sample, ~2 of every 3 nightly cron
runs are date-stamp-only no-content rebuilds. With the gate, those
nights skip:

- 1 commit to `main`
- 1 `vercel --prod` build (~5–10 min runtime)
- 1 full re-prerender of all 597 team pages
- ~6–12k ISR read units to re-warm CDN caches (per the post-team-map
  ~10–22 read units per page first-hit cost)
- Plus the writes for the fresh prerender

Annualised at ~2/3 nights skipped, that's roughly 240 fewer prod
rebuilds per year and roughly **1.4–2.9M ISR read units saved per
year** that were previously paid for zero data change. On the
current 1M-units/cycle Hobby plan, that's a meaningful tail-cost
reduction even after the team-map win lands.

Real-content nights (Clippd actually moved a number) are unaffected
— same commit, same deploy, same Discord summary.

**Validation gates passed:**

- Historical fixtures: May 1 → "no real content" (correct);
  Apr 29 → "real content" (correct).
- Working-tree simulation: date-only + bump-avgPoints both
  classified correctly; revert path leaves tree clean.
- Bash syntax check: passes.
- No live cron run (would push to `main`).

## Open follow-ups (after this lands)

- Watch the `logs/daily-refresh-*.log` files for the next 3–5 nights
  to confirm the gate is making the right call. Look for either:
    - `rankings: only date-stamp comments changed (...) — reverting`
      → gate fired (the savings case)
    - `rankings delta (real content): ...` → real Clippd update
- The `src/data/rankings-archive/{men,women}/YYYY-MM-DD.ts` snapshot
  files keep accumulating untracked (the daily-refresh `git add`
  only stages the 4 RANKINGS_FILES + champions). Worth a separate
  session to either commit them automatically or rethink the archive
  storage.
- If the ISR cap fight is still tight after this and the team-map
  win compound, the next levers are: (a) move year-by-year timeline
  grids to client islands, (b) add `revalidate` + on-demand
  `revalidatePath` so daily writes only touch teams whose data
  actually changed.
