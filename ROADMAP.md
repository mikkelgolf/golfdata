# Roadmap

Forward-looking work on collegegolfdata.com. Short, honest, ranked.

## Shipped (for context)

- **Conference Championships tab** — `/conference-championships`
  - Phase 1: route + map + three view modes + 30 men's / 29 women's venues
  - Phase 2: full D1 field (all-teams-*.ts) + derived AQ for every conference
  - Phase 3: travel beeswarm + "this week" highlight + per-card status badges
  - Phase 3.5: head-to-head + stroke differentials per team in field
    - Data pipeline: `mikkel-system/tools/tournament-scraper/{team_rosetta_survey,team_rosetta_build,head_to_head_build}.py`
    - BigQuery: `granular-scoring.granular_scoring_dataset.{dim_team_rosetta, v_team_tournament_totals, v_team_head_to_head, v_team_head_to_head_meetings}`
    - Static export: `src/data/head-to-head-2526.json` (refreshed weekly)
    - UI: new columns in every expanded ChampionshipCard
- **Weekly auto-refresh** — every Wednesday 23:00 CET, `mikkel-system/scripts/rankings_pipeline.sh` rebuilds rosetta + h2h, commits, pushes, and runs `vercel --prod`. Zero manual touch.

---

## Phase 4 candidates

### 1. Course preview pages per championship venue *(biggest content payoff)*

Each ChampionshipCard expands into a full venue page with:
- Course name, par, yardage, designer, year built
- Recent winners (from `granular_master` aggregated by year + venue)
- Hole-by-hole difficulty stats — the `course_lookup` BigQuery table already has `par, yardage, avg_score, to_par_avg, eagles_plus, birdies, pars, bogeys, doubles_plus, hole_rank, hole_rank_tournament` for most Clippd events
- Historical scores at that venue (use `granular_master` + `scrape_registry` to find every year the conference championship or other events were played there)
- Optional: grass type, course preview notes (already supported via `RegionalPreview` interface shape in `src/data/regionals-men-2026.ts`)

**Value:** Turns the page from "where and when" into "where, when, what to expect, and why it matters." Biggest Substack/Clippd content spin-off potential. Recruiting + coaching users get a real research tool.

**Effort:** ~1 day. Data mostly exists in BigQuery. Requires a new export + a new detail view (maybe a modal or a dedicated sub-route like `/conference-championships/[id]`).

**Data sources ready to tap:**
- `granular-scoring.granular_scoring_dataset.course_lookup` — per-hole stats
- `granular-scoring.granular_scoring_dataset.granular_master` — hole-by-hole, filter by course name or tournament_id history
- `scrape_registry` — tournament metadata for year cross-reference

---

### 2. Head-to-head drill-down on team click *(most engaging interaction)*

Click any team row in an expanded ChampionshipCard → a sub-panel slides down showing that team's FULL head-to-head record across the 25-26 season, not just vs the field. Grouped by conference. With per-meeting drill-down from `v_team_head_to_head_meetings`.

**Value:** Most interactive / "playful" feature. Turns the page into a clickable matrix that coaches and fans actually explore. Natural share behavior ("Auburn is 0-2 vs Florida this year — screenshot this.")

**Effort:** ~4 hours. All data already exists in `head-to-head-2526.json`; just need to expose all opponents (not just field-filtered) via the existing `src/lib/head-to-head.ts` helper, plus a new React component for the drill-down.

**Gotcha:** The 2.6 MB JSON might need dynamic `import()` if mobile UX feels heavy. See #5.

---

### 3. Projections from pairwise data *(actionable, short)*

"Based on 25-26 head-to-head, projected SEC Men's winner is Florida."

Simple strength-of-field-adjusted model: for each championship, use the pairwise win probabilities derived from the team pairs that will actually be in the field. Basic Bradley-Terry or elo-ish aggregation over the `v_team_head_to_head` cumulative stroke differentials.

**Value:** Gives the page a clear "prediction" — different from the current "top-ranked team = predicted AQ" heuristic (which uses OVERALL rank, not in-conference head-to-head). Could be surprising — Auburn is #1 nationally but 4-6 within the SEC, so a pairwise model would favor Florida or Arkansas instead.

**Effort:** ~half-day. Pure SQL + a new export field on each championship. No UI redesign needed — replaces (or supplements) the existing "Predicted AQ Winner" column.

---

### 4. Historical depth *(Phase 3.5 extension)*

Widen `v_team_tournament_totals` to include 2024-25, 2023-24, and earlier by dropping the `scrape_registry.season = 2026` filter (or parameterizing it). Rosetta already works cross-season. The Clippd bridge view has ~3,600 D1 entries covering multiple seasons.

**Value:** Unlocks all-time records — "Auburn vs Florida all-time 25-12 in 5 seasons" — and multi-year trend content. Good for Substack research pieces.

**Cost:** Bigger JSON (~10+ MB for 3 seasons). Absolutely worth pairing with #5 (dynamic import) if we ship this.

**Effort:** ~1 hour for the BQ changes + export. But payload-wise it forces #5.

---

### 5. Dynamic import for head-to-head JSON *(technical hygiene)*

Currently the 2.6 MB `head-to-head-2526.json` is bundled into the `/conference-championships` page chunk. First Load JS for that page is 355 KB (was 206 KB before Phase 3.5). For mobile users on slow networks, that's noticeable.

Fix: wrap the h2h import in a dynamic `import()` that loads only when the user expands a ChampionshipCard. Drops the base page load to ~10 KB.

**Value:** User-invisible until it matters. Pure performance / bundle hygiene.

**Effort:** ~30 min. Refactor `src/lib/head-to-head.ts` from top-level import to an async factory function, thread through React's Suspense or a simple loading state.

**Recommended pairing:** ship together with #4 since historical depth makes the JSON large enough that dynamic import becomes essential.

---

### 6. Round-level stroke differentials *(deeper analytics)*

Instead of "Auburn beat Florida by 3 strokes total at event X," compute "Auburn beat Florida by 1 Round 1, 4 Round 2, lost by 2 Round 3, +3 net" — per-round deltas.

**Value:** Finer granularity for analysis content. Shows when teams gain or give up ground within events.

**Data available:** `granular_master` has `round` per row. Straightforward to add another view `v_team_round_totals` that groups by `(tournament, round, unitid)` and aggregates team round scores (sum top-4 of 5 counting scores).

**Effort:** ~half-day. New view + extended JSON + table row in the UI.

---

### 7. Season selector for Regional Predictions *(unlocks historical + 2026-27)*

Today the Regional Predictions page (`/`) is hardwired to 2025-26 — `regionals-{men,women}-2026.ts`, `all-teams-{men,women}-2026.ts`, `championships-{men,women}-2026.ts`, `regionals-actual-{men,women}-2026.ts`. To support David's incoming historical seasons and the 2026-27 cycle starting in ~6-9 months, we need a season selector and a season-keyed data registry.

**What changes:**
- New `seasons` registry — a single map from season key (e.g. `"2025-26"`) to that season's data bundle (regionals, all-teams, championships, actual). Probably `src/data/seasons/index.ts` re-exporting per-season modules.
- New `season` state in `ScurveTable` (URL param `?season=2025-26`), defaults to the most recent season with data.
- Selector UI — likely a third `SegmentedToggle` next to gender/mode, or a small dropdown if the list grows past ~4 entries.
- `ScurveTable`'s data props get sourced from `seasons[activeSeason]` instead of imported directly.

**What plugs in for free (already shipped):**
- The "Actual" tab visibility + default-to-actual rule from this branch is season-agnostic at the component level — it just reads `menActual.length > 0` / `womenActual.length > 0` from props. When season changes, those props change, and the rule re-evaluates correctly.
- File naming is already year-suffixed (`regionals-actual-men-2026.ts`), so historical files (`-2025.ts`, `-2024.ts`) and future files (`-2027.ts`) drop in alongside without renames.
- `computeScurve` accepts `actualSelections` as an opaque parameter — no changes there.

**Heterogeneous-shape gotcha:** historical seasons probably have only `actual` + regionals (no rankings/championships, since you can't predict the past). Current/future seasons have the full set. The registry needs to tolerate sparse bundles — strict mode and committee mode should be hidden (or the predictive views collapsed) when a season has no rankings to feed them. Worth scoping that against a real historical season's shape rather than guessing.

**Why we deliberately did NOT build the GUI in the Actual-tab PR:**
- A dropdown with one option ("2025-26") is clutter that lies about user choice.
- We hadn't seen historical data yet — designing the registry blind risks a second refactor.
- The Actual logic was self-contained and shippable today without the registry; the registry is a clean follow-up that doesn't fight what's there.

**Effort:** ~half-day once historical data lands. Bigger if the historical shape needs schema reconciliation. Best done as the same PR that introduces the first historical season — that way the GUI ships with a real second option, and the data refactor is grounded in a real second shape.

**Owner-context:** Requested by David Tenneson during the Actual-tab session (2026-04-29). Trigger to act on this item: David's historical-data PR.

---

## Not planned but worth noting

- **BigQuery scheduled materialization** of head-to-head views as tables (instead of views). Current queries run in seconds — no need. Revisit if/when we widen to historical and latency becomes visible.
- **Player-level head-to-head**. Pairwise for individuals, not teams. Requires name normalization at the player level which is harder than team-level. Possible but different scope.
- **Course difficulty adjustment** (strokes-gained style). Adjust the raw stroke differential for course difficulty using `course_lookup.avg_score`. More principled metric but the existing "raw differential in shared events" already naturally controls for course difficulty because both teams played the SAME course.

---

## If you had to pick one

**#1 (course previews)** if optimizing for content + launch polish + recruiting value — turns the Conference Championships tab from "where and when" into a full research tool.

**#2 (drill-down)** if optimizing for page engagement — most clickable, most shareable, all the data is already in `head-to-head-2526.json`.

Both are ~1 day or less. Everything else is incremental on top of those two.
