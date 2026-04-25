# Add head-to-head data in Regional Predictions > By-Regional tab

**Started:** 2026-04-25T20:10:26Z
**Wrapped:** 2026-04-25T21:35:00Z
**Requester:** David Tenneson
**Branch:** ron/h2h-by-regional
**Base:** dev
**Status:** ready-for-merge

## Task
add in the head-to-head data in the Regional Predictions > By-Regional tab

## Actions

Iterated through four commits with David giving feedback after each preview:

1. **`db467dc` — initial matrix implementation.** Replaced the placeholder
   text in `RegionalDetailPanel` with a real square comparison matrix.
   Both axes use `TeamMonogram` color badges in seeded order (same badges
   as team pages). Cells show stroke-play W-L (or W-L-T) on top with the
   per-meeting avg stroke differential below; cell tint is `bg-primary/15`
   when the displayed team is up, `bg-destructive/15` when down. Diagonal
   "--" and `—` for missing pairs. Mobile fit: `table-fixed w-full`, badge
   16px on compact, " avg" suffix hidden below the `sm` breakpoint so a
   14-team men's regional fits a ~360px viewport without horizontal
   scrolling. Pulls data directly from `head-to-head-2526.json` via the
   existing `StrokeplayBreakdown` shape — no new API surface.

2. **`16e2eb1` — clickable cells.** Each populated cell wrapped in a
   `next/link` to `/head-to-head?gender=<g>&a=<col-team>&b=<row-team>`.
   The existing `HeadToHeadBrowser` already reads those params via
   `useSearchParams`, so no other changes were needed. Hover states
   mirror the cell tint and the link fills the entire `<td>` so the tap
   target on mobile matches the visible square. Diagonal + empty cells
   stay non-interactive.

3. **`16d7289` — flip axes + change sub-labels.** Per David's feedback:
   - Cells flipped to **row vs column** (display row team's record vs
     col team). Greens running across a row → row team is dominant.
   - Column-header sub-label changed from regional seed → **national
     rank** (`#5`).
   - Row-header sub-label changed to **regional seed (1..N)**, derived
     from the seed-sorted index, positioned to the left of the badge.
   - Added `<colgroup>` reserving 30px (compact) / 40px (default) for
     the row-header column so the seed+badge pair fits without
     squeezing the data cells.
   - Deep-link order swapped to match (row team = A on destination).

4. **`cf9a384` — mobile parity + relabel + conference badges.**
   - Extracted `RegionalDetailContent` as the single source of truth
     for both desktop (`RegionalDetailPanel`) and mobile
     (`MobileRegionalGroup`). Phones now see total + avg travel, AQ,
     conferences, travel extremes, field strength, and the H2H matrix
     — same content as desktop, slightly tighter `compact` styling.
   - **Highest/Lowest Rank** text: `Highest Rank: #5 Oklahoma (#5)` —
     headline is national rank (computed from `min(rank)`, not array
     index, so it's correct when seed/rank diverge); parenthetical
     keeps the existing S-curve seed.
   - **Host** text: `Host: Arizona (#4 seed, #20 rank)` where `#4 seed`
     is the regional seed (1..N), matching the H2H row labels.
   - **Auto Qualifiers** + **Conferences** StatBoxes carry
     `ConferenceBadge` rows (reused from team pages) under the headline
     number. The standalone gray `SEC, ACC, …` text below Field Strength
     was removed — it's redundant now that the badges live in the
     Conferences card.
   - Dropped the `HeadToHeadCompact` re-export from
     `head-to-head-matrix.tsx` (no longer referenced; variant prop is
     passed straight through).

## Diff stats

```
docs/sessions/2026-04-25-h2h-by-regional.md  |  19 ++
src/components/head-to-head-matrix.tsx       | 508 ++++++++++++--------------
src/components/scurve-table.tsx              | 237 ++++++++++---
3 files changed, 461 insertions(+), 303 deletions(-)
```

## Previews shipped during the session

- `collegegolfdata-hzi3akgem` — initial matrix
- `collegegolfdata-m2j77rb0g` — axes flipped + rank/seed sub-labels
- `collegegolfdata-e7rcev0e2` — final (mobile parity + conference badges)

## Open questions / learnings

- **"True seed" vs "S-curve seed" terminology** — David uses "true seed"
  to mean *regional seed within the regional* (1..N), not the overall
  S-curve seed (1..72ish). Two distinct values now coexist in the
  panel: the H2H matrix row labels + the host line use regional seed;
  the parenthetical on the Highest/Lowest Rank lines uses S-curve seed
  ("their seed as currently displayed"). Worth noting for future
  changes that touch this area so we don't accidentally collapse them.
- **Axes vocabulary** — David's first instruction said "x-axis is
  Team A, y-axis is Team B" (column = A, row = B). His second said
  flip to row-vs-column. The final state is the conventional
  matrix idiom (row-team's record across each column-team). The
  legend text reads "stroke play · row vs column" so the convention
  is documented in-product.
- **No `ConferenceBadge` for at-large fallback** — `aqConference`
  defaults to the team's own `conference` field when present;
  `ConferenceBadge` falls back to a neutral gray pill for any code
  not in `CONFERENCE_ACCENTS`, so unmapped conferences degrade
  gracefully but aren't visually distinct. Worth revisiting if a
  smaller conference shows up as an AQ and the visual blends in.
- **Playwright-permission gap** — the `mcp__playwright__*` tools
  require explicit per-session grant; both attempts this session were
  denied. Visual verification fell back to `tsc` + `next build` +
  Vercel preview deploys. If this becomes routine, granting Playwright
  perms once would save a deploy round-trip per visual check.
