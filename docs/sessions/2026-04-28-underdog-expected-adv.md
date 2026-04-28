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

## Follow-up — Regionals History accuracy + cleanup (2026-04-28)

David flagged a discrepancy: the "NAT" column on `/regionals-history`
disagreed with the per-team page's PROGRAM HISTORY > Advanced count.
Examples (men): Auburn 17 vs 26, Texas 25 vs 32. Root cause was that
the table relied solely on `RegionalFinish.advanced` (basic position-
based fallback), while the team page already uses an OR-combined
helper that also consults the rich sheet's `Team Advanced` column +
NCAA championships history.

### Changes

1. **Sheet ingestion** — `scripts/build-regional-history.py` now reads
   the spreadsheet's "Team Advanced" column and emits a `teamAdvanced`
   field on every row. Once David re-runs the ingest with
   `REGIONALS_SHEET_ID=…` the JSON will populate; until then the field
   is null on existing rows and the helper gracefully OR-falls back.
2. **Type** — `RegionalFinishRich.teamAdvanced?: boolean | null` added
   to `src/data/records-types.ts` (optional so legacy rows still type-
   check).
3. **Helper** — `src/lib/streaks.ts` now exports
   `didAdvanceFromRegional({ richTeamAdvanced, ncaaAppearance, basicAdvanced })`
   and uses it inside `effectiveAdvancedYears` for the team-page
   `nationalStreak`/`totalAdvancements`. Truth is OR of all three
   signals.
4. **Regionals History table** — `src/components/regionals-results-table.tsx`
   now joins `championshipsHistory` + `regionalsRich.teamAdvanced` per
   `(team, year)` and feeds them into `buildRows`, which uses the
   shared helper. NAT count + the per-year cell coloring (advanced =
   emerald, missed = rose) now agree with the team page.
5. **Table cleanup** — same component:
   - "Apps" → "Regional Appearances" (header widened from 48px → 72px)
   - "Nat" → "Adv to NCAAs" (header widened from 48px → 72px)
   - All non-Team columns center-justified (header + cells).
   - `SortableHeader` gained `align?: "right" | "center"`.

### Verification

- Typecheck clean after all edits.
- Sample matches confirmed earlier in conversation: Auburn men
  17 → 26 ✅, Texas men 25 → 32 ✅, etc.

## Commit C — Team-name aliases (2026-04-28)

Refactored canonical maps out of the Python script into a shared JSON
file so they can be edited without touching code, and so a future
ingest from a different feed can reuse the same aliases.

### Changes

- **New** `scripts/team-name-aliases.json` — keyed by gender, maps
  raw sheet variants to canonical site names. Includes:
  - Existing men's aliases (East Tennessee State→ETSU, Central
    Florida→UCF, Memphis State→Memphis, North Texas State→North Texas,
    Lamar Tech→Lamar, Augusta State→Augusta, Detroit→Detroit Mercy,
    Kent→Kent State, West Point→Army, Louisiana-LaFayette→Louisiana-
    Lafayette).
  - Existing women's aliases (CSU Northridge→CSU - Northridge, CSU
    Fullerton→CSU - Fullerton, UCF→Central Florida, East Tennessee
    State→ETSU).
  - **New** defensive aliases: Brigham Young→BYU (both genders),
    "Cal State Northridge/Fullerton" variants → CSU - Northridge/
    Fullerton (women).
- **Updated** `scripts/build-regional-history.py` — loads the JSON at
  startup instead of holding the maps inline. Behaviour is otherwise
  identical (same WARN line for unmatched sheet names).

### Audit (2026-04-28, against current `src/data/regionals-rich.json`)

After applying the existing aliases, the rich JSON contains:
- **Women: 0 unmatched teams** — every team name resolves to a name
  present in `regionals-history.json`.
- **Men: 2 unmatched teams**, both real teams just missing from
  `regionals-history.json` for the year in question (NOT alias
  problems):
  - **George Mason**, 1996 East Regional, position "DNF". Team is
    in current rankings (A-10) and `all-teams-men-2026`. The 1996
    appearance simply isn't in `regionals-history.json` — likely a
    historical-data gap on that side, not a sheet name issue.
  - **Dartmouth**, 2000 East Regional, position "DNF". In current
    rankings (Ivy) and `all-teams-men-2026`. Same story — gap in
    `regionals-history.json` for that year.

Both rows are kept in `regionals-rich.json` and gracefully no-op in
the Regionals History table (the table iterates `regionals-history.json`,
which has no rows for them, so they don't show up — but the rich data
is available if/when those years get backfilled into the canonical
history).

No further alias additions needed at this time.

## Progress log

- 2026-04-28: branch + session doc created
- 2026-04-28: spec confirmed, helper + filters + UI + subtitle text all
  shipped; typecheck clean; ready for review
- 2026-04-28: Commit B — Regionals History NAT accuracy + table cleanup
  (column rename + center alignment + widened header). Typecheck clean.
- 2026-04-28: Commit C — extracted team-name aliases to
  `scripts/team-name-aliases.json`; ran audit (0 women + 2 men
  unmatched, both real-team gaps not alias issues); reported to David.
