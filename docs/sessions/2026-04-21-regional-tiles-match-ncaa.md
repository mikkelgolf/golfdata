# Session: Update year-by-year Regional tiles to match NCAA tiles

- **Status:** active
- **Date:** 2026-04-21
- **Requester:** David Tenneson (collegegolfbook on Discord)
- **Branch:** `ron/david-test`
- **Mode:** direct (no sub-branch, no PR — `!here` flow)

## Task

"Update year-by-year Regional tiles to match NCAA tiles."

## Interpretation to confirm

The NCAA tiles were overhauled in the match-play-level session (merged
via PR #3). They now:

1. Put the year on the left with the status indicator on the **right**
   (Trophy for champions, **R / SF / QF** badges for match-play
   finishers).
2. Use a specific colour palette: amber for wins, amber for runner-up
   (R), sky-blue for SF, emerald for QF / match-play qualifier.
3. Span the **full history** of the championship for that gender
   (men's 1939–present, women's 1982–present) regardless of the team's
   own earliest appearance.
4. Dashed border + `—` for "no appearance" years; distinct styling for
   "event not held" (e.g. 2020 COVID).

The Regional tiles today render a simpler model: each `RegionalFinish`
only carries `{ year, site, team, position, advanced: boolean }` — no
bracket rounds, no champion concept (the winner advances to NCAAs,
which is what `advanced: true` already captures).

### What "match" likely means

- **Visual parity:** same tile dimensions, same font sizing, same
  label-on-left / indicator-on-right layout, same animation.
- **Range parity:** extend back to each gender's earliest regional
  year (men's Regionals began 1989; women's began 1993 — to verify
  from the data).
- **Indicator semantics:** Regionals don't have a QF / SF / Final
  bracket, so there's nothing to map R / SF / QF onto. The natural
  analogue is a single "advanced to NCAAs" badge on the right of the
  year, replacing whatever the current indicator is.

## Likely-relevant files

- `src/components/team-page/regional-timeline.tsx` — current Regional
  year-by-year UI (to overhaul)
- `src/components/team-page/national-timeline.tsx` — reference design
- `src/app/teams/[gender]/[slug]/page.tsx` — data derivation for both
  timelines; may need adjustment to the Regionals min-year computation
  to match the range-extension change we made for NCAA
- `src/data/records-types.ts` — `RegionalFinish` interface
- `src/data/regionals-history.*` — Regionals historical data source

## Open questions

- **Indicator for "advanced":** letter badge ("A"? "→"?), an arrow
  icon, or just a colour shift on the position number? An arrow icon
  on the right might read more intuitively than a letter badge.
- **Range extension:** extend back to the first year of regionals for
  that gender, or keep the team-specific window? NCAA went full-range;
  Regionals presumably should too, for consistency.
- **Colour for non-advancing finishers:** today the NCAA tiles have
  emerald (match-play), foreground (made cut), rose (missed cut),
  text-tertiary (DNQ). Regionals have no cut concept — every team
  plays all 54 holes. Does "advanced" get emerald (parity with match-
  play advancement), and non-advancing get text-tertiary or
  foreground?
- **Legend:** should there be a per-timeline legend (as NCAA has), or
  a single combined legend above both grids?

## Actions

_Filled at !wrap._

## Diff stats

_Filled at !wrap._
