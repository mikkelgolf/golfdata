# Regionals History year-by-year needs a slight fix

**Started:** 2026-04-23T19:22:07Z
**Requester:** David Tenneson
**Branch:** ron/regionals-history-fix
**Base:** dev
**Status:** wrapped

## Task
Regionals History year-by-year needs a slight fix

David's observation: on the Regionals History page, the expanded
per-team grid wasn't showing the committee seed in years a team
appeared but didn't advance. The team-page "Year-by-year regionals"
grid does show the seed in those years, so the two should read
identically.

## Actions
- Root-caused the divergence: two grids define `missed` differently.
  - `team-page/regional-timeline.tsx`: `missed` = didn't make
    regionals at all → seed displays for all appearing teams.
  - `regionals-results-table.tsx`: local `missed = !cell.advanced
    && !win` meant "appeared but didn't advance" and was used to
    gate `showSeed`, hiding the seed for non-advancing teams.
- Dropped the `!missed` gate on `showSeed` in
  `regionals-results-table.tsx` (the earlier `!cell` early return
  already handles true no-appearance years, so `seed != null`
  is the only remaining condition). Added a code comment spelling
  out the parity with `team-page/regional-timeline.tsx`.
- `tsc --noEmit` clean. Visual check on preview
  `collegegolfdata-cvudubi0p-mikkelgolfs-projects.vercel.app`.

## Diff stats
`git diff --stat dev...ron/regionals-history-fix`:

```
 docs/sessions/2026-04-23-regionals-history-fix.md | 19 +++++++++++++++++++
 src/components/regionals-results-table.tsx        |  7 ++++++-
 2 files changed, 25 insertions(+), 1 deletion(-)
```

Commits: `64ef0c8` (session start), `ef18abb` (seed-display fix).

## Open questions / learnings
- The word "missed" is doing double duty across the codebase — in
  one grid it means "no appearance", in the other it meant "didn't
  advance". Worth a follow-up pass to rename one of them to
  something unambiguous (e.g. `didNotAdvance`) so future edits
  don't drift again.
- Women's regionals don't yet have rich (seed) data, so the visible
  change only affects men's rows in the seeding era (~2002+). No
  regression expected on women's rows — `seed != null` is false so
  the seed line simply doesn't render, same as before.
