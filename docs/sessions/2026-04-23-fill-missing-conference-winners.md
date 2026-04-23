# Fill missing conference championship winners

- **Date:** 2026-04-23
- **Requester:** Mikkel (Discord: mikkelgolf)
- **Branch:** `ron/fill-missing-conference-winners`
- **Base:** `dev`
- **Status:** wrapped

## Task

Check the conference winners on `main` and QA (via web search) the winners of conference championships that have **finished** but are **missing a winner** on the live site.

## Scope of missing winners (as of 2026-04-23)

Championships whose `endDate` is before today and whose `winner` field is unset.

**Men's (1):**
- SOUTHLAND (ended Apr 22)

**Women's (6):**
- BSOUTH, CUSA, WAC, BSKY, SOCON, CAA (all ended Apr 22; CAA's listed date range was a placeholder — actual dates were Apr 16–19)

## Winners found via web search

| Conf | Gender | Winner | Key source |
|---|---|---|---|
| SOUTHLAND | M | UTRGV | goutrgv.com |
| BSOUTH | W | High Point | highpointpanthers.com |
| CUSA | W | Western Kentucky | bgdailynews.com |
| WAC | W | Tarleton State | wacsports.com |
| BSKY | W | Northern Arizona | nauathletics.com |
| SOCON | W | Furman | catamountsports.com (final results PDF) |
| CAA | W | Charleston | caasports.com |

## Additional data fix
CAA women's championship had placeholder venue/dates. Actual: **The Reserve Club at St. James, Southport, NC (lat 34.0188, lng -78.0389), Apr 16–19**. Updating venue, coords, dates, and removing placeholder `notes`.

## Team-name alignment
All seven winners verified to match exact strings in `rankings-men.ts` / `rankings-women.ts`:
- Men: `UTRGV`, `Arkansas-Pine Bluff` (existing)
- Women: `High Point`, `Western Kentucky`, `Tarleton State`, `Northern Arizona`, `Furman`, `Charleston`

## Actions

- Web-searched each of the 7 missing winners and cross-checked against primary conference / athletic-department sources.
- Verified every winner string against `src/data/rankings-men.ts` and `src/data/rankings-women.ts` so the championship → team join will resolve on the map / rankings views.
- Updated `src/data/championships-men-2026.ts`:
  - SOUTHLAND: added `winner: "UTRGV"` + narrative note + authoritative `sourceUrl` (goutrgv.com).
- Updated `src/data/championships-women-2026.ts` (6 entries):
  - BSOUTH → High Point (match-play final 3-2 over UNC Asheville)
  - CUSA → Western Kentucky (repeat, +7 over Delaware)
  - WAC → Tarleton State (repeat, 889 +25)
  - BSKY → Northern Arizona (10th title, −5)
  - SOCON → Furman (894 +30)
  - CAA → Charleston — AND fixed placeholder venue/dates. Now: The Reserve Club at St. James, Southport NC (34.0188, −78.0389), Apr 17–19.
- For each update, added a one-line narrative `notes` string summarising how the title was decided, and replaced the old generic source URL with the primary recap source.
- Ran `tsc --noEmit` — clean.
- Committed as `a8204e4` and pushed branch to origin.

## Diff stats (vs `dev`)

```
 docs/sessions/2026-04-23-fill-missing-conference-winners.md | 39 +++++++++++++++++++
 src/data/championships-men-2026.ts                          |  6 ++-
 src/data/championships-women-2026.ts                        | 45 ++++++++++++++--------
 3 files changed, 73 insertions(+), 17 deletions(-)
```

Commits:
- `a8204e4` Fill missing 2026 conference championship winners

## Open questions / follow-ups

- **Men's ASUN ends today (2026-04-23)** at Kinderlou Forest. Not in scope for this session (not yet finished when the task was triaged) — worth a follow-up pass tomorrow morning.
- **Remaining women's championships in progress** on 2026-04-23: MWC (Mission Hills, ends today), MAAC (Disney Magnolia, ends today), SUNBELT (Lakewood Club, ends today). Should also be QA'd once final.
- **Big South match-play recap URL** — used the High Point athletics recap rather than a conference-level press release (conference site didn't have the final-match recap published by the time of this wrap). If bigsouthsports.com later publishes a canonical recap, consider swapping `sourceUrl`.
- **Narrative detail in `notes`.** I added 1–2-sentence summaries (score margin, individual medalist, etc.) in each championship's `notes`. If the product wants a cleaner minimal format, those can be trimmed — they're additive and safe to shorten.

## Ended

**Ended:** 2026-04-23T10:14:01Z
