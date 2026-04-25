# Coloring update to Regional Predictions to highlight host team

**Started:** 2026-04-25T02:40:41Z
**Wrapped:** 2026-04-25T (retrospective wrap)
**Requester:** David Tenneson
**Branch:** ron/highlight-host-team (deleted after merge)
**Base:** dev
**Status:** merged-to-dev

## Task
Coloring update to Regional Predictions to highlight host team across
every Regional Predictions tab except Map.

## Actions (landed in commit `36dfd2d`, merged via `062ab02`)
- Added a new `hostColorByTeam` memo in `ScurveTable` mapping each
  host team's name to its host regional's colour.
- Threaded the map through to every non-map child component (By
  Regional, S-Curve, Visual, Breakdown).
- Extended `TeamLink` to accept an optional `hostColor` prop; when
  set, the link renders with that colour + `font-bold` inline.
- Map tab intentionally omits the prop so `USMap` / `BeeswarmTravel`
  keep their existing visual treatment.
- Behaviour follows the host team across modes: even when Strict mode
  displaces a host into a different regional, the host's home-regional
  colour still stands out.

## Diff stats
1 file changed, 88 insertions(+), 21 deletions(-)
- `src/components/scurve-table.tsx`

## Open questions / learnings
- **Retrospective wrap.** This session doc was left in `in-progress`
  state when the feature shipped — caught + closed during the
  2026-04-25 punchlist sweep with David. Author ledger
  (`36dfd2d` was authored by Mikkel via Discord live-edit, not Ron),
  so the wrap is a doc-only follow-up.
- **No follow-ups needed.** Feature is in production via the dev →
  main merge already on `main` (`c2f3f33`).
