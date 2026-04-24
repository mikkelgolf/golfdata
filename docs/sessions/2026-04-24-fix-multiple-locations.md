# fix multiple locations

**Started:** 2026-04-24T00:00:00Z
**Wrapped:** 2026-04-24T00:00:00Z
**Requester:** David Tenneson
**Branch:** ron/fix-multiple-locations
**Base:** dev
**Status:** merged-to-dev

## Task
fix multiple locations

David flagged two more team coordinates that were wrong:
- **SIU Edwardsville** should be in Edwardsville, IL.
- **University of Idaho** was in the wrong location too.

## Actions
- Located each team's row across the four data files (`all-teams-men-2026.ts`,
  `all-teams-women-2026.ts`, `rankings-men.ts`, `rankings-women.ts`).
- SIU Edwardsville was at `40.1053, -85.6802` — near Muncie, IN (Ball State area).
  Fixed to `38.7942, -89.9947` (main SIUE campus, Edwardsville, IL, ~20 mi NE of
  St. Louis). Men's team only.
- Idaho (University of Idaho) was at `42.8620, -112.4506` — that's Pocatello, ID,
  which is actually **Idaho State University**. Fixed to `46.7269, -116.9989`
  (Moscow, ID, in the Panhandle). Appears in both men's and women's data.
- Committed as `bceadd0`, pushed, deployed preview
  (`collegegolfdata-2adtbu15e`), then merged into `dev` with `--no-ff`
  (`0bc8316`).

## Diff stats
Against `dev` at merge base `4791fae`:
```
 docs/sessions/2026-04-24-fix-multiple-locations.md | 19 +++++++++++++++++++
 src/data/all-teams-men-2026.ts                     |  4 ++--
 src/data/all-teams-women-2026.ts                   |  2 +-
 src/data/rankings-men.ts                           |  4 ++--
 src/data/rankings-women.ts                         |  2 +-
 5 files changed, 25 insertions(+), 6 deletions(-)
```

## Open questions / learnings
- This is the **third coordinate-regression fix in a week** (West Georgia / Utah
  Tech earlier, now SIUE / Idaho). The placeholder-style wrong values
  (`40.1053, -85.6802`, `42.8620, -112.4506`, `21.30, -157.86`) suggest the
  original geocoding step sometimes matched the wrong institution (e.g. "Idaho"
  → Idaho State). Worth a sweep with `scripts/verify-team-coords.ts` against a
  trusted source to catch any remaining mismatches rather than fixing one team
  at a time.
- Names with "SIU", "UT", "U of X" etc. are especially ambiguous for geocoders
  — a verification script that cross-checks team name ↔ city/state ↔ coord
  would prevent this class of bug.
