# Session: Redefine "Advanced as underdog" using `expectedAdv`

- **Date:** 2026-04-28
- **Branch:** `ron/underdog-expected-adv`
- **Requester:** David Tenneson (Discord: collegegolfbook)

## Task

The "Advanced as underdog" stat in the Team page's REGIONAL PERFORMANCE
section is currently calculated as:

```ts
seed >= 5 AND team appeared at NCAAs that year
```

(see `src/app/teams/[gender]/[slug]/page.tsx:371-373`)

The same definition powers the `/regionals-leaderboard` board
(see `src/app/regionals-leaderboard/page.tsx:107-114`).

The `expectedAdv` boolean (sourced from the spreadsheet's "Expected to Adv"
column) is ingested via `scripts/build-regional-history.py:168` and stored on
every row in `src/data/regionals-rich.json`, but is **not currently used** in
the underdog calculation. ~1,308 of ~4,657 rows have a non-null `expectedAdv`
value.

David wants to swap the underdog definition over to use `expectedAdv` so the
stat reflects what was actually expected by the committee/seeding process,
rather than a blunt seed-bucket threshold.

## Open questions (to confirm before coding)

1. **New definition:** is "advanced as underdog" =
   - (a) `expectedAdv === false` AND advanced (rows where the field is
     explicitly false), OR
   - (b) `expectedAdv !== true` AND advanced (treat null/missing as "not
     expected"), OR
   - (c) something else?
2. **Fallback for null `expectedAdv`:** for older years where the spreadsheet
   field isn't filled in, do we (i) fall back to the old seed-based rule,
   (ii) exclude those rows entirely from the count, or (iii) treat null as
   "not expected"?
3. **Scope:** apply the change to both the team page tile AND the
   `/regionals-leaderboard` board, right? (assuming yes)

## Plan (pending answers above)

- Update the filter in `src/app/teams/[gender]/[slug]/page.tsx`
- Mirror the change in `src/app/regionals-leaderboard/page.tsx`
- Spot-check a few teams locally to make sure the new counts look sane
- Update the tooltip / label on the tile if the definition changes meaningfully
- Wrap with PR

## Decisions (from David, 2026-04-28)

- **New definition:** within the seeding-data window, "underdog" =
  `expectedAdv !== true` AND advanced to NCAAs. Null counts as underdog
  (treats missing data as "not expected"); only an explicit `true` means
  "expected to advance".
- **Year window:** computed dynamically per gender as the set of years
  in which any team has `expectedAdv === true`. Currently resolves to
  2002-2025 for men and 2000-2025 for women (gap at 2020 in both, COVID).
- **Outside the window:** rows are excluded from the count entirely
  (we have no truth to call anyone an underdog there).
- **Scope:** Team page + /regionals-leaderboard. Both use the new helper.
- **Tile text (team page only):**
  - "Advanced as underdog" subtitle → "Advanced to NCAAs unexpectedly
    based on seeding"
  - "Seeded years" subtitle → "Seeding data available: {minYear}-present"
    (using the dynamic min year for the gender)
- **Wrap:** added a `wrapDetail` prop on `StatCard` so longer subtitles
  wrap onto multiple lines instead of getting truncated by ellipsis.
- **Spelling note:** David wrote "Seeding data **availed**" — used
  "available" since "availed" doesn't quite fit grammatically. Flagged
  for confirmation.

## Implementation

Files changed:
- `src/data/regionals-seeding.ts` — new helper `getSeedingWindow(gender)`
  returning `{ minYear, maxYear, years: Set<number> }`. Cached per gender.
- `src/components/stat-card.tsx` — new `wrapDetail` prop; when true, the
  detail line uses `whitespace-normal break-words leading-snug` instead
  of `truncate`.
- `src/components/team-page/regional-performance.tsx` — new
  `seedingMinYear` prop; updated both subtitles; both tiles set
  `wrapDetail`.
- `src/app/teams/[gender]/[slug]/page.tsx` — replaced the seed >= 5 +
  NCAA filter with the new window/expectedAdv-based filter; passes
  `seedingMinYear` to `RegionalPerformance`.
- `src/app/regionals-leaderboard/page.tsx` — same filter swap inside
  `buildAggregates`.
- `src/components/regionals-leaderboard-tabs.tsx` — updated the
  "Most advanced as underdog" subtitle to match the new definition
  (was "Seeded 5 or lower and still made it to the NCAA Championship.").

## Sanity check

Compared old vs new counts across all teams:

| Gender | Total old | Total new | #1 old             | #1 new            |
|--------|-----------|-----------|--------------------|-------------------|
| Men    | 313       | 188       | varies             | SMU (6, was 7)    |
| Women  | 303       | 163       | varies             | Purdue (9, was 13)|

Lower totals are expected — the new logic correctly excludes teams that
*were* expected to advance but had seed >= 5 (e.g. a 5-seed at a Regional
where 6 seeds advanced). The leaderboard ordering is similar to before,
just slightly tighter at the top.

## Progress log

- 2026-04-28: branch + session doc created
- 2026-04-28: spec confirmed, helper + filters + UI + subtitle text all
  shipped; typecheck clean; ready for review
