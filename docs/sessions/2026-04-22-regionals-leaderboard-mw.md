# Session: Regionals Leaderboard — men's + women's tabs

- **Status:** wrapped (code shipped; women's data regen pending Mikkel)
- **Date:** 2026-04-22
- **Branch:** `ron/david-test` (!here flow)
- **Base:** `dev` (fork point `ac575bd` — "Redesign Regionals History")

## Task

"We now have data in that shared Google sheet with granular Regionals
data for both men and women. The Regionals Leaderboard page now needs
to be updated so that there is a men's and women's tab and each of
those get all of the same leaderboards as are currently in that page
for just the men."

- **Requester:** David Tenneson (collegegolfbook on Discord)
- **Started:** 2026-04-22

### Interpretation / plan

Two halves:

1. **Data rebuild.** Previous session noted the sheet's `D1 WOMEN` tab
   was empty, so `regionals-rich.json` only has men's rows. Rerun
   `scripts/build-regional-history.py` now that women's rows exist,
   verify the canonicalization / join still holds for women's team
   names, and refresh the committed JSON.

2. **UI.** `src/app/regionals-leaderboard/page.tsx` currently renders
   five men's-only boards inline. Split into a tabbed client component
   with men / women tabs, each rendering the same five boards pulled
   from its own gender's dataset. Keep the default tab deep-linkable
   via `?gender=men|women` so external links don't silently flip.

### Actions

1. **Python ingest extended to both tabs** (`888bcd3`). Refactored
   `scripts/build-regional-history.py` around a `TABS` list
   `[("D1 MEN", "men", MEN_CANONICAL), ("D1 WOMEN", "women",
   WOMEN_CANONICAL)]`. Single output `regionals-rich.json`, rows
   sorted by (gender, year, regional, finalPos, team) for stable
   diffs. Per-gender canonical maps, per-gender unmatched-team
   warnings. Seeded `WOMEN_CANONICAL` with 4 educated guesses
   (`CSU - Northridge` → `CSU Northridge`, `CSU - Fullerton` →
   `CSU Fullerton`, `Central Florida` → `UCF`, `East Tennessee
   State` → `ETSU`). Script will warn on anything still
   unmatched — that list drives the next edit.

2. **Leaderboard page split into server compute + client tabs**
   (`888bcd3`). `page.tsx` now computes both genders' boards
   server-side via `buildBoards(regionalsRich, "men"|"women")`.
   A new client component `src/components/regionals-leaderboard-tabs.tsx`
   owns the tab switcher. URL state via `?gender=men|women`
   (router.replace with scroll: false so the page doesn't jump).
   Team links now route to `/teams/<gender>/<slug>` per tab.
   Boards filter by gender inside `buildAggregates`, including the
   NCAA-appearance backstop for "advanced as underdog" which is
   now gender-aware too.

3. **Graceful empty state.** Each gender's board block checks
   `boards.teamCount === 0` and renders a friendly "not yet loaded"
   panel. Today the Women tab shows this placeholder; the moment
   the JSON regen lands it lights up automatically — no code
   change needed.

4. **Suspense fix** (`65c1345`). First deploy failed because
   `useSearchParams()` in the client component triggered a Next.js
   14 prerender bailout. Wrapped the tab component in `<Suspense>`
   with a minimal fallback so the static shell still prerenders.
   Followup deploy clean.

### Preview

`https://collegegolfdata-o104jc4og-mikkelgolfs-projects.vercel.app/regionals-leaderboard`

Men tab = identical to current production; Women tab = friendly
"not yet loaded" panel.

## Diff stats

Session-only (vs. `d3ea27f` — previous tip of `ron/david-test`):

```
docs/sessions/2026-04-22-regionals-leaderboard-mw.md | (this doc)
scripts/build-regional-history.py                   |  98 +++++++----
src/app/regionals-leaderboard/page.tsx              | 314 +++++++-------------
src/components/regionals-leaderboard-tabs.tsx       | 218 +++++++++++++++
```

Two feature commits (`888bcd3` tabs + ingest, `65c1345` Suspense fix)
plus this session-doc commit.

## Open questions / follow-ups

**Blocker for lighting up the Women tab (Mikkel, tomorrow):**

Run the regen from the repo root:

```
REGIONALS_SHEET_ID=<id> \
GOOGLE_APPLICATION_CREDENTIALS=~/.config/gcloud/bigquery-credentials.json \
~/projects/ron/.venv/bin/python scripts/build-regional-history.py
```

Expected output includes `wrote src/data/regionals-rich.json: N rows`
with per-gender breakdowns. Watch for:

```
WARN: N women team name(s) in sheet not in existing
regionals-history.json (extend canonical map?):
```

Feed that list back to Ron and I'll extend `WOMEN_CANONICAL` in
`scripts/build-regional-history.py` so the canonical-name join is
clean (otherwise team-page links and percentile joins may miss
those teams). Then commit the refreshed `regionals-rich.json` (+
canonical-map edits if any) and redeploy.

**Non-blocking:**

- **Default tab choice.** Today defaults to Men. If the Women tab
  ends up with meaningfully more coverage or the editorial preference
  changes, flipping the default is a one-line change in
  `regionals-leaderboard-tabs.tsx` (the `g === "women" ? "women" : "men"`
  fallback).
- **URL persistence UX.** `?gender=...` updates on tab click but
  does NOT save the user's preference across visits. Add a cookie
  or localStorage key only if usage analytics show people
  resenting the default.
- **Privacy contract reminder.** The canonical-map expansion is
  metadata about the sheet's team-name forms, not raw sheet
  content — safe to commit. Do NOT include row counts broken down
  by team or year in a commit message; "N rows total, men/women
  split" is fine.
