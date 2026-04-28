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

## Open questions (to confirm before coding)

1. **Source for the 13 missing men's rows:** is the spreadsheet
   sufficient, or do we want to cross-reference NCAA archive PDFs /
   Golfstat? (Position values come straight from the sheet — I'll
   surface them for review before committing.)
2. **North Dakota vs North Dakota State:** which is canonical for
   2013? Was North Dakota even a D1 program then?
3. **Schema:** does `regionals-history.json` require any fields the
   sheet doesn't have (e.g. team logo, conference for that year)? If
   so, what's the fallback?

## Progress log

- 2026-04-28: branch + session doc created; awaiting answers on
  open questions before backfilling rows.
