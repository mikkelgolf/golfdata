# verify team coords

**Started:** 2026-04-24T00:00:00Z
**Wrapped:** 2026-04-24T00:00:00Z
**Requester:** David Tenneson
**Branch:** ron/verify-team-coords
**Base:** dev
**Status:** merged-to-dev

## Task
Systematically verify every team's coordinates across the four data files
(`all-teams-men-2026.ts`, `all-teams-women-2026.ts`, `rankings-men.ts`,
`rankings-women.ts`). Produce a table of mismatches for David to review
**before** any changes are written, then apply approved fixes.

## Actions
1. Wrote `scripts/audit-team-coords.ts` — maps each team → school record
   in `supabase-schools.json` → state code, then flags any coord outside
   the school's state bounding box (US state bboxes hardcoded).
2. First pass used `city-centroids.json` but that file is polluted (e.g.
   `Saint George|UT` → 56.6,-169.5 Bering Sea). Switched to state-bbox
   sanity check instead.
3. Found 11 "confirmed bugs" via the automated check; manually verified
   each — 5 were real (Georgetown, Merrimack, Monmouth, Rider, Saint
   Francis) and 6 were false positives where `supabase-schools.json`
   itself has wrong city/state (Stanford listed as Powell WY; WVU as
   Kenosha WI; SIUE as Anderson IN; Southern Illinois as Muncie IN;
   West Georgia as Honolulu HI; St. Thomas MN as Houston TX).
4. Eyeball-checked the 76 "unmatched" team names (those whose short name
   didn't alias to a supabase record). Found 7 more real bugs: Richmond,
   North Florida, Queens-Charlotte, Manhattan, UAlbany, Montana, UIC.
5. Reported the combined 12-team table to David for approval.
6. On green-light: applied 40 line replacements across the four files
   via `python3` + `re.sub` (9 each in men files, 11 each in women files
   — some teams men-only, some women-only).
7. Re-ran audit — only the 6 known false positives remain.
8. Committed fixes (`edca021`), merged to dev (`--no-ff`), deployed
   preview.

## Diff stats
```
 docs/sessions/2026-04-24-verify-team-coords.md | (this file)
 scripts/audit-team-coords.ts                   | 611 +++++ (new)
 src/data/all-teams-men-2026.ts                 |  18 +-
 src/data/all-teams-women-2026.ts               |  22 +-
 src/data/rankings-men.ts                       |  18 +-
 src/data/rankings-women.ts                     |  22 +-
```

## Open questions / learnings
- **Root cause.** The same botched geocoder run produced both the team
  coord data AND the supabase-schools.json city/state records. That's
  why neither file can be used as the trusted source for the other. A
  future fix should geocode from a new, trusted source (NCES / IPEDS
  locations, or OSM Nominatim with proper school_name queries) and
  rebuild both.
- **State-bbox check is cheap and effective.** The audit script is
  ~600 lines but only half is the alias table. A smaller, incremental
  version could live in CI as a pre-commit guard.
- **Ambiguous short names are the #1 bug source.** Georgetown (KY vs
  DC), Monmouth (IL vs NJ), Saint Francis (IN vs PA), Montana (Missoula
  vs Bozeman — often swapped with Montana State) all bit us. Worth
  adding each of these to the `teamKnownCoords` table in
  `scripts/verify-team-coords.ts` so regressions break CI.
- **False positives in supabase.** Stanford / WVU / SIUE / Southern
  Illinois / West Georgia / St. Thomas MN are all wrong in
  `supabase-schools.json` (not in our data). If the schools file is ever
  used by other scripts, those will propagate errors — worth filing.
