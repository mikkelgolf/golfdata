# Investigate team location problems

**Started:** 2026-04-25T12:12:15Z
**Requester:** David Tenneson
**Branch:** ron/investigate-team-locations
**Base:** dev
**Status:** wrapped

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

## Actions (landed 2026-04-25)

David picked Tier 1 + Tier 3 plus a broader backfill of the ~150
eligible/AQ teams sitting at 0,0 (he asked for "all locations… including
the 14-seeds" to have coords). Final scope:

### Tier 1 — canonical map
- Added 19 hand-verified teams (West Georgia, Utah Tech, Idaho, SIU
  Edwardsville, Georgetown, Merrimack, Monmouth, Rider, Saint Francis,
  Richmond, North Florida, Queens-Charlotte, Manhattan, UAlbany, Montana,
  UIC, Florida A&M, Fairfield, New Haven) to **both**
  `SCHOOL_COORDS` in `scripts/scrape-clippd-teams.ts` and
  `MANUAL_OVERRIDES` in `scripts/build-all-teams.mjs`. Coords sourced from
  prior fix commits (edca021, bceadd0, 4791fae) + Photon results already
  in `all-teams-*.ts`.
- **Hoisted `MANUAL_OVERRIDES` to Tier 0 of the build-all-teams resolver.**
  It was previously the LAST fallback (Tier 3), so a wrong-but-found
  Supabase city centroid (e.g. Monmouth IL beating Monmouth University NJ)
  silently overrode the manual entry. This was *the same revert bug at a
  different layer* — adding a team to MANUAL_OVERRIDES wasn't enough on
  its own. Now manual overrides win above geocoder + Supabase.

### Preserve-existing fallback (the "B" item from recommendations)
- `scripts/scrape-clippd-teams.ts` now reads existing non-zero coords
  from BOTH `src/data/rankings-{gender}.ts` AND
  `src/data/all-teams-{gender}-2026.ts` and uses them as 2nd/3rd
  priority lookups after `SCHOOL_COORDS`. This means any future hand-fix
  in either data file automatically survives the daily refresh — no
  more "fix it, watch it revert overnight" cycle.

### Tier 3 — verifier as deploy blocker
- Rewrote `scripts/verify-team-coords.ts` with 4 layers:
  - Layer 1: `KNOWN_GOOD` regression guard (21 teams, 0.5° tolerance).
  - Layer 2: any eligible/AQ team at lat:0/lng:0 → **FAIL** (deploy block).
  - Layer 3: ineligible teams at 0/0 → warn only.
  - Layer 4: duplicate coords across teams → warn only.
- Wired into `scripts/daily-refresh.sh` as Step 4b, between the 75%
  sanity gate and the champions auto-apply. Uses `abort_hard` so a
  failure posts a Discord alert and skips git/vercel.

### Backfill of all eligible/AQ teams
- A one-off pass copied non-zero coords from `all-teams-*-2026.ts`
  into the corresponding rankings-*.ts rows. 447 rankings rows
  backfilled (236 men, 211 women). After the backfill the verifier
  reports 0 eligible/AQ teams at 0,0 (was 151).
- The 14-seed teams David flagged (Fairfield, Florida A&M, New Haven)
  all now carry real coords end-to-end.

### Verification
- `npx tsc --noEmit` clean.
- `npm run lint` clean.
- `npx tsx scripts/verify-team-coords.ts` → PASS.
- `bash scripts/daily-refresh.sh --dry-run` → completes; verifier passes
  on the freshly-rebuilt files (proves MANUAL_OVERRIDES hoist works
  end-to-end through the daily pipeline).

## Diff stats
8 files changed:
- `scripts/build-all-teams.mjs` — MANUAL_OVERRIDES list + hoist to Tier 0
- `scripts/daily-refresh.sh` — Step 4b verifier
- `scripts/scrape-clippd-teams.ts` — SCHOOL_COORDS + 2nd/3rd fallbacks
- `scripts/verify-team-coords.ts` — full rewrite, 4-layer validation
- `src/data/{rankings-men,rankings-women,all-teams-men-2026,all-teams-women-2026}.ts`
  — 510 coord lines updated (255 rows × 2 sides of diff). No rank/AQ
  changes; only `lat: 0, lng: 0` → real coords (and the 19 canonical
  patches over previously-wrong coords).

## Open questions / learnings
- **Tier-2 follow-up:** 2 ineligible-team rows still at 0,0 (Duquesne W,
  Saint Joseph's W). Warn-only; doesn't block deploy. Tracked.
- **20 duplicate-coord pairs** are upstream Supabase/Photon collisions
  (UTEP=Texas El Paso, UC San Diego=San Diego, Eastern Michigan=Central
  Michigan, etc.). Not introduced by this branch; some are correct
  (same city), some are wrong (Eastern≠Central Michigan in Mt
  Pleasant). Out of scope here — file as separate cleanup.
- **Learning:** "MANUAL_OVERRIDES" being the last fallback was deeply
  surprising — the name implies "override," but the code treated it as
  "use only if nothing else found." Two different mental models for the
  same map. Hoisted; comment now explicit.
- **Learning:** the daily-refresh `cp staged → src/data` pattern is
  THE revert mechanism. Without the preserve-existing fallback the
  scrape always wrote 0,0 for non-hardcoded teams, so any prior fix
  was wiped. That's no longer possible: existing coords in either
  data file act as a soft-canonical source.
