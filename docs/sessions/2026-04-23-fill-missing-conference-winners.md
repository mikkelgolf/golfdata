# Fill missing conference championship winners

- **Date:** 2026-04-23
- **Requester:** Mikkel (Discord: mikkelgolf)
- **Branch:** `ron/fill-missing-conference-winners`

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
