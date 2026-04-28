# Regional S-Curve Tool

**Started:** 2026-04-28T01:45:57Z
**Requester:** David Tenneson
**Branch:** ron/regional-s-curve-tool
**Base:** dev
**Status:** merged to dev
**Wrapped:** 2026-04-28

## Task
creation of a new tool that allows for building of a Regional s-curve

## Actions
Built the **Manual Grid** tool at `/?view=manual` — a drag-and-drop
S-curve builder where users can rearrange the committee's default
serpentine assignments and immediately see how it changes the field.
Iterated across ~8 rounds of polish with David. The final shape:

### Core grid
- New `ManualGridTable` component (`src/components/manual-grid-table.tsx`)
  with `@dnd-kit/sortable` for both header drag (regional column order)
  and per-cell drag-to-swap. Long-press (~½s) on a team sends it to the
  Head-to-Head / Map panel below.
- Host teams stay locked to their own regional column. Non-duplicate
  rule: a team can only appear once on the grid.
- localStorage persistence (`saveGridState` / `clearGridState` in
  `src/lib/manual-grid.ts`) so the user's edits survive reloads.
- "Reset Last" undo stack and "Reset All" wipe.
- Directions split into two paragraphs with the "browser-only" caveat
  surfaced clearly. Number on the left of the team name is the overall
  seed; number on the right is the true ranking.

### Travel-balance optimizer
- `BalancePopover` (Sparkles icon) opens a viewport-centered dialog
  that re-optimizes assignments within affected tiers using a
  brute-force min-sum permutation (n ≤ 6 → 720 candidates, instant).
- Two cutoff modes: "from Regional Seed N" or "from Overall Seed N".
  Defaults: Regional Seed 8; Overall Seed 60 (men) / 49 (women) — these
  are static per-gender numbers (the dynamic magic-number lookup didn't
  match the official Bubble Breakdown value, so we hardcoded it).
- "Override Manual Swaps" checkbox (off by default) lets the user
  decide whether the optimizer can undo their existing manual moves
  inside the affected range.
- Pure-function library at `src/lib/manual-grid-balance.ts` so the
  algorithm stays UI-free and testable.

### Detail panels (Head-to-Head and Map tabs)
- Tab switcher beneath the grid. H2H tab embeds the existing
  `HeadToHeadBrowser` in a new "embedded" mode (parent owns A/B state).
  Common Opponents detail panel was extracted into
  `src/components/head-to-head/common-opponents-detail.tsx`.
- Map tab uses a new `ManualGridMap` (`src/components/manual-grid-map.tsx`)
  built on the shared Albers USA projection (`src/lib/us-projection.ts`).
  Two display modes:
    1. **Head-to-Head**: Team A solid lines, Team B dashed; distance
       grid below shows mileage from each selected team to every regional
       site, in the *same column order as the manual grid headers*.
    2. **Regional-selected** (click any regional dot): clears A/B and
       fans lines from that regional to every team currently placed in
       it; distance grid collapses to a single Team / Distance / Time
       Zones column. Tapping the same regional again clears.
- **Timezone meridian lines** added to the map (matching the Team-page
  map). The dashed mesh path is hoisted into `us-projection.ts` as
  `timezoneBorderPath` so other map components can share it.
- **Time Zones column** in the regional-selected distance grid using
  `tzBandFromCoord` + `tzDeltaHours` (same helpers as the Team page).
  Shows signed integer delta with verbose tooltip.
- Clear Teams button on the Map tab clears Team A, Team B, and any
  selected regional in one shot.

### Misc
- Color shared via `src/lib/manual-grid-colors.ts` (Team A / Team B
  colors used by both the table and the map).
- Press timings tuned to feel like an iOS haptic (~½s hold, snappy
  release).

## Diff stats
13 files changed, 3,269 insertions(+), 56 deletions(-)

Highlights:
- `src/components/manual-grid-table.tsx` — new, 1,168 lines
- `src/components/manual-grid-map.tsx` — new, 708 lines
- `src/lib/manual-grid.ts` — new, 276 lines
- `src/lib/manual-grid-balance.ts` — new, 258 lines
- `src/components/head-to-head/common-opponents-detail.tsx` — new, 288 lines
- `src/components/scurve-table.tsx` — +245 (ManualGridSection wrapper)
- `src/components/head-to-head-browser.tsx` — +158 (embedded mode)
- `src/lib/us-projection.ts` — +70 (timezone meridian export)

## Open questions / learnings
- **Magic number is a published value, not a derived one.** Mikkel and
  David maintain the Bubble Breakdown number by hand each cycle; trying
  to derive it from the in-grid worst-rank produced a value (~80s) that
  didn't match the published 68/51. Switched to static per-gender
  defaults; if the cycle ever changes, those constants need updating in
  `manual-grid-table.tsx`.
- **Mobile popover anchoring** kept biting us — a right-anchored
  absolute popover clipped on narrow viewports. Final solution:
  `fixed inset-center` dialog (translate-50%/-50%) with a max-height
  scroll. Worth remembering for future floating UI on this site.
- **Callback refs** turned out to be the cleanest way to plumb child
  state up to a parent (`onChange` for assignments, `onRegionalsOrderChange`
  for column order) without re-render churn from inline lambdas in the
  effect deps. Pattern reused in 4+ places now.
- **Brute-force min-sum permutation** is fine at n=6, but if we ever
  let the user widen the optimizer scope across multiple tiers
  simultaneously the cost would blow up. The current row-by-row
  approach also can't trade across tiers — that's a deliberate
  constraint to keep the grid coherent, but it does leave some
  borderline cases on the table.
- **Shared timezone path on `us-projection.ts`** could replace the
  inline construction in `team-map.tsx` too — minor follow-up if
  someone wants the DRY version.
