# Build a conference-championship history database

**Started:** 2026-04-26T00:00:00Z (TZ: local CEST)
**Requester:** David Tenneson
**Branch:** ron/conf-championship-history-db
**Base:** dev (origin/dev @ abb56d3)
**Status:** wrapped (merged to dev)

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

## Follow-ups

### TODO (David) — sanity-check 2024/2025 stroke-play vs match-play splits

When this JSON eventually backs UI on the Conference Championships
page, every row where the stroke-play medalist team differs from
the match-play trophy team will be visible. Most are legitimate
(stroke-play seeds match-play, then a re-bracketed team wins the
trophy), but each pair is worth a manual eyeball against the
authoritative scoreboard URLs already stored on the row, in case
the Phase 2 extractor mis-read row 1.

**Verify in a separate feature branch (do NOT block this branch on it):**

| Season | Gender | Conf | Stroke-play winner | Match-play winner |
|---|---|---|---|---|
| 2024 | men | BIGSOUTH | High Point | Winthrop |
| 2024 | men | CUSA | Louisiana Tech | Liberty |
| 2024 | men | OVC | Little Rock | Tennessee Tech |
| 2024 | women | SEC | South Carolina | Mississippi State |
| 2025 | men | BIGSOUTH | Charleston Southern | USC Upstate |
| 2025 | men | CUSA | Liberty | Sam Houston |
| 2025 | women | ACC | Stanford | Florida State |
| 2025 | women | BSOUTH | Charleston Southern | Radford |
| 2025 | women | SUNBELT | Georgia Southern | Southern Mississippi |

Confirmed during today's discrepancy review (2026-04-26): every 2026
trophy winner in the JSON agrees with the live `championships-{men,women}-2026.ts`
source-of-truth — no live-site corrections needed from this dataset.

The 2026 SEC women's stroke-play row was momentarily edited
`Tennessee → Florida` in the working tree to reflect Florida's
stroke-play medalist team finish, but the edit was reverted pending
the broader sanity check above. The committed value (`Tennessee` for
both stroke-play and match-play in the SEC women's row) is internally
consistent with how Phase 1 seeded current-season winners from the
`.ts` files; it just doesn't capture the stroke-vs-match-play split
for 2026 SEC women yet.

## Wrap

After Phase 2 we kept rolling — turned the JSON into a UI surface
and wired the populator into the existing automation so the data
catches up automatically as conferences finish. Final shape of the
branch versus `dev`:

```
13 files changed, 4731 insertions(+), 53 deletions(-)
```

### Phase 3 — UI surface (Conference Championships page + map)

- **Per-team trophy/medal icons** on the conference cards (commit
  `7ff1efb`): gold trophy = match-play champion (or stroke-only
  champion when no match-play leg), silver trophy = match-play
  runner-up, gold medal = stroke-play medalist. Same convention is
  used by every team-row table that surfaces the data.
- **Conference card winner badge swap** (`ed63842`): replaced the
  green "W" badge with the same gold trophy used everywhere else.
- **Map-tab popup** (`2a9fa1d`): per-team trophy/medal icons in the
  team list of both the desktop overlay and the mobile bottom sheet.
- **Stroke Play / Match Play leaderboard link badges** (`4361222`):
  new `LeaderboardBadges` component renders a soft-blue Stroke Play
  badge and a soft-red Match Play badge that link to Clippd's public
  scoreboard. Two sizes: `"sm"` for map popup, `"md"` for card
  header. Anchors stop click propagation so they don't toggle the
  expanding parent.
- **Collapsed-card top-right stripe** (`40e4b27`): on the Champ tab
  and Date tab, the collapsed view now lists up to three stacked
  lines — 🏆 champion, silver 🏆 MP runner-up, 🥇 SP medalist —
  even when the same team won both legs (Stanford women is the
  obvious case).

### Phase 4 — Automation wiring (so we never have to remember)

- **`apply-manual-winner.sh`** (`326b069`): step 3b runs
  `populate_conf_championship_winners.py` after the validator passes,
  scoped to the conf+gender just edited. Stages the JSON for commit
  alongside the .ts edit; reverts cleanly in `--dry-run`.
- **`update-conference-winner-on-demand.sh`** (`326b069`): step 5b
  parses the cron's `autoConfirmed` array and loops the populator
  per (conf, gender) pair. Per-pair invocation isolates partial-
  success failures. Same staging + dry-run cleanup as the manual
  script.
- **Defensive winner-mismatch guard inside the populator**
  (`326b069`): if a leg already carries a winner and the Clippd
  extractor returns a different value, log a warning and leave the
  leg untouched. Use `--force` to override. Without this, the cron
  path could silently overwrite a human-supplied manual winner with
  a Clippd row-1 misread.

### Phase 5 — One-off populate + a Regional Predictions polish

- **2026 SEC men one-off populate** (`09c9b97`): Auburn (SP),
  Florida (MP runner-up), 4-1 final score. First real-world dogfood
  of the populator — paved the way for the automation wiring above.
- **By-Regional tab regional headers enlarged + recolored** (`179115c`):
  expandable header text doubled (desktop name 14 → 28 px, host/city
  subtitle 12 → 24 px; mobile name 11 → 22 px, city/teams 8 → 16 px),
  and the regional name + chevron now render in the regional's own
  color (the same highlight pattern host teams already use). Makes
  scanning for a specific regional instant.

### Open follow-ups (not blocking the merge)

- The 9-row "stroke-play winner ≠ match-play winner" sanity-check
  table earlier in this doc still needs David's eyeball. Tracked
  there; do in a separate branch.
- 2026 SEC women's row in the JSON is still committed as
  Tennessee/Tennessee (see note immediately above this section); the
  populator can refill it on a future run once we decide the
  stroke-vs-match-play split is locked.

### Files touched

```
docs/sessions/2026-04-26-conf-championship-history-db.md
scripts/build-conf-championship-history.ts
scripts/clippd_match_extractor.py            (new)
scripts/clippd_winner_extractor.py
scripts/populate_conf_championship_winners.py (new)
scripts/apply-manual-winner.sh
scripts/update-conference-winner-on-demand.sh
src/components/championships-map.tsx
src/components/championships-view.tsx
src/components/leaderboard-badges.tsx        (new)
src/components/scurve-table.tsx
src/data/conference-championship-history.json (new)
src/lib/conference-results-2026.ts
```

