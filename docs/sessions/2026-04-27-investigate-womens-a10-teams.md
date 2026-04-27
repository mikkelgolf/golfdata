# Investigate discrepancy with number of women's A10 teams

**Started:** 2026-04-27T04:52:23Z
**Requester:** David Tenneson
**Branch:** ron/investigate-womens-a10-teams
**Base:** dev
**Status:** wrapped — merged to dev
**Wrapped:** 2026-04-27T05:05:00Z

## Task
investigate discrepancy with number of women's A10 teams

## Actions
- Investigated the A10 women's championships page showing only 3 teams
  (Richmond, Loyola-Chicago, LaSalle) when the Clippd scoreboard listed
  more entries.
- Traced the data path: championships UI reads `src/data/all-teams-women-2026.ts`,
  which is regenerated daily by `scripts/build-all-teams.mjs` from
  `data/clippd/rankings-*.json`. A separate pipeline (`scripts/scrape-clippd-teams.ts`)
  produces `src/data/rankings-women.ts` from the same Clippd JSON.
- Found the upstream errors in the Clippd source data:
  - women's Dayton: `conference: "Metro Atlantic Athletic Conference"` (should be A10)
  - women's Duquesne: `conference: ""` (should be A10)
  - women's Saint Josephs: `conference: ""` (should be A10)
  - women's Dayton lat/lng was Akron, OH (41.15, -81.36) — and the men's
    Dayton row had the same wrong coords because the override map is
    name-keyed not gender-keyed.
- Build script silently dropped the two empty-conference teams; Dayton
  ended up under MAAC.
- Designed a durable fix: a `CONFERENCE_OVERRIDES` map keyed by
  `${gender}:${boardName}` in BOTH scripts so the daily refresh produces
  the corrected values without manual intervention.
- Applied the fix:
  - `scripts/scrape-clippd-teams.ts`: added `CONFERENCE_OVERRIDES` const,
    threaded it through `generateTsFile`, added Dayton/Duquesne/Saint Josephs
    coords to `SCHOOL_COORDS`.
  - `scripts/build-all-teams.mjs`: added matching `CONFERENCE_OVERRIDES`
    const, threaded it through `buildTeams`, added Dayton/Duquesne/Saint Josephs
    coords to `MANUAL_OVERRIDES`.
  - `src/data/rankings-women.ts`: hand-patched Dayton/Duquesne/Saint Josephs
    rows so the fix is live before the next daily refresh.
  - Re-ran `node scripts/build-all-teams.mjs` → `all-teams-women-2026.ts`
    now contains 286 teams (was 284) with the correct A10 lineup.
- Verified `npx tsx scripts/verify-team-coords.ts` passes and
  `npx tsc --noEmit` is clean.
- Merged into `dev` with `--no-ff`.

## Diff stats
- Branch vs dev (pre-merge): 7 files changed, 83 insertions(+), 382 deletions(-)
- Commits: 2 (session start + the fix)
- Touched: `scripts/build-all-teams.mjs`, `scripts/scrape-clippd-teams.ts`,
  `scripts/cache/match-diagnostics.json`, `src/data/rankings-women.ts`,
  `src/data/all-teams-men-2026.ts`, `src/data/all-teams-women-2026.ts`,
  this session doc.

## Open questions / learnings
- Two parallel pipelines (`scrape-clippd-teams.ts` and `build-all-teams.mjs`)
  each maintain their own copy of the conference-name map, the school-coord
  map, and now a conference-override map. They drift if you forget to update
  both. A future refactor could extract these into a shared module — though
  the existing duplication is a deliberate pattern (one is .ts, one is .mjs)
  and the friction is small as long as new entries are added in pairs.
- The build script's silent-drop behaviour for unmappable conferences hides
  upstream Clippd errors. Worth considering: surface the dropped count as a
  Discord alert from `daily-refresh.sh` so this doesn't bite again.
- The Dayton/Akron coord swap stayed undetected because both cities are in
  Ohio — the verify-team-coords.ts state-boundary heuristic wouldn't catch
  it. Could add a "city centroid drift > X km" check, but it'd be noisy.
- If Clippd later corrects any of these three conference assignments, the
  override will silently match (still produces the same value). Worth a
  cleanup pass once a season to prune stale overrides.
