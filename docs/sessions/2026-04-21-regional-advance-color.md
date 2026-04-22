# Session: Correct coloring on Regional tiles for teams advancing to Nationals

- **Status:** wrapped
- **Ended:** 2026-04-21T04:12:48Z
- **Date:** 2026-04-21
- **Requester:** David Tenneson (collegegolfbook on Discord)
- **Branch:** `ron/david-test`
- **Mode:** direct (no sub-branch, no PR — `!here` flow)

## Task

"Correct coloring on the Regional tile coloring for those advancing to
Nationals."

## Current state (before any changes)

In `src/components/team-page/regional-timeline.tsx` the position number
colour is picked from this ladder (priority order):

| State     | Class                 | Hex-ish              |
|-----------|-----------------------|----------------------|
| win       | `text-amber-300`      | amber (winner)       |
| cancelled | `text-text-tertiary/60` | muted gray         |
| advanced  | `text-emerald-400`    | emerald              |
| missed    | `text-rose-400/80`    | rose / red           |
| else      | `text-foreground/80`  | neutral foreground   |

The tile box (border + bg) is only coloured for winners (amber wash) and
cancelled years (dashed border + muted bg). Advancers today have
**emerald text on a neutral tile** — i.e. the colour is only in the
position number, not the surrounding box.

For comparison, the NCAA tile (`national-timeline.tsx`) uses the same
pattern: match-play qualifiers get emerald text but a neutral box; only
champions get a coloured tile.

## Interpretation — resolved

It was option 1 (data bug). David articulated the rule cleanly:

> If a team has a tile for the NCAA year-by-year that has a value other
> than "-", then that team should have the corresponding Regional tile
> colored emerald.

Example: Auburn men had regional rows for 1993/1994/1995 with
`advanced: false` despite appearing at NCAAs those years. All three
tiles rendered neutral. Data spot-check confirmed the `advanced` flag
is unreliable in pre-modern eras — all three Auburn years (plus six
more: 2000, 2002, 2003, 2004, 2006, 2008) are wrongly flagged in the
source JSON. Rather than chase and patch the data, derive `advanced`
at render time from NCAA presence. Self-healing if the data is ever
fixed.

David then extended the scope to the metric + streak layer: the same
rule needed to apply to the "Advanced" stat card, the national active
streak, and the national longest streak. And separately: "T1" should
count as a Regional win alongside "1".

## Likely-relevant files

- `src/components/team-page/regional-timeline.tsx` — tile colour logic
- `src/app/teams/[gender]/[slug]/page.tsx` — where `advanced` is passed
  through to the component

## Actions

1. **Regional tile colouring: NCAA-appearance backstop** (`1614e38`).
   In `teams/[gender]/[slug]/page.tsx`, when building the Regional
   `timelineResults`, derive `advanced` as
   `r.advanced || ncaaByYear.has(y)` instead of trusting the regional
   row's flag alone. Relocated the NCAA history derivation above the
   regional loop so both timelines share the same `ncaaByYear` map.
   Effect: Auburn men's 1993/94/95 tiles (and six more) now render
   emerald.

2. **Advanced stat + national streaks: same backstop in the stats
   layer** (`4a2d104`). Added `effectiveAdvancedYears(team, gender)`
   helper to `lib/streaks.ts`. Routed both `computeNationalStreak` and
   `computeTeamStats` through it so the "Advanced" stat card, the
   active national streak, and the longest national streak all honor
   the same rule. Knock-on effects: `/records` "longest consecutive
   nationals" list and `/teams` overview nationals column reflect the
   corrected data too.

   Auburn men as sanity check: `totalAdvancements` 17 → 26 (nine
   pre-modern seasons flipped), national longest streak now 8 with
   active 4. 2020 still handled by `nextExpectedYear()` — streaks
   bridge the COVID gap. OK State men's 36-year regional streak still
   passes verify-streaks assertions.

3. **T1 Regional finishes count as wins** (`8b1a47b`). Introduced
   `isRegionalWin(position)` in `lib/streaks.ts` as the single source
   of truth (returns true for `"1"` or `"T1"`). Threaded through every
   regional-wins callsite in the codebase: `computeRegionalWins`,
   `computeTeamStats.regionalWins`, `percentiles.rawStatsFor`, both
   program-arc components, the regionals-results table, and the team
   detail page's inline `win` derivation. While editing
   `percentiles.ts` also applied the NCAA-appearance backstop there so
   percentile rankings for the Advanced stat reflect the corrected
   data.

   Unexpected finding during this step: the current `regionalsHistory`
   dataset has **zero** `"T1"` rows — ties are collapsed to the base
   rank by the upstream ingest, verified across all 4662 entries. So
   the T1 fix is a no-op on displayed numbers today but is ready if
   the upstream ever preserves tie markers. Committed anyway for
   consistency with the tile-coloring rule that already includes T1.

Preview deploys during session (latest is final):
- `https://collegegolfdata-glv2c6s8c-mikkelgolfs-projects.vercel.app` — after step 1
- `https://collegegolfdata-nqig0qy2q-mikkelgolfs-projects.vercel.app` — after step 2
- `https://collegegolfdata-3u4oezdwf-mikkelgolfs-projects.vercel.app` — after step 3

## Diff stats

Vs. `915c044` (previous session's wrap commit — the start point for
this `!here` session on `ron/david-test`):

```
docs/sessions/2026-04-21-regional-advance-color.md | 65 ++++++++++++++
src/app/teams/[gender]/[slug]/page.tsx             | 27 +++++----
src/components/regionals-results-table.tsx         |  3 +-
src/components/team-page/interactive-program-arc.tsx |  3 +-
src/components/team-page/program-arc.tsx           |  3 +-
src/lib/percentiles.ts                             | 27 +++++----
src/lib/streaks.ts                                 | 46 ++++++++++---
7 files changed, 143 insertions(+), 31 deletions(-)
```

Four feature commits on `ron/david-test` from this session
(`1139d60` doc start → `1614e38` tile fix → `4a2d104` streaks fix →
`8b1a47b` T1 helper). No sub-branch. No PR — `!here` / direct-to-branch
flow.

## Open questions / follow-ups

Nothing blocking. Non-blocking items flagged during the session:

- **`regionalsHistory` loses tie information at ingest.** Today every
  tied finish collapses to the base rank (no `"T1"`/`"T3"` etc.).
  Worth a separate data-pipeline session to preserve tie markers —
  would unlock true T1 highlighting and a correct `bestFinish` for
  teams whose only best result was a tie.
- **`bestFinish` ignores tied finishes.** Related to the above:
  `parseInt("T1", 10)` returns NaN so tied positions never enter the
  `positions` array for `bestFinish` computation in both `streaks.ts`
  and `percentiles.ts`. Harmless today (no T-prefixed positions
  exist), would bite the moment ties are preserved.
- **Pre-Regional-era NCAA appearances are not counted as "advanced".**
  Intentional: the `effectiveAdvancedYears` helper requires a Regional
  row to exist for the year, so pre-1989 (men) / pre-1993 (women)
  NCAA appearances aren't retroactively counted. Flag only if someone
  later wants a broader "NCAA appearances before Regionals existed"
  metric.
