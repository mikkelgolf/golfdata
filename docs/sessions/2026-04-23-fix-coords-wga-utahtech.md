# Session: fix-coords-wga-utahtech

- **Date:** 2026-04-23
- **Branch:** `ron/fix-coords-wga-utahtech`
- **Requested by:** David Tenneson (Discord: collegegolfbook)

## Task

West Georgia and Utah Tech still have wrong coordinates on the site. Fix them across all team data files.

## State before

- `src/data/all-teams-women-2026.ts` and `src/data/all-teams-men-2026.ts`
  - West Georgia: `21.304547, -157.855676` (Honolulu, HI)
  - Utah Tech: `56.6022875, -169.5445274` (Bering Sea, AK)
- `src/data/rankings-women.ts` and `src/data/rankings-men.ts`
  - West Georgia: `0, 0`
  - Utah Tech: `0, 0`

## Target coordinates

- **West Georgia** (University of West Georgia, Carrollton, GA): `33.5729, -85.0978`
- **Utah Tech** (Utah Tech University, St. George, UT): `37.1041, -113.5659`

## What was done

- Updated both team rows in `src/data/all-teams-men-2026.ts` and `src/data/all-teams-women-2026.ts` (Honolulu/Bering Sea → correct campuses).
- Updated both team rows in `src/data/rankings-men.ts` and `src/data/rankings-women.ts` (0,0 → correct campuses).
- 8 locations in 4 files total.

## Verification

- Preview deploy: `https://collegegolfdata-j72xofbaj-mikkelgolfs-projects.vercel.app`
- David confirmed the map placements look correct.

## Diff stats vs `dev`

```
5 files changed, 31 insertions(+), 8 deletions(-)
```

## Open questions / learnings

- The `all-teams-*-2026.ts` and `rankings-*.ts` files are two separate sources of truth for team coordinates — any coord fix has to touch both or the bug resurfaces depending on which page you land on. Worth considering a shared `team-locations.ts` or a normalisation step in the build in a future session.
- Both teams went through a rename (West Georgia from D-II → D-I in 2024; Dixie State → Utah Tech in 2022). Worth an audit pass on other recently-renamed schools to see if their coords were set from stale records.
