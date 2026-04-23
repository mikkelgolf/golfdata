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
