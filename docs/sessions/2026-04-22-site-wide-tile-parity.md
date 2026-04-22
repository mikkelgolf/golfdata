# Session: Site-wide Regionals + NCAA tile parity with team pages

- **Status:** wrapped
- **Date:** 2026-04-22
- **Branch:** `ron/david-test` (!here flow)
- **Base:** `dev` (fork point `ac575bd` — "Redesign Regionals History")
- **Ended:** 2026-04-22T00:00:00Z

## Task

"Both the Regionals History tab and Championships tab (which needs to
be renamed to 'NCAA Championships' in the menu) need to follow the
same tile coloring and badge rules as their counterpart in the Team
pages."

- **Requester:** David Tenneson (collegegolfbook on Discord)
- **Started:** 2026-04-22

### Interpretation

Three counterpart mappings:

| Site-wide                         | Component                              | Team-page counterpart                    |
|-----------------------------------|----------------------------------------|------------------------------------------|
| `/regionals` tile grid            | `regionals-results-table.tsx`          | `team-page/regional-timeline.tsx`        |
| `/championships-history` tile grid| `championships-history-table.tsx`      | `team-page/national-timeline.tsx`        |
| Top / mobile nav label            | `site-header.tsx`, `mobile-nav.tsx`    | —                                        |

### Rules to mirror

**Regional tile (team-page target):**
- Win (finished "1" or "T1") → amber wash box + amber-300 text + Medal icon
- Cancelled (2020 COVID) → dashed border + muted gray text "—"
- Advanced (made NCAA) → emerald-400 text
- Missed (team had a regional finish but didn't advance) → rose-400/80
- No appearance → dashed empty cell (already rendered that way)
- Seed badge `#N` under the position when seed is known
- Tooltip with regional name + seed + SG + margin + title count

**NCAA tile (team-page target):**
- Champion → amber wash box + amber-300 text + Trophy icon
- Cancelled (2020 COVID) → dashed muted
- Match-play top 8 non-champion → emerald-400 text (currently `primary`)
- Made cut → foreground/80
- Missed cut → rose-400/80 text (currently muted)
- Match-play round badge: R (amber-500), SF (sky-400), QF (emerald-400)
- Legend mirroring team-page legend

### Scope notes

- The site-wide Regionals table uses `regionalsHistory` (`position`,
  `advanced`) — no seed/SG/margin in that dataset. To add the seed
  badge and richer tooltip I'll join to `regionalsRich` by
  (team, year, gender). The join is lossy before the seeding era
  (pre-~2002) — tiles will gracefully fall back to no badge /
  shorter tooltip when `regionalsRich` doesn't have the row.
- 2020 cancelled handling on both site-wide tables: on team pages,
  `cancelled` is constructed at page level. On the site-wide tables
  today, 2020 shows as a blank dashed cell for every team (the same
  as "no appearance"). I'll render 2020 explicitly as a cancelled
  tile (dashed + "—") so it reads as "no championship" rather than
  "team missed it", matching the team-page convention.

### Actions

1. **Nav rename** (`dd9e6bb`). Swapped the label "Championships" →
   "NCAA Championships" in `site-header.tsx` (desktop) and
   `mobile-nav.tsx` (mobile drawer). URL path kept as
   `/championships-history` — label change only.

2. **Site-wide Regionals table parity** (`dd9e6bb`). Rewrote the
   expansion-grid tile rendering in `regionals-results-table.tsx`
   to mirror `team-page/regional-timeline.tsx`:
   - Regional wins (position `1` or `T1`, via `isRegionalWin`) get
     amber wash (`border-amber-400/40` + `bg-amber-400/[0.06]`) and
     a Medal icon next to the year.
   - `advanced` → `text-emerald-400` (was `text-emerald-300` inside
     an emerald-bordered tile; now neutral tile + coloured text so
     advances don't visually compete with wins).
   - Non-advancing appearances → `text-rose-400/80` (new).
   - 2020 COVID renders explicitly as dashed + "—" with a
     "No NCAA postseason (COVID-19)" tooltip, for every team.
   - Added a seed-badge row (`#N`) pulled from `regionalsRich` via
     an in-component `Map<"team|year", RegionalFinishRich>` lookup.
     Lossy before the seeding era (~2002) — tiles render without
     the badge in that case.
   - Rewrote the per-tile tooltip via a new `buildRegionalTooltip`
     helper that mirrors the team-page: regional site · seed ·
     team SG · margin · nth Regional title. Falls back to a short
     position summary when no rich row joins.
   - Legend below the table rewritten to match team-page colour
     language (Medal / emerald advanced / rose did-not-advance /
     dashed no-appearance).

3. **Site-wide NCAA Championships table parity** (`dd9e6bb`).
   Rewrote the expansion-grid in `championships-history-table.tsx`
   to mirror `team-page/national-timeline.tsx`:
   - Match-play advance → `text-emerald-400` (was `text-primary`).
   - Missed cut → `text-rose-400/80` (was `text-muted-foreground`).
   - Added match-play round badges next to the year via a new
     `matchPlayRound(cell)` helper: `R` (amber-500) when the team
     reached the final, `SF` (sky-400) when they reached semis,
     `QF` (emerald-400) when they made the bracket and lost QF.
     Trophy still covers champions.
   - 2020 COVID renders explicitly as dashed + "—" with a
     "No NCAA Championship (COVID-19)" tooltip.
   - Legend rewritten to match team-page national-timeline
     (Trophy / R / SF / QF / emerald reached match-play / border
     made-cut / rose missed-cut / dashed no-appearance).

4. **Tile orientation — newest-first top-right** (`0d770dd` +
   `4ff81f6`). Two-step fix after David flagged the ordering:
   - `0d770dd`: added `dir="rtl"` to the expansion grids and
     `dir="ltr"` to each cell so the grid mirrors the team-page
     pattern structurally.
   - `4ff81f6`: initial iteration was `{years.map(...)}` with
     `years` sorted ascending, which under RTL put the OLDEST
     year in the top-right corner — the opposite of the team
     page. Fixed by reversing at render time
     (`[...years].reverse().map(...)`). Matches the team-page
     which iterates `for (let y = maxYear; y >= minYear; y--)`.
     The `years` array stays ascending so `years[0]` / `years[-1]`
     min/max usage elsewhere (decade filter, header range label)
     continues to work.

### Preview

`https://collegegolfdata-ahft1xgpr-mikkelgolfs-projects.vercel.app`

- `/regionals` and `/championships-history` tile grids now match
  the team-page visual language.
- Top nav shows "NCAA Championships".
- Tiles flow newest-first with most recent year in top-right.

## Diff stats

Session-only (vs. `111c885` — previous tip of `ron/david-test`):

```
 src/components/championships-history-table.tsx | 160 ++++++++++++++++---
 src/components/mobile-nav.tsx                  |   2 +-
 src/components/regionals-results-table.tsx     | 212 +++++++++++++++++++++----
 src/components/site-header.tsx                 |   2 +-
 4 files changed, 326 insertions(+), 50 deletions(-)
```

Three feature commits (`dd9e6bb` tile parity + nav rename,
`0d770dd` dir=rtl orientation, `4ff81f6` newest-first iteration)
plus this session-doc commit.

## Open questions / follow-ups

**Non-blocking:**

- **Seed badge coverage.** Before ~2002 the `regionalsRich` join
  returns nothing, so tiles render without the `#N` badge. That's
  by design (no seed existed then), but if editorial preference
  is to dim or suppress the position colour in that era to make
  the data gap visible, it's a small conditional in the same block.
- **Women's seed badges.** The `regionalsRich` dataset has no
  women's rows yet; the Women toggle will render site-wide
  Regionals tiles without seed badges or rich tooltips. The
  tiles still colour correctly (win / advanced / missed /
  cancelled) from the core `regionalsHistory` dataset. This
  lights up automatically when Mikkel runs the
  `scripts/build-regional-history.py` regen per the previous
  session's blocker note.
- **Hover affordances kept minimal.** The team-page tiles don't
  have `hover:` state since they're read-only timelines; the
  site-wide tiles retained `hover:border-border-medium` +
  `hover:shadow-raised` because the surrounding table has a
  ring-card tactile language. If that feels inconsistent with
  the team-page look, easy to strip.
- **No changes to the stats columns / sort behaviour / filters**
  on either site-wide table — only the expanded year-by-year
  tile grid and the nav label.
