# Session: Update year-by-year Regional tiles to match NCAA tiles

- **Status:** wrapped
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

## Scope refinement during session

The initial interpretation imagined a broader alignment (range extension,
legend, colour adjustments, "advanced" indicator, etc.). David narrowed
the scope before any code was written: the only change wanted was
**amber treatment + a badge for teams that finished 1st at a Regional**.
Everything else about the Regional grid stays as-is. Kept here because
the open-questions list in the setup doc reads like a much bigger task
than what actually shipped.

## Actions

1. **Medal badge + amber tile for Regional winners.** Added `win?: boolean`
   to the component's `YearResult` interface, derived in
   `teams/[gender]/[slug]/page.tsx` as
   `position === "1" || position === "T1"` (handles solo and tied
   winners). When `win` is true the tile switches to the NCAA-champion
   amber palette (`border-amber-400/40`, `bg-amber-400/[0.06]`,
   `text-amber-300`) and a lucide `Medal` icon renders to the right of
   the year — mirroring the Trophy placement on the NCAA tile. No
   other Regional states touched. Commit `e20dd83`.

Icon pick: `Medal` chosen over `Award` as the Regional analogue of the
NCAA `Trophy`. Semantic fit reads cleanly ("regional medalist → NCAA
champion") and visual distinction is obvious at a glance while staying
in the same accolade family.

Preview deploy: `https://collegegolfdata-3ga7wzw52-mikkelgolfs-projects.vercel.app`

## Diff stats

Vs. `bf186ae` (the PR #3 merge commit that marked the start of this
session on `ron/david-test`):

```
docs/sessions/2026-04-21-regional-tiles-match-ncaa.md | 80 ++++++++++++++++++
src/app/teams/[gender]/[slug]/page.tsx                |  5 +-
src/components/team-page/regional-timeline.tsx        | 45 ++++++++----
3 files changed, 114 insertions(+), 16 deletions(-)
```

Two commits on `ron/david-test` from this session (session-doc start +
feature commit). No sub-branch, no PR — `!here` / direct-to-branch flow.

## Follow-ups (not shipped, not blocking)

- **Range extension for Regionals.** The NCAA grid was extended to the
  full championship history (1939 men / 1982 women) in the previous
  session. Regionals still clip to each team's own appearance window.
  A future task could extend Regionals to the first regional year per
  gender (men's 1989-ish, women's 1993-ish — unverified) for
  structural parity with NCAA. Out of scope this session.
- **Legend for Regional grid.** NCAA has a legend beneath the grid;
  Regionals does not. Could add one if the amber/emerald/rose/neutral
  palette needs explanation. David didn't request one.
- **Colour differentiation for ties.** Today `"T1"` gets identical
  treatment to `"1"` — tile, icon, and position string. If a future
  design wants to distinguish "won outright" from "tied for first"
  (e.g. lighter amber, or an "=" prefix), the `win` boolean could
  split into a richer shape. Not needed today.
