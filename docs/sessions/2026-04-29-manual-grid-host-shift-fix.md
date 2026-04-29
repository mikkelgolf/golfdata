# Manual Grid header-drag: all hosts must shift, not just the dragged one

**Started:** 2026-04-29T01:32:12Z
**Requester:** David Tenneson
**Branch:** ron/manual-grid-host-shift-fix
**Base:** dev
**Status:** in-progress

## Task
Pre-existing bug in the Manual Grid header drag-and-drop. When a regional
header is dragged to a new column position, only the dragged regional's
host gets updated — every other displaced regional keeps its old host
name even though its column has shifted.

Concrete repro (men's grid): drag the **Athens** regional header into
slot 5.
- Expected: Georgia → Athens (its host), Arizona → Marana, Texas A&M →
  Bryan, Ohio State → Columbus, Wake Forest → Bermuda Run.
- Actual: only Georgia's host updates; the other four host labels stay
  attached to the wrong column.

All hosts need to be re-evaluated against their new column positions
when a header is dragged.

## Actions
_(filled on !wrap)_

## Diff stats
_(filled on !wrap)_

## Open questions / learnings
_(filled on !wrap)_
