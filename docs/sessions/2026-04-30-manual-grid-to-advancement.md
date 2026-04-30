# Allow for bringing the Manual Grid selections over to the Advancement Model

**Started:** 2026-04-29T22:20:02Z
**Wrapped:** 2026-04-30
**Requester:** David Tenneson
**Branch:** ron/manual-grid-to-advancement
**Base:** dev
**Status:** wrapped

## Task
Allow for bringing the Manual Grid selections over to the Advancement Model.
Grew over the session into a broader Manual Grid overhaul: a live
Advancement Model subtab driven by the user's grid, a Full D1 Breakdown
SUB subtab with click-to-swap, championship-aware AQs, isolated AQ
overrides per session, row-click AQ changes with rank-based cascade, and
a Reset All Committee/Actual picker.

## Actions

### Advancement Model subtab
- Added an Advancement Model subtab inside ManualGridSection — driven
  entirely by the user's current grid assignments (not the strict
  S-curve), so manual swaps and AQ overrides flow through to the
  model immediately.
- Live recompute on every grid change.

### Full D1 Breakdown — SUB subtab
- Added a Breakdown subtab inside ManualGridSection ("SUB" in the tab
  bar) that lists every D1 team with their current grid status.
- Click an out-of-field team → modal asks which in-field team to swap
  out. Modal previews displaced AQ + worst at-large.
- Mobile sizing pass on the SUB modal: bottom-anchored, stacked layout,
  conference badges, smart Replace default.

### AQ handling
- Reconciled championship winners with predicted top-of-conference AQs
  via championship-aware AQ flags in the manual grid.
- Isolated AQ overrides per Manual Grid session via an `aqOverrides`
  Map<conference, teamName>, so a user-driven AQ change doesn't leak
  into the underlying S-curve.
- Click an AQ team in the Full Breakdown → modal lets the user pick a
  different team in that conference to be the AQ. Cascading rank-based
  recompute reseats teams correctly.
- Row-click AQ change directly from the Full Breakdown rows.
- **Bug fix (SMU repro):** after a successful Promote to AQ → Reset
  Last, the next AQ click on the same conference would silently fail
  because `aqOverrides` still pointed at a team no longer in the grid.
  Fixed by ignoring stale overrides in `overriddenGridAssignments`
  when the override target isn't in the field.

### Reset All — Committee vs Actual picker
- Reset All now opens a "Reset Manual Grid" modal when an Actual NCAA
  bracket exists for the current gender (women, currently). Committee
  is the primary default; Actual is the alternate.
- Men's grid still resets straight to Committee (no Actual bracket yet).
- Initial page load still uses Committee — unchanged.
- `actualSelections` plumbed from parent ScurveTable through
  ManualGridSection into ManualGridTable, mirroring how championships
  data flows.

## Diff stats
```
docs/sessions/2026-04-30-manual-grid-to-advancement.md   |   19 +
src/components/manual-grid-table.tsx                     |  215 +++-
src/components/scurve-table.tsx                          | 1093 +++++++++++++++++++-
src/lib/scurve.ts                                        |    5 +-
4 files changed, 1304 insertions(+), 28 deletions(-)
```

13 commits on top of dev (incl. session-doc bookends).

## Open questions / learnings

- **Stale overrides pattern:** Whenever per-session state (like
  `aqOverrides`) keys off team names, every consumer that maps over
  current assignments has to defensively skip entries pointing at
  teams that aren't in the field anymore. Reset Last is the most
  obvious mutation that orphans overrides; gender switches and full
  resets clear them entirely, which is why the bug only showed up in
  one specific sequence.
- **"Full-screen" symptom on the SUB modal:** David flagged that the
  SUB modal looked wrong (full-screen) right after Reset Last in the
  broken state. Hypothesis: the broken state hid the Promote checkbox
  section and the modal's height collapsed oddly. Not separately
  diagnosed — should self-resolve now that Reset Last leaves AQs in
  a sane state. Worth re-checking if it ever reappears.
- **Actual bracket coverage:** `actualMen2026` is empty (men's bracket
  not announced yet); `actualWomen2026` has 72 selections. The picker
  modal's visibility logic keys off `actualSelections.length > 0`,
  so men's Reset All stays single-click until the men's bracket
  drops — at which point the picker shows up automatically with no
  code change needed.
