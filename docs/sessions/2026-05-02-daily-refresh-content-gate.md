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
