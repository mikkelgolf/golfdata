# Session: Regionals data backfill (missing rows + name mismatch)

- **Date:** 2026-04-28
- **Branch:** `ron/regionals-data-backfill`
- **Requester:** David Tenneson (Discord: collegegolfbook)

## Task

Follow-up to the `ron/underdog-expected-adv` session (merged into `dev`
as PR #23, commit `dc84eb7b`). The two-direction audit comparing the
spreadsheet (`regionals-rich.json`) vs the canonical site truth
(`regionals-history.json`) surfaced data gaps that need fixing.

### Findings to address

**A. Missing rows on the site (men) — 13 teams across 3 cells:**

| Year | Regional | Missing teams                                                                  |
|------|----------|--------------------------------------------------------------------------------|
| 1996 | East     | Central Connecticut, George Mason, James Madison, Rhode Island, Temple, Yale  |
| 2000 | East     | Dartmouth, James Madison, Richmond, Seton Hall, VCU, Yale                     |
| 2002 | Central  | Jackson State                                                                  |

**B. Name mismatch (women) — 1 team:**

- 2013 women's West: site has "North Dakota", sheet has "North Dakota
  State". Need to determine which is correct (probably North Dakota
  State, since "North Dakota" wasn't a varsity D1 program in 2013) and
  either fix at source or add an alias.

## Plan

1. **Verify each missing row from the sheet** — pull the per-row detail
   (position, score, etc.) from `regionals-rich.json` and double-check
   against any historical record we have access to (NCAA archives,
   Golfstat, etc. — David may have the canonical source).
2. **Resolve the North Dakota / North Dakota State question** — same:
   look at the sheet row + cross-reference to a known source. Decide:
   - (a) sheet wins → fix `regionals-history.json` row to "North Dakota
     State" (and any rankings/all-teams files if relevant), OR
   - (b) site wins → add `"North Dakota State": "North Dakota"` to
     `team-name-aliases.json` and re-run the ingest.
3. **Backfill men's rows into `regionals-history.json`** — write the 13
   missing entries with `team`, `gender`, `year`, `regional`, and
   `position` (and any other fields the schema requires). Re-run
   downstream consumers (rankings? streaks?) and verify no breakage.
4. **Re-run the audit script** to confirm zero discrepancies in both
   directions.
5. **Verify on Team pages:** Yale men, James Madison men, Dartmouth
   men, Jackson State men, North Dakota (State) women — their
   PROGRAM HISTORY > Regional Apps and year-by-year grids should now
   include the backfilled rows.

## Decisions (from David, 2026-04-28)

- **Source of truth:** sheet is sufficient. All 13 missing men's rows
  are recorded in the sheet as `result='DNF'` with no `finalPos` and
  no `teamAdvanced` value — they're just bottom-of-leaderboard
  placeholders. No NCAA-archive cross-reference needed.
- **North Dakota:** sheet wins. Site row was a typo. Rename in place
  (no alias needed — the sheet always uses "North Dakota State").
- **Schema:** `regionals-history.json` rows are
  `{year, gender, site, team, position, advanced}` — no `regional`
  field, `site` is always empty across the file. `position` is a
  string; consumer code does `parseInt(position, 10)` then filters
  NaN, so a non-numeric `"DNF"` is safe (won't break `bestFinish`,
  `regionalWins`, percentiles, etc.).

## Schema findings

`RegionalFinish` (in `src/data/records-types.ts`):
```ts
{
  year: number;
  gender: Gender;
  site: string;     // always empty in the file
  team: string;
  position: string; // numeric string, "T2" tied, etc.
  advanced: boolean;
}
```

The `regional` (East/Central/West/etc.) is NOT carried on
`RegionalFinish`; it lives on `RegionalFinishRich` and is used as a
disambiguator only when a team appears in multiple regionals
(extremely rare). Joins between the two are on
`(year, gender, team)`.

## Implementation

### A. 13 DNF rows added to `regionals-history.json`

| Year | Regional | Team                  | position | advanced |
|------|----------|-----------------------|----------|----------|
| 1996 | East     | Central Connecticut   | DNF      | false    |
| 1996 | East     | George Mason          | DNF      | false    |
| 1996 | East     | James Madison         | DNF      | false    |
| 1996 | East     | Rhode Island          | DNF      | false    |
| 1996 | East     | Temple                | DNF      | false    |
| 1996 | East     | Yale                  | DNF      | false    |
| 2000 | East     | Dartmouth             | DNF      | false    |
| 2000 | East     | James Madison         | DNF      | false    |
| 2000 | East     | Richmond              | DNF      | false    |
| 2000 | East     | Seton Hall            | DNF      | false    |
| 2000 | East     | VCU                   | DNF      | false    |
| 2000 | East     | Yale                  | DNF      | false    |
| 2002 | Central  | Jackson State         | DNF      | false    |

### B. 2013 women rename

`North Dakota` → `North Dakota State` (single row, position 23,
West Regional). Verified the sheet uses `North Dakota State`
consistently across all years; no alias needed.

### C. Bonus: 18 duplicate UCF women rows removed

Audit surfaced 18 byte-identical duplicate rows for UCF women across
1995/1996/2000/2001/2002/2008/2009/2012/2013/2014/2015/2017/2019/
2021/2022/2023/2024/2025. Each was an exact duplicate (same
position, same advanced, same site) — almost certainly leftover from
an earlier "Central Florida" → "UCF" alias migration. De-duped by
`(year, gender, team, position, advanced, site)` tuple. UCF women's
total Regional appearances drops from 36 → 18 (each year now counts
once, as it should).

## Verification

- **Audit re-run after writes:**
  - Direction A (sheet → site missing): **0**
  - Direction B (site → sheet missing within sheet year range): **0**
  - Per-year/gender team-count gaps: **0**
- **Typecheck:** clean.
- **Spot checks:**
  - Yale men: 13 appearances, including 1996 (DNF) and 2000 (DNF) ✅
  - James Madison men: 8 appearances, including 1996 (DNF) and 2000 (DNF) ✅
  - North Dakota State women: 2 appearances (2013 + 2018) ✅
  - UCF women: 18 appearances (was inflated to 36) ✅

## Progress log

- 2026-04-28: branch + session doc created; surfaced open questions.
- 2026-04-28: schema check; backfill + rename + dedupe applied; audit
  + typecheck clean.
- 2026-04-28: preview deployed
  (https://collegegolfdata-di1efmpek-mikkelgolfs-projects.vercel.app);
  David spot-checked + approved.

## Wrap (2026-04-28)

Closing the audit loop opened by PR #23. All three findings shipped in
a single commit since they all touch `regionals-history.json` and were
surfaced by the same two-direction audit pass:

- 13 DNF rows backfilled (men 1996 East, 2000 East, 2002 Central)
- 2013 women rename: North Dakota → North Dakota State
- 18 UCF women byte-identical duplicates removed

### Diff stats vs `dev`

```
2 files changed, 144 insertions(+), 1 deletion(-)
```

(`regionals-history.json` is single-line minified JSON, so the +1/-1
on that file masks the actual row delta of -5: +13 rows added, 18
rows removed.)

### Verification

- Audit re-run: zero discrepancies in both directions, per-year/gender
  team counts agree exactly.
- Typecheck clean.
- Spot checks on preview: Yale men, James Madison men, Jackson State
  men, North Dakota State women, UCF women all show the corrected
  data.

### Learnings

- `regionals-history.json` accepts non-numeric `position` strings (e.g.
  `"DNF"`) safely — consumer code does `parseInt` then NaN-filters.
- Looking at duplicates is a cheap audit step worth running anytime
  we touch this file. The UCF dupes had been silently inflating UCF's
  Regional Apps for years.
