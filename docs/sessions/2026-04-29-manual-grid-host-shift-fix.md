# Manual Grid header-drag: all hosts must shift, not just the dragged one

**Started:** 2026-04-29T01:32:12Z
**Requester:** David Tenneson
**Branch:** ron/manual-grid-host-shift-fix
**Base:** dev
**Status:** wrapped

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
- **First attempt (be40024a) — wrong direction.** Read the file's
  JSDoc which says _"Dragging a header reorders the column AND moves
  the cells underneath with it"_ and implemented `arrayMove` of every
  row in lockstep with `regionalIds`. This made the entire column
  travel with its header. Requester rejected it: non-host teams the
  user had manually placed should NOT travel with the regional —
  only the host team should follow its site.
- **Second attempt (e5aaba0f) — correct behaviour.** After the
  `arrayMove(regionalIds, fromIdx, toIdx)`, walk every regional in
  the new order and make sure its host sits under it. For each
  regional whose host has been displaced (because a different
  regional now occupies the host's old column), swap the host back
  into its column within the host's current row. Chain swaps
  naturally bubble any displaced non-host teams into the freed
  slots without moving them out of their row.
- Restored the `regionalMap` dependency on `handleDragEnd` (needed
  for the per-regional host lookup).

## Diff stats
2 files changed, 55 insertions(+), 25 deletions(-) vs `dev`:

- `docs/sessions/2026-04-29-manual-grid-host-shift-fix.md` (new)
- `src/components/manual-grid-table.tsx` — replaced the
  single-host-swap logic in the header branch of `handleDragEnd`
  with a per-regional host check + swap.

## Open questions / learnings
- **Read the user, not the JSDoc.** The JSDoc on this file was the
  trail of an older mental model ("entire column travels"). The
  actual requirement (only hosts follow) is different. When the
  doc and the user disagree, trust the user. Worth updating the
  JSDoc next time someone touches this file so it doesn't mislead
  the next pass.
- **Chain-swap algorithm is order-independent.** Iterating
  regionals from col 0 → N or N → 0 produces the same end state
  because each swap looks up the host's _current_ position before
  swapping. Useful invariant if this needs to be extended.
- **Non-host cells get bumped but stay in their row.** A swap moves
  the displaced non-host into the column the host vacated; the
  next iteration may bump it again. End state: non-hosts may end
  up in a different column than where they started, but never in
  a different row. Acceptable for the use case (top tier is
  mostly hosts; bumping a non-host one column over is invisible
  to the user).
