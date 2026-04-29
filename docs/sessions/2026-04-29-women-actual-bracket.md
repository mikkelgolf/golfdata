# Women's Actual Bracket 2026

**Started:** 2026-04-29T19:50Z
**Requester:** David Tenneson
**Branch:** ron/women-actual-bracket
**Base:** dev
**Status:** in-progress

## Task
Ingest the NCAA selection committee's official 2026 women's regional field (announced April 29, 2026) and populate `src/data/regionals-actual-women-2026.ts` so the "Actual" tab on the Regional Predictions page lights up for the women's side.

David is providing the data via Discord paste with columns: Regional Site Name, Regional Site Number, Regional Seed, Team, Overall Seed.

## Validation plan
- Resolve every `Team` to canonical name in `src/data/all-teams-women-2026.ts`
- Each `regionalId` 1..6 has exactly 12 teams
- `Overall Seed` values 1..72 unique
- `Regional Site Name` matches `regionals-women-2026.ts`
- Optional cross-check: bracket follows standard S-curve assignment (1-12-13-24-25-36..., 2-11-14-23-26-35..., etc.)

## Actions
_(filled on !wrap)_

## Diff stats
_(filled on !wrap)_

## Open questions / learnings
_(filled on !wrap)_
