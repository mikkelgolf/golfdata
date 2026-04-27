# Find and apply Regional Clippd Scoreboard links to Regional Predictions page tabs

**Started:** 2026-04-27T03:53:00Z
**Requester:** David Tenneson
**Branch:** ron/regional-scoreboard-links
**Base:** dev
**Status:** wrapped

## Task
find and apply the Regional Clippd Scoreboard links to the Regional Predictions page tabs

## Actions
- Added optional `clippdUrl?: string` field to the `Regional` interface in
  `src/data/regionals-men-2026.ts`, used by both men's and women's regionals
  (women's file imports the type from men's).
- Wired all 12 (6 men + 6 women) Clippd live-scoreboard URLs supplied by David
  into `regionals-men-2026.ts` and `regionals-women-2026.ts`.
- **Regional view (default):** added "Live scoreboard ↗" inline link in the
  desktop regional header row (right-side meta) and an `ExternalLink` icon
  beside the toggle on mobile. Click on the link `stopPropagation`s on
  desktop; on mobile the row was refactored from a single `<button>` to a
  `<div>` containing button + anchor as siblings so the click targets stay
  separate.
- **Map tab:** surfaced the same link in the desktop top-right info overlay
  and the mobile bottom-sheet info panel that appear after a regional dot
  is selected.
- **S-curve tab:** wrapped each regional column header in an anchor to its
  scoreboard URL, bumped 9px → 11px / semibold, and switched the muted-grey
  text color to the regional's accent color (matching its underline).
- **Visual tab:** mirrored the S-curve treatment on both desktop column
  headers (10px → 12px / semibold + regional color) and mobile per-regional
  card headers (8px → 10px, fixed height bumped 18 → 22 to fit). Added
  trailing `ExternalLink` icon on both.
- All four touch points share the same conditional pattern — when
  `clippdUrl` is unset the link is hidden and the header degrades to plain
  text, so future seasons (or prior years if backfilled) just-work.
- Verified `npx tsc --noEmit` and `npx eslint <touched files>` both pass
  after each commit.
- Three Vercel previews shipped during the session for David to spot-check.

## Diff stats
```
docs/sessions/2026-04-27-regional-scoreboard-links.md |  19 ++
src/components/scurve-table.tsx                       | 199 ++++++++++++------
src/components/us-map.tsx                             |  30 +++-
src/data/regionals-men-2026.ts                        |   8 +
src/data/regionals-women-2026.ts                      |   6 +
5 files changed, 207 insertions(+), 55 deletions(-)
```

(Pre-`!wrap` commit; `!wrap` adds this summary on top of the same baseline.)

## Open questions / learnings
- The mobile regional row in the Regional view used a single full-width
  `<button>` for expand/collapse. To put a sibling link beside it without
  nesting `<a>` inside `<button>` (invalid HTML), the easiest move was to
  promote the wrapper to a `<div>` carrying the borders and let the button
  + anchor sit side-by-side as flex children. Worth remembering whenever a
  toggle row needs an adjacent action.
- The conference-championship side already had `clippdUrl` precedent on its
  data shapes, so naming stayed consistent with no new convention to debate.
- Women's URLs were posted on Clippd ahead of the 4/29 selection show, so
  all 12 regionals had live URLs at session time — no `null` fallbacks
  needed yet, but the optional schema is in place if a future season's
  links lag.
