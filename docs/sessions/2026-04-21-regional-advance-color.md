# Session: Correct coloring on Regional tiles for teams advancing to Nationals

- **Status:** active
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

## Interpretation

"Correct coloring" is ambiguous — could mean any of:

1. **Data bug:** some teams that advanced aren't being flagged as
   `advanced` in the data. Unlikely given the existing ladder works,
   but worth spot-checking a few teams.
2. **Wrong colour:** emerald isn't the right hue for Regional advancement
   (maybe too close to NCAA match-play meaning?). Want a different colour.
3. **Weak treatment:** emerald text alone isn't enough visual weight.
   Want the tile itself (border + bg) to get an emerald tint — a softer
   parallel to the winner's amber wash.
4. **Inconsistent priority:** something in the current ladder overrides
   emerald in a case it shouldn't.

Waiting on David to say which of the above (or something else) he meant.

## Likely-relevant files

- `src/components/team-page/regional-timeline.tsx` — tile colour logic
- `src/app/teams/[gender]/[slug]/page.tsx` — where `advanced` is passed
  through to the component

## Actions

_Filled at !wrap._

## Diff stats

_Filled at !wrap._
