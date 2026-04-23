# NCAA Championship year-by-year champions table

**Started:** 2026-04-23T00:00:00Z
**Requester:** David Tenneson
**Branch:** ron/champions-year-table
**Base:** dev
**Status:** merged into dev

## Task
create a new year-by-year table in the NCAA Championship page that appears above the current data table. I want this table to be similar to the one that appears under each individual team when that is expanded, but for this new table, I want just the team that won that year to appear for that year; specifically I want to use the same little badge that appears next to the team name on their Team page. For example, the 2025 men's champion was Oklahoma State, so I want to see the orange box with OKST appear for that year. In the case where there are multiple winners, I want them shown side-by-side in that same space, so shrink the badges accordingly. Ask me if you need more details, but two important points: 1) this Year-by-year table should match the style as the others so that the top-right is the most recent year and the bottom-left is the oldest, and 2) I want to do a similar table next for the Regionals where there are 6+ winners each year so make this a flexible template to use elsewhere too

## Actions

### 1. New reusable component
Created `src/components/year-by-year-winners-grid.tsx` — a generic RTL grid
of year cells, each showing the team monogram badge(s) of that year's
winner(s). Designed from the start to serve both the NCAA Championship
page (this session) and the upcoming Regionals page (6+ hosts per year).

**Props:**
- `results: YearWinners[]` — one entry per year: `{ year, winners[], cancelled? }`
- `gender?: Gender` — optional; when set, each monogram is a `<Link>` to the team page
- `isYearActive?: (year) => boolean` — dim the whole cell (designed for decade filter)
- `isWinnerActive?: (team, year) => boolean` — filter out individual winners; if all winners in a cell are filtered out, the cell renders as an em-dash (designed for conference filter)
- `cancelledTitle?: string` — tooltip text for cancelled-year cells

**Styling:**
- RTL 4/6/8/10-col grid, matches `team-page/national-timeline.tsx` and the existing expanded per-team grid.
- Monogram size auto-shrinks by winner count: 30 → 22 → 18 → 15 → 13 → 11 px for counts 1–6+. Handles single champion and multi-host-regional cases without config.
- Cells use `TeamMonogram` from `team-page/team-monogram.tsx`.
- No trophy icons, match-play badges, or semantic colouring — every cell is by definition a "win", so the badge itself is the information.

### 2. Integration into NCAA Championship page
Modified `src/components/championships-history-table.tsx`:
- Added a `buildWinnersByYear(entries, years)` helper that derives champion(s) per year using the existing `isChampion(finish)` from `@/lib/streaks`. Pre-2009 ties produce co-champions (e.g., 2015 men's: LSU + Stanford); post-2009 match-play normally one winner.
- Rendered a new collapsible `<section>` between the sticky filter header and the main data table. Defaults to **collapsed**. Header reads "Champions By Year" (title case), no subtitle. Expand/collapse is a motion.div with the same animation used by expanded team rows.
- Wired the conference filter via `isWinnerActive`: when active, non-matching winners are replaced with an em-dash (matches the "hide non-matching rows" semantics of the main table below).

### 3. Removed the Decades filter UI
After iteration: the decade filter's dim-all-cells-outside-range behaviour
didn't read well on the champions grid (it dimmed most cells at once).
**Temporarily hid the Decades filter chip UI entirely** from the sticky
header. Kept `decadeFilter` state, the `decades` memo, and the
`yearInActiveDecade` function in place so the per-team expanded grid's
dim behaviour comes back the moment the filter does. Removed the
now-unused `toggleDecade` helper.

## Diff stats

```
docs/sessions/2026-04-23-champions-year-table.md |  19 +++
src/components/championships-history-table.tsx   | 138 ++++++++++-----
src/components/year-by-year-winners-grid.tsx     | 208 +++++++++++++++++++++++
3 files changed, 322 insertions(+), 43 deletions(-)
```

## Open questions / learnings

### Reusability checklist for the Regionals version

The grid component is intentionally gender-aware-but-not-championship-aware,
so the Regionals version should be a drop-in. To repeat the pattern there:

1. Find/confirm the Regionals page component (likely `src/components/regionals-*.tsx` — see `regionals-leaderboard-tabs.tsx` and `regionals-results-table.tsx` already in the tree).
2. Derive "hosts" or "winners" per year — Regionals has 6+ sites per year, each with one advancing team (or host, depending on what David means by "winners each year"). Clarify with David which signal to surface (regional host, regional winner, or top advancing team).
3. Build `YearWinners[]` and render `<YearByYearWinnersGrid>` above the existing tables, inside a collapsible section (default collapsed). Reuse the same header style "Champions By Year" / "Hosts By Year" / "Regional Winners By Year" as appropriate.
4. Skip the decades filter (still hidden on NCAA page too).
5. Conference filter: if the Regionals page has one, wire `isWinnerActive` the same way.

### Design decisions worth keeping

- **Conference filter = hide (em-dash), decade filter = dim.** Hide matches the main-table row-filter semantics; dim matches the per-team expanded grid's existing pattern. Keep this distinction when decade comes back.
- **Default collapsed.** David's final call. If the Regionals grid is visually heavier (6+ badges per cell), definitely keep collapsed-by-default there.
- **Badge sizing scales automatically** based on winner count — 6+ is already handled.
- **Title case for the section header** — match "Champions By Year" pattern.

### Unresolved

- How the Decades filter should ultimately interact with the champions grid (dim reads poorly; hide-via-em-dash conflates with missing-data). Parked.
- Whether the Regionals grid wants gender toggling the same way (women's regionals, men's regionals — probably yes).

## Preview deployments

Most recent preview: https://collegegolfdata-qflfpulhj-mikkelgolfs-projects.vercel.app/championships-history
