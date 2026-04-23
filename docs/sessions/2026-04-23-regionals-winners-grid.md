# Regionals year-by-year winners grid

**Started:** 2026-04-23T00:00:00Z
**Requester:** David Tenneson
**Branch:** ron/regionals-winners-grid
**Base:** dev
**Status:** in-progress

## Task
Apply the same Year-By-Year winners grid treatment to the Regional History
page that we just shipped on the NCAA Championships page. Regionals have
6+ winners per year (one per regional site), so the grid's multi-badge
auto-shrink handling is exactly what we need.

## Prior art — carry this context forward

The reusable grid component from the previous session is already merged
into `dev`. Do NOT rebuild it — reuse it.

**Component:** `src/components/year-by-year-winners-grid.tsx`
**Previous session doc:** `docs/sessions/2026-04-23-champions-year-table.md`

### Component API (already shipped)
```ts
interface YearWinners { year: number; winners: string[]; cancelled?: boolean }

interface Props {
  results: YearWinners[];
  gender?: Gender;                                 // optional team-page link
  isYearActive?: (year: number) => boolean;        // dim cell (decade-filter pattern)
  isWinnerActive?: (team: string, year: number) => boolean; // hide badge (conference-filter pattern)
  cancelledTitle?: string;
}
```

### Styling it already handles
- RTL 4/6/8/10-col grid, newest year top-right, oldest bottom-left.
- Badge size auto-shrinks with winner count: 30 / 22 / 18 / 15 / 13 / 11 px for 1–6+. Six hosts per year works out of the box.
- `TeamMonogram` from `@/components/team-page/team-monogram.tsx` — colored box with initials pulled from `src/data/team-colors.ts`.
- Empty state (cancelled year / no winners / all filtered out) = dashed em-dash cell.
- Respects `prefers-reduced-motion`.

### Design decisions we're locked into (from the NCAA session)
- **Conference filter → hide** via `isWinnerActive` (em-dash replacement). Don't dim.
- **Decade filter → dim** via `isYearActive`. On the NCAA page we temporarily hid the Decades chip UI because dim-all-cells-outside-range read poorly; if Regionals has a decades filter we should start with it hidden too.
- **Section defaults to collapsed.** Header: "Winners By Year" (or equivalent title-case phrasing — David prefers title case).
- **No subtitle** under the header.
- Animation: `motion.div` with `height: 0 → auto` and `opacity`, `duration: 0.2`, easing `[0.32, 0.72, 0, 1]`. Match the expanded-team-row pattern used in `championships-history-table.tsx`.

## To figure out first (before coding)

1. **Which Regional page?** Candidates from a quick ls: `src/components/regionals-leaderboard-tabs.tsx`, `src/components/regionals-results-table.tsx`. Find the actual page route (`src/app/regionals-*/page.tsx` likely).
2. **What is a "winner" at Regionals?** Ambiguous — could be:
   - The single team that "won" each regional (low stroke total / match-play equivalent), OR
   - All teams that advanced from that regional to the NCAA Championship (typically top 5-6 per site).
   David's original request said "6+ winners each year" which aligns with "one winner per regional site" × 6 sites. Default to that unless exploration shows a cleaner signal.
3. **Data source.** Find the regionals data file(s). Need `{year, team, position, regional_site}`-shaped data or similar. Likely `src/data/regionals-*.json` or generated.
4. **Gender handling.** Men's and women's regionals run separately. Mirror the NCAA page's gender toggle if the Regionals page has one.
5. **Filters on the page.** Check which filters already exist on the Regionals page — wire `isWinnerActive` to any conference filter it has.

## Actions
_(filled on !wrap)_

## Diff stats
_(filled on !wrap)_

## Open questions / learnings
_(filled on !wrap)_
