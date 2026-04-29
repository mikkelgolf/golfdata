# 2026-04-29 — fix team alias leakage

**Branch:** `ron/fix-team-alias-leakage`
**Requester:** David Tenneson (Discord: collegegolfbook)

## Task

Four bugs reported, three of which share a root cause (alias names from
David's sheet leak into runtime data without being normalised to the
canonical display name used in `rankings-{men,women}.ts` /
`all-teams-{men,women}-2026.ts`):

1. **`/championships-history`** — BYU row links to `/teams/men/byu` which
   404s; canonical slug is `brigham-young`. Same problem applies to ETSU
   and USF/South Florida.
2. **`/regionals`** — BYU, ETSU, South Florida missing conference badges
   because `buildConferenceMap()` keys are canonical names but the rows
   carry sheet aliases.
3. **`/regionals`** — Arkansas-Pine Bluff appears as two rows ("Arkansas-
   Pine Bluff" with SWAC, "Pine Bluff" without) because both spellings
   live in `regionals-rich.json`.
4. **`/teams/{men,women}/*`** — six championship venue lines duplicate the
   state code ("GA, GA", etc.) because `championship.city` already
   contains a `, XX` suffix that the component re-appends.

## Investigation findings

### Alias file directionality bug

`scripts/team-name-aliases.json` is the shared sheet→canonical map used
by `scripts/build-regional-history.py`. The file's docstring says
"Keys are sheet-side variants, values are canonical site names", but
two entries are swapped:

- `"East Tennessee State": "ETSU"` — should be `"ETSU": "East Tennessee State"`
- `"Brigham Young": "BYU"` — should be `"BYU": "Brigham Young"`

`USF` / `South Florida` is missing entirely — sheet has "South Florida",
canonical (rankings + all-teams) is "USF".

`Pine Bluff` is missing entirely — sheet has "Pine Bluff", canonical is
"Arkansas-Pine Bluff" (men) / "Arkansas Pine Bluff" (women, with space —
that's a separate inconsistency in the canonical data; not in this
session's scope).

### championships-history has its own canonical map

`scripts/build-championships-history.ts` does NOT use the shared aliases
file — it has its own `MEN_CANONICAL` / `WOMEN_CANONICAL` records. Same
two entries are swapped, plus missing USF entry. Fixing this is its own
small change; the script's `canonicalize()` has a safety net (only
applies the mapping if the target name exists in the team universe), so
the swapped entries are dead code today, and the missing entries are
why CSV names like "BYU" pass through unchanged.

### Bug 4 — venue formatting

`src/components/team-page/upcoming-event.tsx` lines 131–133 do:

```tsx
{championship.courseName} · {championship.city}
{championship.state ? `, ${championship.state}` : ""}
```

`championship.city` already contains the `, XX` suffix in some records
(e.g. "Athens, GA"), so the rendered string becomes "Athens, GA, GA".
Defensive fix: strip a trailing `, [A-Z]{2}` from `city` before
rendering. Source-data cleanup is a follow-up.

## Plan

1. Fix `scripts/team-name-aliases.json`: flip BYU/ETSU entries; add
   USF and Pine Bluff entries to both genders.
2. Re-canonicalize the existing `src/data/regionals-rich.json` in place
   using the corrected aliases (one-off Python script using the same
   helper logic as `build-regional-history.py`). This avoids needing
   sheet access for this session — future ingests will produce correct
   names automatically once the alias file is fixed.
3. Fix `scripts/build-championships-history.ts` (flip swapped entries,
   add new ones) and rebuild `championships-history.json` if the
   `/tmp/ncaa_sheet_dump/*.csv` source files are still present;
   otherwise re-canonicalize the existing JSON in place using the same
   approach as step 2.
4. Patch `upcoming-event.tsx` to strip a trailing `, XX` state code
   from `championship.city` before rendering.
5. Build + lint + push.

## Out of scope

- The `Arkansas Pine Bluff` (women) vs `Arkansas-Pine Bluff` (men)
  inconsistency in the canonical data files. Both names are accepted
  here; David's "duplicate row" bug is addressed by canonicalising
  "Pine Bluff" specifically.
- The "SW Louisiana" / "Southwest Louisiana" / "Southern Louisiana"
  family of historical names — separate cleanup, not flagged.
- Source-side fix for `championship.city` containing the state suffix.
  Defensive rendering fix is enough for now.

## Wrap

Six commits on `ron/fix-team-alias-leakage`:

1. `7abdec3` — Session doc.
2. `fb53728` — `scripts/team-name-aliases.json`: flip BYU/ETSU entries
   to the correct sheet→canonical direction; add USF and Pine Bluff
   entries (men + women).
3. `f118f25` — One-off `canonicalize-regionals-rich.py` rewrites
   `src/data/regionals-rich.json` in place using the corrected aliases.
   214 row diffs in the JSON. Pine Bluff row dedupes to one.
4. `ba9138b` — `scripts/build-championships-history.ts` (which carries
   its own alias map, not the shared JSON) gets the same BYU/ETSU/USF
   fix; plus `canonicalize-championships-history.py` re-runs the
   canonicaliser against the existing JSON. Net effect: `/championships-
   history` BYU/ETSU/USF rows now route to the right team page.
5. `373bafc` — `upcoming-event.tsx` strips a trailing `, XX` from
   `championship.city` before rendering, fixing the "GA, GA" doubling.
6. `16835bb` — **Defensive runtime predicate.** Even after the JSON
   files are canonical, external feeds (David's sheet, future ingests)
   freely interleave alias and canonical forms. New
   `src/lib/team-aliases.ts` exposes `canonicalizeTeamName()` +
   `teamMatches()`, which wrap `scripts/team-name-aliases.json` (the
   shared source of truth). `streaks.ts` (regionals + championships +
   regionalsRich filters) and the team page (history, ncaaHistory,
   richByYear filters) now use `teamMatches` instead of raw `===`.
   Comparisons against canonical lists (rankings, all-teams, scurve
   assignments) are unchanged — both sides are already canonical there.

### Diff vs `dev`
```
 docs/sessions/2026-04-29-fix-team-alias-leakage.md |  98 ++++++++++
 scripts/build-championships-history.ts             |  26 ++-
 scripts/canonicalize-championships-history.py      |  70 +++++++
 scripts/canonicalize-regionals-rich.py             |  67 +++++++
 scripts/team-name-aliases.json                     |  12 +-
 src/app/teams/[gender]/[slug]/page.tsx             |   7 +-
 src/components/team-page/upcoming-event.tsx        |   9 +-
 src/data/championships-history.json                |   2 +-
 src/data/regionals-rich.json                       | 214 ++++++++++-----------
 src/lib/streaks.ts                                 |  12 +-
 src/lib/team-aliases.ts                            |  70 +++++++
 11 files changed, 457 insertions(+), 130 deletions(-)
```

### Verification
- `npx tsc --noEmit` clean after each edit.
- Vercel preview: <https://collegegolfdata-la4zoomea-mikkelgolfs-projects.vercel.app>
  (David spot-checked /championships-history, /regionals, the affected
  team pages.)

### Open questions / follow-ups
- **`Arkansas Pine Bluff` (women) vs `Arkansas-Pine Bluff` (men)**
  inconsistency in the canonical data is still there. Out of scope for
  this session, but worth a one-line cleanup in a future pass.
- **`SW Louisiana` / `Southwest Louisiana` / `Southern Louisiana`** —
  same family of historical aliases not yet handled. No bug reported
  yet, so leaving alone.
- **`championship.city` source data** still contains a `, XX` suffix in
  some records. Defensive rendering covers it; cleaning the source CSV
  is a small follow-up, but not urgent.
- **Future ingest scripts**: any new feed reader should resolve through
  `scripts/team-name-aliases.json` (Python build-time path) AND any new
  runtime filter should use `teamMatches()` from `src/lib/team-aliases.ts`.
  The two paths share the same JSON, so they stay in sync.

