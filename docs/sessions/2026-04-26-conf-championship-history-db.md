# Build a conference-championship history database

**Started:** 2026-04-26T00:00:00Z (TZ: local CEST)
**Requester:** David Tenneson
**Branch:** ron/conf-championship-history-db
**Base:** dev (origin/dev @ abb56d3)
**Status:** in-progress

## Task

Build a database of NCAA D1 men's and women's conference championships
sourced from Clippd Scoreboard. Schema must support:

- Conference (canonical code, e.g. `B12`)
- Year / season
- Stroke-play tournament URL
- Match-play tournament URL (if any — many conferences are stroke-only)
- Stroke-play champion
- Match-play champion (if any)

Schema must be extensible — David flagged "we will likely add more
fields in the future." This is intended to back a future feature on
the Conference Championships page (UI work to follow in a separate
session once the data is in place).

## Constraints discovered during scoping

- **API ceiling: 3 seasons.** Clippd's `/api/tournaments` returns
  data for `season=2024`, `2025`, `2026` (academic years 2023-24,
  2024-25, 2025-26). Earlier seasons return empty results. So this
  database covers spring 2024 → spring 2026 to start; older years
  would need a different source (school media archives, Wayback)
  in a future session.
- **Tournament breadth.** Each season has 300+ NCAA D1 tournaments;
  we need to filter to conference championships only (~30 per gender
  per year).
- **Stroke + match split.** Some conferences (SEC, Sun Belt, etc.)
  publish two separate tournament IDs per championship — one for
  stroke play, one for match play. The schema collapses these to
  one row per (conference × gender × season) with both URLs.
- **Past winners.** Current-season (2026) winners exist in
  `src/data/championships-{men,women}-2026.ts`. Past winners (2024,
  2025) require Playwright runs against each tournament URL — the
  `clippd_winner_extractor.py` infrastructure already does this.
  Phase 2 work; phase 1 leaves those fields null.

## Phasing (proposed)

1. **Phase 1 (this session):** Season-loop scraper + filter +
   conference-code mapper + stroke/match join + JSON output. Pull
   current-season winners from existing `championships-*.ts`.
   Result: `src/data/conference-championship-history.json` with
   ~180 records, ~60 of which have winner fields populated.
2. **Phase 2 (next session):** Playwright winner-extraction for
   the ~120 past records (2024, 2025).
3. **Phase 3 (future):** UI surface on the Conference Championships
   page.

## Actions

(populated as work progresses)
