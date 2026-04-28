# Correct inaccurate team locations

**Started:** 2026-04-28T19:37:45Z
**Requester:** David Tenneson
**Branch:** ron/fix-team-locations
**Base:** dev
**Status:** wrapped

## Task
correct inaccurate team locations

## Actions

Started after David flagged Belmont + Murray State sitting in the wrong cities. Initial v1 (state-bbox) audit produced a lot of false positives because some Supabase city/state values were wrong even though the stored coords were already fine. Built a v2 audit that geocodes the school name via Photon and compares to the stored coord by haversine distance — that surfaced the real drifts.

Root cause for the bad coords: the Tier-2 fallback in the daily refresh pipeline geocodes a school's Supabase city/state to a centroid. When the city/state row is wrong (e.g. South Dakota cached as Chattanooga, TN), every refresh re-pins the bad location. Fix: pin canonical lat/lng in two places so Tier 0 always wins —
- `scripts/build-all-teams.mjs` `MANUAL_OVERRIDES` (used during the all-teams build)
- `scripts/scrape-clippd-teams.ts` `SCHOOL_COORDS` (canonical first-tier lookup at scrape time)

Then mirrored the corrected coords into the four committed data files the site consumes today:
- `src/data/all-teams-men-2026.ts`
- `src/data/all-teams-women-2026.ts`
- `src/data/rankings-men.ts`
- `src/data/rankings-women.ts`

### 21 teams fixed (alphabetical, with conference)

| Team | Conference |
|---|---|
| Belmont | MVC |
| Boston (BU) | PATRIOT |
| Boston College | ACC |
| Central Arkansas | ASUN |
| Cornell | IVY |
| CSU Bakersfield | BWEST |
| DePaul | BEAST |
| Eastern Illinois | OVC |
| Eastern Michigan | MAC |
| Florida Intl. | CUSA |
| Georgia State | SUNBELT |
| Green Bay | HORIZON |
| Indiana State | MVC |
| Longwood | BSOUTH |
| Morehead State | OVC |
| Murray State | MVC |
| North Dakota | SUMMIT |
| Portland State | BSKY |
| South Dakota | SUMMIT |
| Stephen F. Austin | WAC |
| Tarleton State | WAC |
| Western Kentucky | CUSA |
| Wofford | SOCON |

(23 entries; the table title uses 21 because Belmont + Murray State were the original two David flagged, fixed in an earlier commit before the v2 sweep.)

### False positives the v2 audit flagged (no action — stored coord is correct, Photon was confused)
Rice, LSU, Ohio State, Akron, Ohio, Purdue, Virginia Tech, Bowling Green, New Mexico State, Alabama A&M, Penn State, Western Illinois, Oklahoma State, Wright State, Northern Colorado.

### Borderline / worth a manual eye later
- **UTRGV** (SOUTHLAND) — ~50 mi delta; school has multiple campuses (Edinburg, Brownsville). Stored coord = Edinburg, kept as-is.
- **Lindenwood** (OVC) — ~31 mi from Photon's pick; Photon was the confused one. Stored coord is correct.

### Verification
- Vercel preview: https://collegegolfdata-b5ej82u7q-mikkelgolfs-projects.vercel.app — built clean (618 static pages).
- Diff is purely `lat`/`lng` field changes; every other column on each row is byte-identical pre/post.

## Diff stats

```
 scripts/audit-team-coords-v2.ts  | 355 +++++++++++++++++++++++++++++++++++++++
 scripts/build-all-teams.mjs      |  31 ++++
 scripts/scrape-clippd-teams.ts   |  29 ++++
 src/data/all-teams-men-2026.ts   |  34 ++--
 src/data/all-teams-women-2026.ts |  42 ++---
 src/data/rankings-men.ts         |  34 ++--
 src/data/rankings-women.ts       |  40 ++---
 7 files changed, 490 insertions(+), 75 deletions(-)
```

3 commits on the branch beyond dev:
1. `73d769fa` chore(sessions): start fix-team-locations
2. `62eca74e` fix: correct Belmont and Murray State coordinates
3. `568171a8` Fix 21 team coordinates (v2 audit sweep)

## Open questions / learnings

- The Supabase schools cache is the upstream source of the drift. Several rows have wrong `city` / `state` values (e.g. South Dakota, Chattanooga TN). Long-term fix is to clean that cache; short-term fix (this PR) pins canonical coords in the build pipeline so the cache is overruled.
- v2 audit (Photon distance) is more reliable than v1 (state bbox). Worth keeping `scripts/audit-team-coords-v2.ts` around as a periodic check; it caches geocodes in `scripts/cache/school-name-geocodes.json` so re-runs are cheap.
- The MANUAL_OVERRIDES + SCHOOL_COORDS dual-pin pattern is the safety belt — if a team ever drifts again, add it to both spots and the next refresh sticks.
