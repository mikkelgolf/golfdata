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

## Actions
_(filled on !wrap)_

## Diff stats
_(filled on !wrap)_

## Open questions / learnings
_(filled on !wrap)_
