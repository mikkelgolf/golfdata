# s-curve needs fix on mobile

**Started:** 2026-04-27T02:47:46Z
**Requester:** David Tenneson
**Branch:** ron/s-curve-mobile-fix
**Base:** dev
**Status:** complete (merged to dev)

## Task
s-curve needs fix on mobile

Refined during the session: the broken view was the **S-Curve (snake)
table** on mobile. Each tier rendered as its own CSS-grid row, so
column widths were resolved per-row. A single long team name (e.g.
"Southern Illinois" in Athens, tier 12) widened that one row's track,
while the header row + every other tier kept their original tracks.
Net effect: the Columbus column visibly drifted right by the bottom of
the table.

## Actions
1. **First pass — Mobile *Visual* s-curve box headers** (commit
   `51e4d89`). Locked the regional header inside `MobileVisualScurve`
   to a fixed `h-[18px]` with single-line truncation so long names
   ("Bermuda Run", "Tallahassee") stop wrapping and changing card
   heights.
2. **Second pass — width stability inside the visual cards** (commit
   `ef360dc`). Switched outer 2-col + inner per-card grids to
   `minmax(0, 1fr)` and added `min-w-0` to the truncating team-name
   span so long names can't push the column past its track.
3. **Third pass — same fix on remaining 1fr grids** (commit `99b3787`).
   Applied `minmax(0, 1fr)` to `ScurveSnakeTable` and `VisualScurve`
   defensively while diagnosing.
4. **Final fix — rebuilt snake table as `<table>`** (commit `4c037aa`).
   David's diagnosis nailed the structural bug: independent grid rows
   can't share column widths regardless of `minmax`. Refactored
   `ScurveSnakeTable` to a real HTML `<table>` with
   `table-layout: auto`. Browser now sizes each column once based on
   the widest cell across the entire column (header + every tier) and
   reuses those widths in every row. Framer-motion animations,
   snake-direction arrows, host/colour borders, and the advancing
   divider (now `colspan`) all preserved.

## Diff stats
```
docs/sessions/2026-04-27-s-curve-mobile-fix.md |  19 +++
src/components/scurve-table.tsx                | 216 ++++++++++++++-----------
2 files changed, 139 insertions(+), 96 deletions(-)
```

5 commits on `ron/s-curve-mobile-fix`:
- `a52cd7f` chore(sessions): start s-curve-mobile-fix
- `51e4d89` fix(scurve): consistent box sizing on mobile s-curve view
- `ef360dc` fix(scurve): force consistent grid cell widths on mobile s-curve
- `99b3787` fix(scurve): apply minmax(0,1fr) to remaining s-curve grid views
- `4c037aa` fix(scurve): rebuild snake table as `<table>` so columns share widths

## Open questions / learnings
- **Lesson:** `minmax(0, 1fr)` only equalises columns *within* a single
  grid container. If you render each row as its own grid (as the snake
  table did), per-row column resolution is independent and a single
  wide cell drifts that row out of vertical alignment. To share column
  widths across rows you need either (a) a single grid containing all
  cells, (b) CSS subgrid, or (c) HTML `<table>`. The table is the
  cheapest fix when each "row" is structurally a row of cells.
- **Verification:** preview at
  `https://collegegolfdata-9s86vtijt-mikkelgolfs-projects.vercel.app`
  confirmed by David before merge — Columbus column now stays in its
  lane all the way down.
- **No new open questions.** Visual s-curve mobile cards also benefited
  from the early commits but the structural fix is the snake table.
