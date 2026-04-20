# Session: Identify match play level in team NCAA year-by-year

- **Status:** active
- **Date:** 2026-04-20
- **Requester:** David Tenneson (collegegolfbook on Discord)
- **Branch:** `ron/match-play-level`
- **Base:** `ron/david-test` (rebased from `origin/dev` — see note below)

## Rebase note

Session was originally created off `origin/dev`. After confirming the task required editing files that only exist on `ron/david-test` (redesigned team pages and `championships-history.ts`), David chose to rebase this session onto `ron/david-test`. Executed via:

1. Delete the origin `ron/match-play-level` branch (was single-commit session doc only, no PR, nobody else touched it).
2. Reset local pointer to `ron/david-test`.
3. Cherry-pick the session-doc commit on top.
4. Fresh push.

Future PR base should be `ron/david-test` (or `dev` once that branch merges).

## Task

"Identify match play level in team NCAA year-by-year."

Interpretation: on a team's detail page, the NCAA year-by-year history should distinguish how far the team advanced in match play (quarterfinal, semifinal, final, champion) rather than flattening every match-play qualifier into a single "advanced" state.

## Likely-relevant files

- `src/components/team-page/national-timeline.tsx` — NCAA year-by-year UI (currently only on `ron/david-test`, not on `dev`)
- `src/data/championships-history.ts` — NCAA championship history data, including team finish position (currently only on `ron/david-test`, not on `dev`)
- `src/data/championships-history.json` — underlying JSON
- `scripts/build-championships-history.ts` — data ingest script (may need a schema change if match-play level isn't captured today)

## Overlap with `ron/david-test`

The team NCAA year-by-year view and its data do not exist yet on `dev`. They live on `ron/david-test` (commit `77a71eb` "Redesign team pages + fix 2020 COVID streak handling"). Adding match-play level on a branch off `dev` will conflict with the redesign when it lands.

Two reasonable paths:
1. **Wait for redesign to merge, then branch off updated `dev`.** Clean diff; no rebase pain.
2. **Branch off `ron/david-test` instead of `dev`** to build directly on the new view. Faster but couples this work to the redesign shipping first.

Needs a call from Mikkel / David before code is written.

## Actions

_Filled at !wrap._

## Diff stats

_Filled at !wrap._

## Open questions

- What's the data source for the "match play level" a team reached in a given NCAA? Is it already in `championships-history.json`, or does the ingest need augmenting?
- Display: badges (QF / SF / Final / Champion), icons, or inline text?
- Scope: men's + women's, or one first? Both championships have had match play formats — men's since 2009, women's since 2015.
- Branch base: `dev` (wait for redesign) or `ron/david-test` (build on top)?
