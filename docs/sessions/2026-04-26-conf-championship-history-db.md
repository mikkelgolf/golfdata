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

### Phase 1 — JSON skeleton + current-season winners

- Built `scripts/build-conf-championship-history.ts` (commit `5a339dc`)
  pulling `https://scoreboard.clippd.com/api/tournaments` for every
  (gender × season) panel, applying an EXCLUDE table + a 30-row
  CONFERENCE_MAPPINGS table (host-name + name-pattern resolution),
  and grouping into one row per (conference × gender × season). The
  stroke/match split uses Clippd's authoritative `eventType` field
  rather than name parsing.
- Output: `src/data/conference-championship-history.json` — 173 rows,
  31 with both stroke + match legs, 25 winners attached from the
  current-season `championships-{men,women}-2026.ts` files. 2024 +
  2025 winners left null pending Phase 2.

### Phase 2 — Past-season winner / runnerUp / finalScore

David's directive: *"Begin phase 2 for stroke play first and then match
play. For the match play entry, we want not only the winner but also
the team they defeated and the final score (ex: '3-2' or '3-1-1' or
'4-1' or '4-0-1' or '5-0' or any iteration with 0.5 such as
'3.5-1.5')."*

- **`scripts/clippd_match_extractor.py` (new).** Extracts match-play
  championship-final detail. Two-phase Playwright walk:
    1. `/scoring/team` → row 1 (winner) + row 2 (runner-up) by finding
       the TEAM-column header dynamically.
    2. `/scoring/round` (defaults to FINAL round) → scan rendered body
       for the dual matchup `"{Left}\nSingles\n\n{X} - {Y}\n\n{Right}"`
       whose two team names equal {winner, runnerUp}. Cross-references
       team-page winner so that LEFT-vs-RIGHT order on the round page
       — which is NOT consistent across tournaments — doesn't get the
       score backwards. Half-point matches preserved as `"3.5-1.5"`.
  Validated against four manually-verified samples:
    - `232318` (ACC men 2024) → `North Carolina` def `Florida State`, 3.5-1.5
    - `232394` (ACC women 2024) → `Wake Forest` def `Clemson`, 3-2
    - `232557` (SEC men 2024) → `Auburn` def `Vanderbilt`, 3-2
    - `232616` (SEC women 2024) → `Mississippi State` def `Texas A&M`, 3-2
- **`scripts/clippd_winner_extractor.py` (refactor).** Added a
  `page=None` overload so the populator can share one Chromium context
  across many tournaments. Existing CLI + `detect_new_champions.py`
  caller untouched (positional default args).
- **`scripts/populate_conf_championship_winners.py` (new).** Loads
  the JSON, filters by --season/--gender/--conference (default: 2024
  + 2025), and walks stroke-play legs first then match-play legs.
  Reuses one Playwright browser context across every tournament.
  Flushes JSON every 10 legs so an interruption is non-fatal.
  Idempotent: legs that already carry full data are skipped unless
  `--force`.
- **`scripts/build-conf-championship-history.ts` (update).** Extended
  `TournamentLeg` with optional `runnerUp` + `finalScore` for
  match-play legs. Added `loadPriorWinners()` so a rebuild preserves
  Phase 2 data instead of clobbering it back to null.

