# Session: Redefine "Advanced as underdog" using `expectedAdv`

- **Date:** 2026-04-28
- **Branch:** `ron/underdog-expected-adv`
- **Requester:** David Tenneson (Discord: collegegolfbook)

## Task

The "Advanced as underdog" stat in the Team page's REGIONAL PERFORMANCE
section is currently calculated as:

```ts
seed >= 5 AND team appeared at NCAAs that year
```

(see `src/app/teams/[gender]/[slug]/page.tsx:371-373`)

The same definition powers the `/regionals-leaderboard` board
(see `src/app/regionals-leaderboard/page.tsx:107-114`).

The `expectedAdv` boolean (sourced from the spreadsheet's "Expected to Adv"
column) is ingested via `scripts/build-regional-history.py:168` and stored on
every row in `src/data/regionals-rich.json`, but is **not currently used** in
the underdog calculation. ~1,308 of ~4,657 rows have a non-null `expectedAdv`
value.

David wants to swap the underdog definition over to use `expectedAdv` so the
stat reflects what was actually expected by the committee/seeding process,
rather than a blunt seed-bucket threshold.

## Open questions (to confirm before coding)

1. **New definition:** is "advanced as underdog" =
   - (a) `expectedAdv === false` AND advanced (rows where the field is
     explicitly false), OR
   - (b) `expectedAdv !== true` AND advanced (treat null/missing as "not
     expected"), OR
   - (c) something else?
2. **Fallback for null `expectedAdv`:** for older years where the spreadsheet
   field isn't filled in, do we (i) fall back to the old seed-based rule,
   (ii) exclude those rows entirely from the count, or (iii) treat null as
   "not expected"?
3. **Scope:** apply the change to both the team page tile AND the
   `/regionals-leaderboard` board, right? (assuming yes)

## Plan (pending answers above)

- Update the filter in `src/app/teams/[gender]/[slug]/page.tsx`
- Mirror the change in `src/app/regionals-leaderboard/page.tsx`
- Spot-check a few teams locally to make sure the new counts look sane
- Update the tooltip / label on the tile if the definition changes meaningfully
- Wrap with PR

## Progress log

- 2026-04-28: branch + session doc created, awaiting definition confirmation
