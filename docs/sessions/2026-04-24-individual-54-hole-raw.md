# Lowest individual 54-hole raw scores record book section

**Started:** 2026-04-24T19:31:29Z
**Wrapped:** 2026-04-24T22:11:59Z
**Requester:** David Tenneson
**Branch:** ron/individual-54-hole-raw
**Base:** dev
**Status:** merged-into-dev

## Task
create a section of the record book for lowest individual 54-hole raw scores (not score-to-par which already exists)

## Actions

### Data corrections (men's book)
- **Dustin Morris** at (-22, 194): PDF's raw dump lost the leading `(`, which
  cascaded through the parser and produced a corrupted row. Fix is applied via
  the new `applyKnownCorrections` post-parse layer — robust across regenerations
  even if the raw PDF text is re-pulled.
- **Braden Thornberry** at (-18, 198): raw PDF showed `(-18, )` with no total
  strokes. 198 confirmed by David. Same correction layer.

### Structural change — two paired subsections
- Renamed "Lowest Individual 54 Hole Score" →
  **"Lowest Individual 54 Hole Score (Score to Par)"**. Slug `lowest-individual-54`
  is unchanged (no broken deep links).
- Added a new section **"Lowest Individual 54 Hole Score (Total Score)"**
  at slug `lowest-individual-54-total`, rendered immediately after the
  Score-to-Par section. Derived by flipping the `(par, total)` tuple to
  `(total, par)`. Applies to both men's and women's record books.

### Sort normalization (both sections, both genders)
- **Score to Par**: sort key is `par asc, total asc, date asc`.
- **Total Score**: sort key is `total asc, par asc, date asc`.
- Dates are pulled from `event`/`round`/`date` fields via `extractSortDate()`:
  - Numeric `M/D/YY` or `M/D/YYYY` (women's book).
  - Month-name + day + year (men's book).
  - Bare 4-digit year fallback → treated as Jan 1 of that year.
  - Nothing date-like → sorts to the top of its tie group.
- Stray `?` separators in dates (OCR artifacts like "10?31/23") are tolerated.

### Build script wiring
- `scripts/build-records.ts` now runs
  `parseBook → applyKnownCorrections → sortScoreToParSection → addTotalScoreSection`
  for each gender. Shared `parseParTotal` + `extractSortDate` helpers.

## Diff stats
```
docs/sessions/2026-04-24-individual-54-hole-raw.md |  19 +
scripts/build-records.ts                           | 255 ++++++++++++++++++-
src/data/records-men.json                          |   2 +-
src/data/records-women.json                        |   2 +-
4 files changed, 272 insertions(+), 6 deletions(-)
```
(Pre-wrap. Wrap commit adds this session doc summary on top.)

Section counts unchanged in the Score-to-Par view (men 60, women 65). The
new Total Score view mirrors those (men 60, women 65). Total record-book
entry counts: men 1727, women 7197.

## Open questions / learnings
- **Manual entries are up next.** David flagged that he has entries to add
  to the 54-hole section (and other sections). Agreed this should be its own
  feature: a general manual-overrides mechanism (e.g. `records-manual-entries.json`)
  merged into the parsed book at build time, so data corrections/additions
  apply across every section kind without code changes. Tracked for the next
  Ron session: `ron/manual-record-entries` (tentative slug).
- **pdftotext fragility.** The raw PDF extraction drops spaces and occasionally
  opening parens. `applyKnownCorrections` is the pragmatic fix for isolated
  artifacts; a broader manual-entries system will subsume it for future cases.
- **Date extractor scope.** Deliberately scoped to the 54-hole sections via the
  sort helpers. If/when other tournament sections need date-aware sorting, the
  helpers are shared and easily reused.
