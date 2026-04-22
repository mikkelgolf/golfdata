# Session: Team-page coord backfill (Houston / Arkansas State / Little Rock et al.)

- **Status:** wrapped
- **Date:** 2026-04-22
- **Branch:** direct-to-`dev` (retro session doc on `ron/team-page-coords`)
- **Base:** `dev` (fork point `ccc2e17` — "Regenerate regionals-rich.json with women's Regional data")
- **Started:** 2026-04-22T05:45:00Z
- **Ended:** 2026-04-22T06:15:00Z
- **Requester:** David Tenneson (collegegolfbook on Discord)

## Task

David flagged that team pages for Houston, Arkansas State, Little Rock
(and, it turned out, many more) projected their campus pin at the wrong
place — typically `(0°, 0°)`, off the Gulf of Guinea — even though the
Conference tab and Regionals-prediction surfaces showed the same teams
in the right spot. Root-cause and ship the fix. Per David's explicit
instruction, commit direct to `dev` rather than running the usual
`!new` / PR flow.

### Root cause

`findTeam` in `src/app/teams/[gender]/[slug]/page.tsx` looked up the
team in `rankings-*.ts` first and fell back to `all-teams-*-2026.ts`.
The Clippd export that seeds `rankings-*.ts` ships `lat: 0, lng: 0`
for every team whose coordinates weren't resolved upstream — 251 men
and 228 women. `all-teams-*-2026.ts` is campus-precise. So team pages
always hit the zero-coord record; every other surface (Conference tab,
Regionals-prediction) read `all-teams-*` and was fine.

## Actions

One commit against `dev`:

- `3f8ff41` Fix team-page coords: backfill rankings-*.ts from
  all-teams-*.ts
  - **Data backfill**: for every `lat: 0, lng: 0` row in
    `rankings-men.ts` / `rankings-women.ts`, join on `team` against
    `all-teams-men-2026.ts` / `all-teams-women-2026.ts` and substitute
    the campus-precise coord pair. Replaced 251 men + 226 women via
    the automated join.
  - **Manual fills** (women's, no match in `all-teams-women-2026.ts`):
    - Duquesne → Pittsburgh campus `40.4361, -79.9927`
    - Saint Josephs → Philadelphia `40.0354, -75.2435` (matches the
      men's `Saint Joseph's (PA)` entry)
  - **Defensive code change**: hardened `findTeam` so a rankings hit
    with `lat=0, lng=0` merges the coord fields from `all-teams-*`.
    Catches future Clippd regens that might reintroduce zero-coord
    rows before a data backfill runs.
  - **Verification**: `npx tsx scripts/verify-team-coords.ts` → PASS
    (Idaho, Idaho State, CSU Northridge known-good spot checks pass).
    `npx tsc --noEmit` → clean.
  - **Preview**: https://collegegolfdata-9wj93qj7n-mikkelgolfs-projects.vercel.app

## Diff stats

Against `ccc2e17...HEAD` (session scope on `dev`, pre-wrap-doc commit):

| File | Δ |
| --- | --- |
| `src/app/teams/[gender]/[slug]/page.tsx` | +13 / -3 (`findTeam` merge logic) |
| `src/data/rankings-men.ts` | 251 rows edited (coord substitution) |
| `src/data/rankings-women.ts` | 228 rows edited (coord substitution) |

Total: 3 files, 490 insertions / 484 deletions. The +/- is skewed
because every edited row reprints the full TypeScript object literal
on the same line; the meaningful change is always just the `lat: …,
lng: …` pair.

## Open questions

- **Duplicate coords (21 pairs)** — `verify-team-coords.ts` warns that
  21 coordinate pairs are shared by 2+ teams: San Diego / UC San Diego,
  Texas El Paso / UTEP, Central Michigan / Eastern Michigan, Samford /
  UAB, Oral Roberts / Tulsa, and 16 more. These are pre-existing
  upstream duplicates from the Census/Supabase geocode step, not
  regressions from this change. Worth disambiguating in a follow-up
  (resolve via `scripts/build-all-teams.mjs`'s `SCHOOL_COORDS` map or
  equivalent per-school overrides).
- **Clippd → rankings-*.ts regen risk** — the Clippd export process
  that populates `rankings-*.ts` drops zero-coord rows for unresolved
  teams. The defensive `findTeam` change mitigates the map-projection
  symptom, but the underlying data file will still carry zeros after
  a fresh regen. Options: (a) fold a coord-backfill step into whatever
  regenerates `rankings-*.ts`; (b) have the team page always prefer
  `all-teams-*` for coord fields.
- **Duquesne / Saint Josephs canonical names** — the women's rankings
  file uses `"Saint Josephs"` (no apostrophe, no PA suffix) while the
  men's side uses `"Saint Joseph's (PA)"`. Same school. The regionals
  pipeline presumably already normalises them, but worth a pass to
  canonicalise before any future cross-gender join surface.

## Bypass note

This session deliberately bypassed the `!new`/feature-branch flow at
David's explicit request ("Do everything you suggested, but do it
directly into the dev branch"). The single code commit (`3f8ff41`)
landed on `dev` directly. This session doc is retrospective: it lives
on `ron/team-page-coords` so the wrap has a reviewable home without
modifying `dev` a second time.
