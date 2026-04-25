# Investigate team location problems

**Started:** 2026-04-25T12:12:15Z
**Requester:** David Tenneson
**Branch:** ron/investigate-team-locations
**Base:** dev
**Status:** in-progress

## Task
investigate team location problems

## Context (carried over from prior session)
While implementing closest-site placement for men's 14-seeds (see
`docs/sessions/2026-04-25-mens-regionals-14-seeds.md`), the smoke test
revealed that the 3 actual current 14-seeds in `rankings-men.ts` —
Fairfield, Florida A&M, New Haven — all have `lat: 0, lng: 0`. The new
algorithm correctly falls back to deterministic placement for them, but
they (and likely others) need real coordinates for the geographic logic
to do anything useful.

This branch is the follow-up investigation: how widespread is the
missing-coords problem, and what's the fix path?

## Investigation findings (2026-04-25)

### Scale of the problem
Running `npx tsx scripts/verify-team-coords.ts` reports **481 team-rows
with `lat:0, lng:0`** across `rankings-men.ts`, `rankings-women.ts`,
`all-teams-men-2026.ts`, and `all-teams-women-2026.ts` — roughly **240
unique D1 schools** with no usable coordinates. That includes Boise
State, Brigham Young, Cal, Hawaii, Idaho, Idaho State, Colorado State,
Cincinnati, Connecticut, Houston, Cornell, Dartmouth, etc. — not just
mid-majors.

### Root cause: TWO hardcoded coord tables that drift
There are two separate, partial coordinate maps:

1. `scripts/scrape-clippd-teams.ts` line 133: `SCHOOL_COORDS` — only
   **61 teams hardcoded**. Used when generating
   `data/clippd/rankings-{men,women}-<date>.ts`. For any team not in
   this map, `generateTsFile` writes `lat: 0, lng: 0` (line 345).
2. `scripts/build-all-teams.mjs` lines 142+: `CAMPUS_COORDS` (~90
   schools) + `BOARDNAME_ALIASES` + `MANUAL_OVERRIDES` (handful of
   edge cases) + a Supabase + Photon geocoder fallback. When that
   fallback fails (or gives a misleading result, like "Idaho" hitting
   Idaho State's Pocatello), it writes wrong-city coords or `(0, 0)`.

The four named teams — **West Georgia, Utah Tech, Idaho, SIU
Edwardsville** — are missing from **both** SCHOOL_COORDS in scrape and
CAMPUS_COORDS / MANUAL_OVERRIDES in build-all-teams. So both
auto-generation paths produce bad coords for them.

### The "revert" mechanism (this is what David asked about)
`scripts/daily-refresh.sh` (LaunchAgent `com.mikkel.collegegolfdata-daily-refresh`,
fires 02:00 Norway time) does, in this order:

```
step 2 : npx tsx scripts/scrape-clippd-teams.ts --generate
         → writes data/clippd/rankings-{men,women}-MM-DD.ts
step 2b: cp data/clippd/rankings-MEN-MM-DD.ts  src/data/rankings-men.ts
         cp data/clippd/rankings-WOMEN-MM-DD.ts src/data/rankings-women.ts
         ← THIS IS WHERE MANUAL FIXES GET WIPED
step 2c: node scripts/build-all-teams.mjs
         → regenerates src/data/all-teams-{men,women}-2026.ts from scratch
         ← AND HERE
step 6 : git commit + git push origin main + vercel --prod --yes
```

Confirmed empirically — `git log -G '"Utah Tech".*lat:' -- src/data/rankings-men.ts`:

```
2026-04-23 fix(coords): West Georgia and Utah Tech campus locations (#9)
2026-04-23 data: refresh Clippd rankings to 2026-04-23 pull   ← reverted
2026-04-24 fix(coords): re-apply West Georgia and Utah Tech (#15)
2026-04-25 daily refresh — rankings + champions               ← reverted again
```

The cycle is: human fixes coords → next 02:00 UTC run reverts them →
fix again → revert again. Two re-applies in three days for the same
two teams.

### The script *does* warn — nobody reads it
`scrape-clippd-teams.ts` lines 399-416 prints a "⚠ Missing coordinates
for X schools" warning and even says "Add these to SCHOOL_COORDS in
this script, then re-run with --generate." But it's just stdout. The
daily-refresh script doesn't fail on it. The warning gets buried in
`logs/daily-refresh-YYYY-MM-DD.log` and nobody sees it.

### `verify-team-coords.ts` exists but is too narrow
It only hardcoded-checks 3 teams (Idaho, Idaho State, CSU Northridge),
warns on `lat:0/lng:0` rather than failing, and is not wired into the
daily-refresh pipeline. So even though we have a verifier, it doesn't
block bad commits.

## Recommendations (for David's go/no-go)

Three guardrail layers, increasing in scope:

### Tier 1: Stop the bleeding (small, fast)
- **A. Add the four known teams** (West Georgia, Utah Tech, Idaho, SIU
  Edwardsville) plus any others with confirmed correct coords to
  *both* `SCHOOL_COORDS` (scrape-clippd-teams.ts) and `MANUAL_OVERRIDES`
  (build-all-teams.mjs). Mechanical fix; immediately stops the daily
  reverts for those specific teams.
- **B. Preserve-existing fallback** in `scrape-clippd-teams.ts`'s
  generator: when a team isn't in `SCHOOL_COORDS`, instead of writing
  `lat: 0, lng: 0`, look up the team's existing coords in
  `src/data/rankings-{gender}.ts`. If non-zero, carry them forward. This
  means *any* manual fix in `rankings-*.ts` survives the daily refresh,
  whether or not it's been added to the canonical map.

### Tier 2: One source of truth (medium)
- Consolidate the two hardcoded coord tables into a single shared
  module — e.g., `src/data/team-coords.ts` (or a JSON file). Both scripts
  import it. Removes the drift problem permanently.
- One-off backfill of the ~240 missing teams. Likely from a public
  NCAA D1 schools dataset or a one-off scrape; could be batched into
  a single PR.

### Tier 3: Strict verifier wired into daily-refresh (small, high-leverage)
- Strengthen `verify-team-coords.ts`: **fail** (exit 1) when any
  eligible/AQ team has `lat:0, lng:0`, or when a known-correct team's
  coords drifted. Keep the broader "all teams ideally have coords"
  check as a warn-only stat.
- Wire it into `daily-refresh.sh` between Step 4 (sanity gate) and
  Step 6 (commit). Use the existing `abort_hard` so a failure posts to
  Discord and doesn't push/deploy. Same pattern as the existing 75%
  rows-changed sanity gate.

Tier 1 alone fixes the four named teams and stops future regressions
for any already-fixed team. Tier 3 catches new regressions before they
ship to prod. Tier 2 is the long-term cleanup that makes the codebase
honest. Recommend doing **Tier 1 + Tier 3 in this branch**, and Tier 2
as a follow-up once the canonical list is built.

## Actions
_(filled on !wrap once we land the chosen tier(s))_

## Diff stats
_(filled on !wrap)_

## Open questions / learnings
- **Open:** which tier(s) does David want in this branch? Recommendation
  above is Tier 1 + Tier 3.
- **Open:** "Idaho" (University of Idaho, Moscow) currently has correct
  coords in `rankings-men.ts` (lat 0/0 — wait, no, it's currently 0/0;
  was lat 46.7269 in past commits, reverted). Need to confirm the
  expected coords for all four named teams before adding them to
  `SCHOOL_COORDS`. David has been re-applying them by hand, so he knows
  the right values — should source from the most recent fix commit.
- **Learning:** the `verify-team-coords.ts` warns-but-doesn't-fail
  pattern is a soft guardrail with no enforcement. Any check that's
  not wired into the deploy pipeline doesn't actually block bugs. The
  daily-refresh's existing sanity gate (75% row change → abort) is a
  good template — same `abort_hard` mechanism, same Discord alert.
