# Label Regionals Rankings

**Started:** 2026-04-29T03:32:14Z
**Wrapped:** 2026-04-29T18:50Z
**Requester:** David Tenneson
**Branch:** ron/label-regionals-rankings
**Base:** dev
**Status:** wrapped

## Task
Capture and label specific rankings as the canonical ones used for Regional Predictions — so the page reads from a pinned, dated snapshot rather than always-latest live data, and the label on screen makes the source explicit.

## Actions

### 1. Archive + active-pin system (commit `bfc25ea4`)
- New `src/data/rankings-archive/{men,women}/YYYY-MM-DD.ts` per-snapshot files (one per gender per date).
- Per-gender `index.ts` aggregates with `latestDate{Men,Women}` exports.
- New `src/lib/rankings-archive.ts` with `loadActiveSnapshot(gender)` — reads `src/data/active-rankings.json` to find a pinned date or falls back to latest.
- New `scripts/set-active-rankings.ts` CLI to flip the pin per gender.
- New `scripts/snapshot-rankings.ts` with three modes: `--from-live` (writes today's snapshot from `src/data/rankings-{men,women}.ts`), `--from-clippd-json <path>` (historical backfill), `--regen-index` (rebuild index files only).
- `daily-refresh.sh` extended to call snapshot-rankings on every successful Clippd pull (step 2b').
- Backfilled archive entries: men 04-12/04-13/04-15/04-23/04-27/04-28; women same set.

### 2. Homepage label simplification (commits `9dfe6202`, `57b51afe`, `a896666e`, `941c47ce`)
- Changed "Latest Rankings: Men 4/28 · Women 4/28" → single gender-aware "Official NCAA rankings from: Apr 28, 26".
- New `src/components/active-rankings-date.tsx` — tiny client component reading `?gender=` URL param to switch between men/women dates. Wrapped in `<Suspense>` so static prerender still works.
- Header date visible on both desktop and mobile (was desktop-only).
- Pinned men's active to `2026-04-28` (NCAA didn't publish on 04-29).

### 3. Drop spurious 04-29 + dedup (commit `7106109e`)
- Removed `src/data/rankings-archive/{men,women}/2026-04-29.ts` (NCAA didn't publish that day; Clippd's pull was a between-publication noise capture).
- Wired option-a: content fingerprint (SHA-256 over substantive fields — events / W-L-T / AQ / eventsWon / eventsTop3, sorted by team) skips writing when today's live data matches the previous archive entry.
- Stubbed option-b: `isPublicationDay(date, gender)` returns `true` for now, gated by new `--require-publication-day` flag in snapshot-rankings, which `daily-refresh.sh` now passes. When the NCAA publication calendar lands, just fill in the function — no other plumbing changes needed.
- New `--force` flag bypasses dedup for testing / manual edits.

### 4. Couple genders + manual bypass (commit `b88d43d3`)
- Refactored `snapshotFromLive` to a two-phase decide-then-write: if EITHER gender's fingerprint changed, write BOTH archive entries (keeps archive symmetric for future date-picker UX).
- Distinguished "soft skip" (fingerprint match — overridable by coupling) from "hard skip" (publication-day gate — NOT overridable). Today's stub keeps the hard skip dormant; structure is ready for option-b.
- Strengthened `contentFingerprint` docstring + added `n=<count>` prefix to body so add/remove-team also flips the hash.
- New `--force-snapshots` flag in `daily-refresh.sh` parsing → translates to `--force` for snapshot-rankings.
- `update-rankings-on-demand.sh` now always injects `--force-snapshots`, so manual `!update-rankings` runs always create an official archive entry. Nightly cron unchanged (skips the flag, dedup still active).
- Verified all four coupling scenarios + force flag + hard-skip semantics with a 17-check smoke test (all pass; test removed after run).

## Diff stats vs dev
- 27 files changed, ~60.5k insertions, 31 deletions (the bulk of insertions = archived snapshot TS files + the three Clippd raw JSONs that got backfilled).
- Code-level changes (excluding the archive snapshots themselves): 15 files, ~57k lines including the bundled Clippd JSONs. Just looking at TS/script edits: ~1.4k lines.
- Touched scripts: `daily-refresh.sh`, `update-rankings-on-demand.sh`, `snapshot-rankings.ts` (new), `set-active-rankings.ts` (new).
- Touched UI: `src/app/page.tsx`, `src/components/active-rankings-date.tsx` (new), `src/components/scurve-table.tsx`.
- New library code: `src/lib/rankings-archive.ts`.
- New data: `src/data/active-rankings.json`, archive entries (men 6 dates, women 6 dates), three backfill JSONs in `data/clippd/`.

## Open questions / learnings

### Option-b is the natural follow-up
The dedup we shipped (option-a) only catches the trivial case where Clippd returns substantively identical data. The real "Clippd ingested new tournaments overnight but NCAA didn't publish a new ranking" case is what option-b handles. To wire it:
1. Encode NCAA's publication calendar into `isPublicationDay(date, gender)` in `scripts/snapshot-rankings.ts` (currently a `return true;` stub).
2. Confirm whether men's and women's calendars are identical or differ in practice.
3. Once filled in, no other plumbing changes — `daily-refresh.sh` already passes `--require-publication-day`.

David said this would be "utilized very soon" but didn't request it this session.

### Archive size is going to grow
Each snapshot is ~300 rows × ~150 chars/row × 2 genders ≈ 90KB of TS per day. At 30-50 publication days per season that's ~3-4MB/season. Manageable for now but worth tracking. If it becomes an issue, the snapshot files could be JSON instead of TS (smaller, no syntax overhead) and loaded via dynamic import — but then we lose the static-import compile-time guarantees `loadActiveSnapshot` currently has.

### Future UI: snapshot picker
The header label "Official NCAA rankings from: Apr 28, 26" is structured to evolve into a dropdown / date GUI once historical rankings can be selected. The `<ActiveRankingsDate>` component already reads `?gender=` from the URL — extending to a pin-override URL param (e.g. `?date=2026-04-13`) is straightforward. The page would need to switch from `loadActiveSnapshot(gender)` (server-side, build-time) to a client-side fetch or a server component that respects the param.

### Sanity gate at 75% may be tight for first-of-season
Sanity gate in `daily-refresh.sh` was raised to 75% on 04-23 after Tulsa's 10→11 events cascaded through 63% of women's rankings rows. Worth re-tightening once the regular-season refresh cadence stabilizes.

## Linked PR
https://github.com/mikkelgolf/golfdata/pull/33
