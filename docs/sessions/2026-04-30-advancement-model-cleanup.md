# Advancement model cleanup

**Started:** 2026-04-30T06:48:23Z
**Wrapped:** 2026-04-30T07:21:50Z
**Requester:** David Tenneson
**Branch:** ron/advancement-model-cleanup
**Base:** dev
**Status:** wrapped

## Task
advancement model cleanup

## Actions

Four UI/data fixes to the Advancement Model page (`/advancement`), all
landing in `src/components/advancement-bars.tsx` plus a small change in
`src/lib/projections-apply.ts`.

1. **La Costa field split layout** — desktop view of the "Projected La
   Costa Field" was using `grid-cols-2` which fills row-by-row, putting
   ranks (1, 3, 5…) on the left and (2, 4, 6…) on the right. Switched
   to a CSS multi-column layout (`sm:columns-2`) so the top half of the
   sorted field stacks on the left and the bottom half on the right.
   Added `break-inside-avoid` + `w-full` to the buttons so each one
   stays intact in its column.

2. **Designated vs near-host distinction** — the model uses a 30-mile
   radius (`HOST_RADIUS_MILES` in `projections-apply.ts`) to flag any
   team within driving distance as `isHost = true` for the probability
   lift. The UI was treating both designated host schools (e.g. North
   Carolina at Chapel Hill) and incidentally-nearby teams (e.g. NC
   State, 22 mi away) the same — both got the bold "H" badge. Now:
   - Designated host (in `hostColorByTeam`): bold "H" badge + host
     color on the bar fill, tooltip "Tournament host".
   - Near-host: `MapPin` glyph in the bar row + tooltip showing the
     distance from the venue.
   - Every other team: unchanged.

   The icon is hoisted to a `NEAR_HOST_ICON` constant at the top of the
   file so it can be swapped to any other lucide-react glyph in one
   line.

3. **Δ column color coding** — the position-vs-seed delta column now
   uses color and weight to highlight the swings that matter for
   advancement:
   - Δ = 0 → muted tertiary (unchanged).
   - Δ > 0 → green: bright + bold for cinderella jumps (outside top 5
     by seed → inside top 5 by projection); softer green for any other
     positive delta.
   - Δ < 0 → red: bright + bold for "flops" (top-5 seed falling outside
     the top 5); softer red for any other negative delta.

   Uses the project's semantic `success` and `destructive` tokens at
   full opacity for the bright variants and ~65–70% opacity for the
   muted variants, so dark/light mode behavior stays consistent.

4. **Modal "NEARBY" tag + 50-mi display threshold** — the team detail
   modal still said "HOST" for incidentally-nearby teams. Updated to
   match the bar-row treatment: designated host shows "HOST" text,
   near-host shows the `MapPin` icon + "NEARBY" with the same hover
   tooltip. Bumped the **display** threshold from 30 → 50 miles via a
   new `NEAR_HOST_DISPLAY_MILES` constant in `advancement-bars.tsx`,
   intentionally decoupled from the model's `HOST_RADIUS_MILES = 30`
   so the host-lift table (trained at 30 mi) still matches the runtime
   gate that drives the probability bonus.

## Diff stats

```
docs/sessions/2026-04-30-advancement-model-cleanup.md  |  ~ added by !wrap
src/components/advancement-bars.tsx                    | 69 ++++++++++++++++---
                                                       2 files changed, 81 insertions(+), 7 deletions(-)
```

(Per `git diff --stat dev..HEAD` before the wrap commit.)

Commits on the branch:

```
65a92fc5 feat(advancement): widen nearby pin to 50mi, mark NEARBY in modal
4e5cfaee feat(advancement): color-code Δ column with cut-line emphasis
ccf32c7d feat(advancement): distinguish near-host teams from designated hosts
04c4460d fix(advancement): split La Costa field by halves, not alternating rows
7e71de4e chore(sessions): start advancement-model-cleanup
```

## Open questions / learnings

- **Display vs model thresholds** — `HOST_RADIUS_MILES` in
  `src/lib/projections-apply.ts` is locked to the value the host-lift
  table in `src/data/projections/host-lift.json` was trained on
  (30 mi, see `scripts/build-projections-data.ts:63`). Changing the
  runtime threshold without retraining would apply the host-lift bonus
  to teams outside the training distribution and quietly distort the
  Final %. The new `NEAR_HOST_DISPLAY_MILES = 50` is purely cosmetic —
  if we ever decide that 50 miles is genuinely the right cutoff for
  the model too, we'd bump the constant in
  `scripts/build-projections-data.ts` and rerun the build to
  regenerate `host-lift.json`.
- **Cinderella vs flop symmetry** — `cinderella` was already a named
  prop on `BarRow`; introduced `flop = !advances && team.seed <=
  TEAMS_ADVANCING` inline as the inverse, but didn't promote it to a
  top-level type or hoist it into `projections-apply.ts`. If we start
  using "flop" elsewhere (e.g. methodology copy, exports), worth
  centralising.
- **No legend update** — the new `MapPin` and color-coded Δ aren't
  reflected in the `Legend` component on the page. The hover tooltips
  carry the explanation, and the existing legend already skipped the
  "H" badge, so I kept the row uncluttered. Worth a UX call later if
  the page grows.
- **Mobile layout** — the La Costa field stays single-column on mobile
  (`<640px`) regardless of which 2-column flow we pick on desktop, so
  the columns/grid choice only affects sm+. No regression.

## Preview

- Last preview deployed during the session:
  `https://collegegolfdata-7o9lfyl0h-mikkelgolfs-projects.vercel.app`
