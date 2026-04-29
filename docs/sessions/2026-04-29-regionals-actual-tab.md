# Add "Actual" tab to Regional Predictions page

**Started:** 2026-04-29T15:35:11Z
**Wrapped:** 2026-04-29T16:30:00Z (approximate)
**Requester:** David Tenneson
**Branch:** ron/regionals-actual-tab
**Base:** dev
**Status:** wrapped, merged to dev

## Task
creation of a new "Actual" tab in the Regional Predictions page

## Actions

### 1. New "Actual" mode end-to-end (commit `b27eb1e8`)
- Added `ScurveMode = "strict" | "committee" | "actual"` and `computeActualScurve()` in `src/lib/scurve.ts`. The new function joins announced selections back to existing `TeamData` (so conference, AWP, lat/lng, W-L all flow through) and emits the same `ScurveAssignment[]` shape every downstream view already consumes — no per-view changes required (Map, Regional, S-Curve, Visual, Breakdown, Manual Grid, Advancement Model all just work).
- New data files `src/data/regionals-actual-men-2026.ts` and `src/data/regionals-actual-women-2026.ts`, each currently exporting an empty `ActualSelection[]`. Schema: `{ team, seed, regionalId }`. Hand-edited per year; comment in each file explains how to populate.
- `ScurveTable` now accepts `menActual` / `womenActual` props and computes `availableModes` per active gender. "Actual" tab renders only when that gender's array is non-empty.
- `page.tsx` wires the new data files through.

### 2. Roadmap entry for season selector (commit `036ab28d`)
- Captured David's flag about future multi-season support as a new Phase 4 candidate (#7) in `ROADMAP.md`. Notes what plugs in for free from this PR (Actual logic is season-agnostic at the function/component-prop level), the heterogeneous-shape gotcha (historical seasons probably ship without rankings/championships), and explicitly why we did NOT build the GUI in this PR.

### 3. UX refinement — default-on-reload (commit `b65c2d5a`)
After David clarified the desired UX ("simple: default if no override; any reload-triggering action returns to default"), tightened the mode-toggle behavior:
- `mode` is no longer a URL param. Refresh, navigate-away-and-back, and old shared `?mode=` links all hit the site default for the active gender.
- Gender flip now ALWAYS resets `scurveMode` to the new gender's default (actual when published, committee otherwise) regardless of what the user had on the previous gender.
- User overrides (clicking Committee/Strict) remain session-only and never persist.

`view` and `gender` are still URL-persisted — bookmarkable.

## Diff stats

```
 ROADMAP.md                                       | 28 ++++++++
 docs/sessions/2026-04-29-regionals-actual-tab.md | 19 +++++
 src/app/page.tsx                                 |  4 ++
 src/components/scurve-table.tsx                  | 88 +++++++++++++++++++-----
 src/data/regionals-actual-men-2026.ts            | 30 ++++++++
 src/data/regionals-actual-women-2026.ts          | 18 +++++
 src/lib/scurve.ts                                | 75 +++++++++++++++++++-
 7 files changed, 242 insertions(+), 20 deletions(-)
```

Commits on branch (chronological):
- `f7c30e83` chore(sessions): start regionals-actual-tab
- `b27eb1e8` feat(regionals): add "Actual" tab for committee-announced field
- `036ab28d` docs(roadmap): capture season-selector follow-up for Regional Predictions
- `b65c2d5a` fix(regionals): default mode resets on every reload trigger

## Open questions / learnings

### Learnings

- **`ScurveAssignment[]` is the right pivot for "official" data.** Every downstream view in `ScurveTable` is keyed off this single shape. Re-projecting the committee announcement into the same shape (rather than building a parallel "actual" data path through every view) was a five-line wrapper rather than a feature-flag explosion. Worth remembering when the next "alternate source" feature lands.
- **A URL param can be the wrong default-persistence mechanism.** Initial instinct was to URL-persist `mode` like `view` and `gender`, but for "default-unless-overridden" behavior URL-persistence actively fights you on refresh. Rule of thumb going forward: URL-persist things the user wants to share or bookmark; keep ephemeral preferences in component state only.
- **One-option dropdowns lie about user choice.** When David proposed building a season selector now (with only 2025-26 available), declining and capturing it in the roadmap was the right call — saved both the pointless UI and a likely second refactor once historical-data shape is known.

### Open questions / followups

- **Season selector** is captured as ROADMAP.md Phase 4 #7. Trigger to act: David's historical-data PR. The Actual visibility logic shipped here will plug in unchanged.
- **Unknown teams in `actualSelections`** — `computeActualScurve` currently surfaces them with placeholder fields (rank 9999, no coords, empty conference) rather than dropping them, so a name mismatch shows up visually instead of disappearing. Acceptable for now since edits are manual + small. If the data ever flows through a script, the script should validate against `all-teams-{gender}-2026.ts` and fail loudly.
- **Bracket-as-of timestamp.** Once Actual data is populated, we'll probably want to show "Selections announced [date]" somewhere on the page for context. Trivial follow-up — out of scope here, no work done yet.
