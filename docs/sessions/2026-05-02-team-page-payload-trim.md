# 2026-05-02 — Team page payload trim (Vercel ISR cap mitigation)

**Branch:** `ron/team-page-payload-trim`
**Requested by:** David Tenneson (Discord: collegegolfbook)
**Co-author / reviewer:** Mikkel

## Why

Vercel ISR Read Units are at **873k of 1m** for the current cycle. Daily run
rate is ~64k baseline with spikes to ~128k during NCAA Regional selection
(Apr 27–29). Without intervention we will hit the cap in 1–2 days.

## Diagnosis (from the audit run before this session)

- The site has **no `revalidate` exports**, no fetch caching, no route
  handlers, no server actions. Pure SSG everywhere.
- 597 prerendered team pages at `/teams/[gender]/[slug]` are the dominant
  ISR surface area.
- **Each team-page HTML is ~470–580 KB raw** (e.g. `alabama.html` =
  580,919 bytes). Vercel compresses ISR storage, so reads bill against
  ~80–120 KB compressed → **~12–18 read units per ISR cache hit**.
- The HTML is one line containing 11 inlined RSC chunks
  (`self.__next_f.push(...)`). Per-page Tailwind class verbosity is
  significant: 393 `tabular-nums` and 231 `border-border` instances per
  page.
- No non-determinism in the page template (the only `toLocaleString` is
  on a number). So writes are fine — this is purely a reads problem.
- **Apr 22 likely seeded the baseline jump** (Apr 23 in the chart, after
  the daily deploy lands): `Regenerate regionals-rich.json with women's
  Regional data` added 25,536 lines of rich data, putting a Regional
  Performance section onto 286 women's team pages that previously had a
  stub. The Apr 24 change `extend uniform regionals grid to
  zero-appearance teams` made the smallest pages bigger by rendering
  every year cell from 1989/1993 → 2026 even for teams with no
  appearances.
- **Apr 27–29 spike (128k/day)** was almost certainly real organic
  traffic — that week was NCAA Regional selection. Code commits in the
  window were `women-actual-bracket` and `regionals-actual-tab` — features
  visitors came to look at, not regressions.
- **Apple-icon ISR hits** (10 × ~3 units = 30 units) are negligible —
  not worth the move from `app/apple-icon.png` to `public/`.

## Plan

Targets in ROI order:

1. **Quantify exactly what's eating the 580 KB per page** by sectioning
   the HTML output (program-arc props, timeline grid, NCAA timeline
   grid, record book, map props, structured data, Tailwind class
   churn). Need this measurement before deciding which lever pulls
   hardest.
2. **Move year-by-year cell grids (regional + NCAA timeline) to client
   islands** that hydrate from a small JSON prop. Today every cell ×
   ~37 years × 8 attributes is in the static RSC stream. Estimated
   reduction: 30–40% of HTML.
3. **Trim Tailwind class verbosity on hot loops** — extract the most
   repeated class strings on timeline cells into a small CSS class or
   CVA. 393 × ~12 bytes of one class string ≈ 4.7 KB of just that
   class on every page.
4. **Audit props passed to `InteractiveProgramArc`, `TeamMap`,
   `RegionalTimeline`, `NationalTimeline`, `RegionalPerformance`** —
   if any is receiving a slice of `regionalsRich`, `regionalsHistory`,
   or full team coordinates, the RSC payload contains it. Pass only
   the minimum.

Conservative target: **500 KB → 150–200 KB per page** → **2.5–3× drop
in team-page ISR reads**. Team pages are the dominant source per the
Caching dashboard (52 ISR hits in the snapshot was the top entry).

## Out of scope for this session

- **`revalidate` + on-demand rebuild** (changes the daily-refresh →
  full-build flow into a per-team revalidation). Big architectural
  change; address separately once payload is trimmed.
- **CDN `s-maxage` tuning**. Vercel CDN retention is mostly out of
  our control; 15.4% fallthrough to ISR is not unusual.
- **Hobby → Pro plan upgrade.** That's Mikkel's billing decision.

## Validation gates before merge

- Local build of trimmed page must be byte-comparable to current build
  (target ≥ 60% reduction in `.next/server/app/teams/men/alabama.html`
  or fail the experiment).
- Visual diff: pull up a team page on the Vercel preview and confirm
  no UI regression vs prod (timeline cells, map, program arc, record
  book all render identically).
- No new client-side waterfall — JSON islands must be inlined as
  module data or fetched from a static `.json` route, not via a
  function invocation.

## Status log

- 2026-05-02 — session started, branch created off `dev`, audit
  findings logged.
