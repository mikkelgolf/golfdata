# Session: Regional History — follow-ups on ron/regional-history

- **Status:** wrapped
- **Date:** 2026-04-21
- **Branch:** `ron/regional-history`
- **Base:** `dev` (fork point `ac575bd` — "Redesign Regionals History")
- **PR:** [#4](https://github.com/mikkelgolf/golfdata/pull/4) → `ron/david-test`

Session doc created after the fact on `ron/regional-history`. The
branch already contained 5 feature commits (rich regional dataset,
seed tooltip enrichment, team-page Regional section, head-to-head
Regional card, /regionals-leaderboard page). This doc starts tracking
follow-up tasks against that branch.

## Task

"correct location coordinates for CSU Northridg[e]"

- **Requester:** David Tenneson (collegegolfbook on Discord)
- **Started:** 2026-04-21T (in-progress)

### Interpretation / investigation

CSU Northridge currently resolves to `lat: 45.997454, lng: -60.4457621`
in both `src/data/all-teams-men-2026.ts` (rank 216) and
`src/data/all-teams-women-2026.ts` (rank 120). Those coordinates are
in Cape Breton Island, Nova Scotia — not Los Angeles.

Root cause: `scripts/cache/city-centroids.json` has
`"Northridge|CA"` mapped to the same wrong pair. Upstream,
`scripts/build-all-teams.mjs` resolves CSU Northridge via Tier 2
(Supabase school → `(city, state)` centroid) because there is no
`CAMPUS_COORDS` or `BOARDNAME_ALIASES` hit for "CSU Northridge". The
Photon/OSM geocoder hit "Northridge, Nova Scotia" instead of the
Northridge neighborhood of Los Angeles.

`rankings-men.ts` and `rankings-women.ts` have `lat: 0, lng: 0` for
CSU Northridge — no pollution there.

Only one Supabase school exists in `(Northridge, CA)`:
`California State University-Northridge` (unitid 110608). So fixing
the city centroid affects only CSUN, but a campus-precise entry in
`CAMPUS_COORDS` is the cleaner, consistent-with-peers fix (that's
how Fresno State, San Diego State, UNLV, etc. are handled).

### Plan

1. Add `"CSU Northridge": { lat: 34.2381, lng: -118.5290 }` to
   `CAMPUS_COORDS` in `scripts/build-all-teams.mjs` (Tier 1, wins
   over the buggy centroid).
2. Fix the stale cache entry in `scripts/cache/city-centroids.json`
   so future rebuilds don't regress anything else that might later
   live in Northridge, CA.
3. Update the two emitted data files (`all-teams-men-2026.ts`,
   `all-teams-women-2026.ts`) directly so the site reflects the fix
   without requiring a Clippd re-ingest.
4. Add a `teamKnownCoords` guard for CSU Northridge in
   `scripts/verify-team-coords.ts` so future drift is caught.

Campus target: 34.2381°N, -118.5290°W — CSUN main campus
(18111 Nordhoff St, Northridge, CA 91330).

### Actions

1. **Campus-precise Tier 1 entry** (`c85c68c`). Added
   `"CSU Northridge": { lat: 34.2381, lng: -118.5290 }` to
   `CAMPUS_COORDS` in `scripts/build-all-teams.mjs`. This is Tier 1
   in `resolveCoords`, so it wins over the buggy Tier 2 city centroid
   forever — even if the centroid cache is ever regenerated badly.

2. **Cache repair** (`c85c68c`). Replaced the stale Nova Scotia pair
   in `scripts/cache/city-centroids.json` (`Northridge|CA`) with the
   LA-neighborhood centroid (`34.2286, -118.5353`). Only CSU
   Northridge lives in Northridge, CA in the Supabase directory
   (verified via `supabase-schools.json`), so this doesn't ripple.

3. **Emitted-data overwrite** (`c85c68c`). Directly corrected the
   coords in `src/data/all-teams-men-2026.ts` (rank 216) and
   `src/data/all-teams-women-2026.ts` (rank 120) so the site picks up
   the fix without requiring a Clippd re-ingest.

4. **Verification guard** (`c85c68c`). Added `"CSU Northridge"` to
   `teamKnownCoords` in `scripts/verify-team-coords.ts`. Verifier
   run: `ok: CSU Northridge at 34.2381,-118.529`. `tsc --noEmit`
   also clean.

## Diff stats

Session-only (vs. `aeefdeb` — previous tip of `ron/regional-history`):

```
scripts/build-all-teams.mjs       | 1 +
scripts/cache/city-centroids.json | 4 ++--
scripts/verify-team-coords.ts     | 1 +
src/data/all-teams-men-2026.ts    | 2 +-
src/data/all-teams-women-2026.ts  | 2 +-
5 files changed, 6 insertions(+), 4 deletions(-)
```

One feature commit (`c85c68c`) + one session-doc commit.

## Open questions / follow-ups

- **Broader geocoder audit.** Same Photon/OSM collision pattern could
  bite any other `City|ST` where the place name exists elsewhere (e.g.
  ambiguous town names in Canada/UK). The `verify-team-coords.ts`
  dupe-warning list is useful but only catches teams that share
  coords — a "team far from its Supabase state" sanity check could
  catch these drifted geocodes proactively. Non-blocking.
- **Merge path to main.** This lands on `ron/david-test` via PR #4.
  A later merge of `ron/david-test` into `dev`/`main` (Mikkel-only
  action) pushes the correction to the live site.
