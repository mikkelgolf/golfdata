# Map dialogue in the way in certain instances on desktop

**Started:** 2026-04-28T20:26:25Z
**Requester:** David Tenneson
**Branch:** ron/map-dialogue-desktop
**Base:** dev
**Status:** wrapped — merged to dev

## Task
map dialogue in the way in certain instances on desktop

Specifically: clicking a conference on the Conference Championships > Map
tab opened the desktop info card, which was hardcoded to the top-right.
For most D1 conferences (SEC, ACC, Big Ten, etc.) the venue + travelling
teams cluster on the East Coast, so the card sat right on top of the
highlighted dots.

## Actions
- Added two pieces of behaviour to `src/components/championships-map.tsx`:
  - **Auto-side placement.** Compute the centroid of (active venue x +
    every active team's x) in SVG coordinates. If that centroid is east
    of the SVG midline, anchor the card to `top-left` instead of
    `top-right`. East-Coast clusters now get a left-anchored card so the
    dots stay visible.
  - **Drag-to-override.** Wrapped the title block (championship name /
    course / city / date) in a pointer-drag handle with a small
    mobile-style pill indicator and `cursor-grab`. Drag tracks via
    `setPointerCapture`, with the resulting pixel offset clamped to the
    map container so the card can't leave the visible area. Override
    resets on every championship selection so auto-side takes over for
    the next pick.
- Kept the team table scroll and the "Clear selection" button outside
  the drag handle so they keep working normally.
- Verified with `tsc --noEmit` and `eslint` (both clean).
- Deployed to preview:
  https://collegegolfdata-rhckrzti8-mikkelgolfs-projects.vercel.app

## Diff stats
```
docs/sessions/2026-04-28-map-dialogue-desktop.md |  19 +++
src/components/championships-map.tsx             | 182 ++++++++++++++++++++---
2 files changed, 182 insertions(+), 19 deletions(-)
```
Commits:
- `a95af135` chore(sessions): start map-dialogue-desktop
- `82143251` fix(championships-map): smart-place + drag desktop info card

## Open questions / learnings
- No explicit "Reset position" affordance — instead the user's manual
  drag offset is dropped whenever a different championship is selected.
  If users miss this, easiest follow-up is a small "Reset" button in
  the dialog header that clears `userDialogPos`.
- Centroid threshold is a flat `SVG_WIDTH / 2`. Worked well for typical
  conference clusters; if a coast-to-coast conference (post-realignment
  Big Ten/ACC) ends up centred near the midline, behaviour can flicker
  between selections. A small bias toward the default right side
  (e.g. `> 0.55 * SVG_WIDTH` to flip left) would smooth that out.
- Mobile bottom sheet was untouched — task scoped to desktop.
