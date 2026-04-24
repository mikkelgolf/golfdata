# West Georgia is in the incorrect location again

**Started:** 2026-04-23T23:43:27Z
**Requester:** David Tenneson
**Branch:** ron/west-georgia-location
**Base:** dev
**Status:** wrapped

## Task
West Georgia is in the incorrect location again

## Actions
- Confirmed regression: the earlier fix (commit `3aa2d5d`, merged via PR #9) was lost during the big main→dev merge. West Georgia had reverted to `21.304547, -157.855676` (Honolulu) in the `all-teams-*` files and `0, 0` in the `rankings-*` files; Utah Tech had reverted to `56.6022875, -169.5445274` (Bering Sea) / `0, 0` the same way.
- Re-applied correct campus coordinates in all four data files:
  - West Georgia (Carrollton, GA): `33.5729, -85.0978`
  - Utah Tech (St. George, UT): `37.1041, -113.5659`
- Verified all 8 affected entries via grep before committing.
- Commit `52358aa` pushed to `origin/ron/west-georgia-location`.

## Diff stats
```
 docs/sessions/2026-04-24-west-georgia-location.md | 19 +++++++++++++++++++
 src/data/all-teams-men-2026.ts                    |  4 ++--
 src/data/all-teams-women-2026.ts                  |  4 ++--
 src/data/rankings-men.ts                          |  4 ++--
 src/data/rankings-women.ts                        |  4 ++--
 5 files changed, 27 insertions(+), 8 deletions(-)
```

Commits vs `dev`:
- `8ac9f15` chore(sessions): start west-georgia-location
- `52358aa` fix(coords): re-apply West Georgia and Utah Tech campus locations

## Open questions / learnings
- This is the second time this exact fix has been lost — first in a big merge, and again now. Worth considering a regression guard: either a small unit test (e.g. assert no D1 team sits in the ocean / outside the US bounding box), or a pre-merge checklist when folding `main` back into `dev`.
- Root cause this round appears to be the `main`→`dev` merge (`9c82f6b`) bringing in older data files that overwrote the campus coords. The rankings-*.ts files still have `0, 0` for most teams and only a handful of hand-patched coordinates, so any refresh that regenerates them without the backfill step will re-introduce the issue.
- Worth revisiting commit `3f8ff41` ("Fix team-page coords: backfill rankings-*.ts from all-teams-*.ts") — if that backfill is a one-shot script, running it as part of the daily refresh pipeline would make this class of regression go away permanently.

**Ended:** 2026-04-24T06:46:20Z
