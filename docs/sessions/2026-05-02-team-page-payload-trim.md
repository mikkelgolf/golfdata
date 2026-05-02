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
- 2026-05-02 — built `scripts/analyze-team-page-payload.mjs` to break
  down what's eating bytes inside `.next/server/app/teams/men/<slug>.html`.
  Ran against 5 representative pages. Surprise finding: the
  "Geography → 2026 conference championship" span is **395.8 KB on
  EVERY team page** — same byte count across all five samples. Traced
  to `TeamMap` component rendering 50 individual `<path>` elements
  (one per state) inline in the SSR HTML, each with the full SVG
  path data from the 10m-resolution US topology. This single
  finding accounts for **70–85% of every team page's payload**.
- 2026-05-02 — pivoted plan: instead of refactoring multiple
  sections, fix the one giant lever first.

  **Change:** generate the static base map (state fills + state
  borders + timezone borders + nation border) once at build time,
  serve it as `public/us-base-map.svg`, and reference it from
  `TeamMap` via `<image href="/us-base-map.svg">`. Per-team overlays
  (team marker, regional marker, travel arc, other regionals) stay
  inline. Site is dark-mode-only so colors are hardcoded.

  **Files added/changed:**
    - `scripts/build-us-base-map.mjs` — pre-renders the static SVG
      from `src/data/us-states-10m.json`. Run on demand when topology
      or theme colors change.
    - `scripts/analyze-team-page-payload.mjs` — diagnostic kept around
      for future regressions.
    - `public/us-base-map.svg` — generated 391.8 KB static asset.
      Served once by the CDN, cached in the browser for the lifetime
      of the deploy. **Bypasses ISR cache entirely** (anything in
      `public/` is a true static asset, no ISR billing).
    - `src/components/team-page/team-map.tsx` — removed inline state
      paths + topology imports; added single `<image>` tag.
      `tzBandFromCoord(lat, lng, statesGeo)` → `tzBandFromLatLng(lat,
      lng)` (lazy-loads topology internally) to drop the topology
      from this client component's bundle too.

  **Measured impact** after `npm run build`:

  | Page              | Before    | After     | Δ          | Ratio  |
  |-------------------|-----------|-----------|------------|--------|
  | alabama           | 567.3 KB  | 172.7 KB  | -394.6 KB  | 3.3×   |
  | abilene-christian | 471.4 KB  |  76.9 KB  | -394.5 KB  | 6.1×   |
  | air-force         | 516.7 KB  | 122.1 KB  | -394.6 KB  | 4.2×   |
  | presbyterian      | 461.8 KB  |  73.0 KB  | -388.8 KB  | 6.3×   |
  | minnesota         | 540.9 KB  | 146.2 KB  | -394.7 KB  | 3.7×   |

  Across all 597 prerendered team pages, ~230 MB of inlined SVG
  removed from the prerender output. Expected ISR-read-units
  reduction on team-page traffic: **3–6×** depending on which pages
  get hit (smaller-history teams benefit the most relative to their
  pre-fix size).

  **What we did NOT do** (deliberately, to keep this PR focused):
  - Did not move the year-by-year timeline grids to client islands.
    That was the original Step 1 in the plan; the map win was so
    large that the timeline grid trim isn't urgent for the cap
    fight. Worth a follow-up session if reads are still high after
    this lands.
  - Did not change the daily-refresh deploy cadence or add
    `revalidate` to the team route. Same reason — out of scope, can
    be a separate session.

## Wrap (2026-05-02)

**PR:** https://github.com/mikkelgolf/golfdata/pull/36
**Vercel preview:** https://collegegolfdata-6i28k04nd-mikkelgolfs-projects.vercel.app
**Branch state at wrap:** 3 commits ahead of `origin/dev`, 5 files changed, +499 / -87 lines.

**What shipped:**

- `scripts/build-us-base-map.mjs` — pre-renders the static US base map
  from `src/data/us-states-10m.json`. Run on demand when topology
  source or theme colors change.
- `scripts/analyze-team-page-payload.mjs` — diagnostic for breaking
  down what's eating bytes inside a prerendered team-page HTML; kept
  around for future regressions.
- `public/us-base-map.svg` — 391.8 KB generated static asset, served
  from CDN, bypasses ISR billing.
- `src/components/team-page/team-map.tsx` — replaced 50 inline state
  `<path>` elements + topology imports with one `<image
  href="/us-base-map.svg">`. `tzInfo` now uses `tzBandFromLatLng`
  (lazy-loads topology internally), shrinking the client bundle too.
- `docs/sessions/2026-05-02-team-page-payload-trim.md` — this doc.

**Measured impact** (already logged above): per-page HTML cut by
3.3–6.3× across 5 sample team pages, ~395 KB removed per page,
~230 MB removed across all 597 prerendered team pages. Expected
real-world ISR-read-units reduction: ~64% based on assumed
compressed-bytes billing model and team-pages-as-85%-of-read-bytes
assumption. Confirmation pending post-prod-deploy dashboard check.

**David approved at wrap time** ("It looks ok") — folded into `dev`
via `git merge --no-ff` next.

## Open follow-ups (after this lands)

- Re-pull the Vercel ISR Read Units chart 24–48 h after deploy to
  confirm reads have dropped on the `/teams/[gender]/[slug]` route.
- If reads are still high, queue a session to move the regional +
  NCAA timeline grids to client-rendered islands hydrated from a
  small JSON prop. Estimated additional savings: 30–60 KB per page.
- Evaluate adding `export const revalidate = 86400` + on-demand
  `revalidatePath` from `daily-refresh.sh` so daily writes only
  touch teams whose data actually changed.
