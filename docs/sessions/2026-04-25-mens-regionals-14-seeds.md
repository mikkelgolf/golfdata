# Update to handling the 14 seeds in the men's Regionals

**Started:** 2026-04-25T11:38:28Z
**Wrapped:** 2026-04-25T11:55:00Z
**Requester:** David Tenneson
**Branch:** ron/mens-regionals-14-seeds
**Base:** dev
**Status:** merged-to-dev

## Task
update to handling the 14 seeds in the men's Regionals

## Scope clarifications (from David in-thread)
- Applies to **Committee mode only**. Strict mode is untouched.
- Each 14-seed picks its **closest of the 6 sites**, but **no two 14-seeds
  can land at the same site** (option A from the disambiguation question).
  That preserves the standard 14+14+14+13+13+13 team counts; only *which*
  3 sites get the extra seat changes.

## Actions
- Read `src/lib/scurve.ts` to understand the existing 4-phase committee
  algorithm. The 14-seed placement was previously controlled by Phase 2
  (strength-order serpentine) plus Phase 4 within-tier geographic swaps,
  which kept the 14-seed sites pinned to strength positions 4, 5, 6.
- Added a new **Phase 4b** to `computeCommitteeScurve`:
  1. Identify all position-14 indices (`tier + 1 === 14`).
  2. Lock any host schools at position 14 to their home regional.
  3. For the rest, greedy-by-seed: each picks the closest unused site
     by haversine distance.
  4. Teams with `lat: 0, lng: 0` fall back to the lowest-id unused site
     (deterministic; no garbage-distance picks from `(0, 0)`).
- Modified Phase 4 to skip `regionalPosition === 14` (now owned by 4b).
- Updated function-level JSDoc to document the new phase split.
- Verified with a synthetic smoke test (deleted before commit): when the
  3 14-seeds are given coordinates near 3 different geographic regions,
  the algorithm correctly picks closest-unused — including site
  combinations like strengths [1, 2, 6] that would have been impossible
  under the old [4, 5, 6] constraint. Strict mode unchanged.
- `tsc --noEmit` and `eslint` both clean.

## Diff stats
```
docs/sessions/2026-04-25-mens-regionals-14-seeds.md | 19 +++++
src/lib/scurve.ts                                   | 85 ++++++++++++++++++-
2 files changed, 102 insertions(+), 2 deletions(-)
```

## Open questions / learnings
- **Data gap (follow-up needed):** the 3 actual position-14 teams in
  `rankings-men.ts` right now (Fairfield, Florida A&M, New Haven) all
  have `lat: 0, lng: 0`. They hit the deterministic fallback path and
  produce the same visible regional assignment as the old logic
  (lowest-id unused site, in seed order). The new closest-site behavior
  won't be observable on the page until these teams get real
  coordinates. David is opening a follow-up branch to investigate
  team-location data problems.
- Women's field is 72 teams (12 × 6), so `regionalPosition === 14`
  never triggers for women — Phase 4b safely no-ops there. The change
  is gender-implicit rather than gender-gated.
- Phase 4b runs *after* Phase 4 finishes, so it overrides any Phase 4
  swap that involved a 14-seed. Cleanest approach was to also early-out
  Phase 4 on position 14 to avoid wasted work + to make the order of
  operations explicit in the code.
- The smoke test was deleted before commit since it served its purpose
  and ad-hoc scripts in the repo become cruft. The verification is
  reproducible from the git history if needed.
