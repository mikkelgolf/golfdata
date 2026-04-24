# Some Team pages do not have the full Regionals year-by-year grid

**Started:** 2026-04-24T18:49:41Z
**Wrapped:** 2026-04-24T19:25:00Z
**Requester:** David Tenneson
**Branch:** ron/regionals-grid-missing-years (merged into dev, remote branch deleted)
**Base:** dev
**Status:** shipped to dev

## Task
some Team pages do not have the full Regionals year-by-year grid

## Actions

**Investigation.** Traced the team-page render pipeline. The "Year-by-year
regionals" grid in `src/app/teams/[gender]/[slug]/page.tsx` was computing
its lower bound as the team's *own* earliest historical regional appearance:

```ts
const minYear = history.length > 0
  ? history[history.length - 1].year
  : MOST_RECENT_SEASON;
```

So Illinois women (first appearance 2002) got a grid spanning 2002→2025,
while a peer that first appeared in 1993 got the full 1993→2025 width.
The grid was non-uniform across teams of the same gender — programs that
qualified later visually looked like they had less history. The NCAA
timeline a few lines below already used the gender-wide pattern; the
regional timeline just hadn't been brought in line.

**Fix v1 (commit `c22b0c5`).** Anchor `minYear` to the gender-wide earliest
regional year (1989 men / 1993 women) when the team has at least one
appearance. Pre-first-appearance years now render as the existing red
"missed" cells.

**Follow-up: Southern Utah women.** David flagged that programs with
*zero* historical appearances still hit the fallback path
(`history.length === 0` → single red cell for the most recent year).
Counted the impact: ~127 women's teams and ~100 men's teams currently
in rankings have zero historical regional appearances. v1 helped
Illinois but left a much larger cohort still inconsistent.

**Fix v2 (commit `4e08ece`).** Dropped the `history.length > 0` guard.
Now every team — appeared or not — renders the full gender-wide grid.
Programs that have never qualified show as a wall of "missed" cells,
which honestly communicates "never made Regionals" without a fallback
message. Updated the bottom-of-page empty state from "No regional or
record-book entries" to "No NCAA Regional appearances or record-book
entries" so it doesn't contradict the always-rendered grid.

**Ship.** Confirmed `dev` was 5 commits behind `main` (4 manual-winner
on-demand pushes + the PR #17 merge commit). Fast-forwarded `dev` to
`main`, then merged `ron/regionals-grid-missing-years` into `dev` with
`--no-ff`. Pushed `dev`. Deployed a fresh preview of `dev` via
`vercel deploy --yes`. Deleted the remote feature branch.

## Diff stats

Versus dev pre-merge (`451823e`), excluding this session doc:

```
 src/app/teams/[gender]/[slug]/page.tsx | 17 ++++++++++++++---
 1 file changed, 14 insertions(+), 3 deletions(-)
```

Commits on the feature branch:
- `4982c31` chore(sessions): start regionals-grid-missing-years
- `c22b0c5` fix(team-page): anchor regionals grid to gender-wide earliest year
- `4e08ece` fix(team-page): extend uniform regionals grid to zero-appearance teams
- `be692a1` Merge ron/regionals-grid-missing-years into dev (merge commit)

Build verification: `npm run build` clean both times — all 617 static
team pages regenerated without errors.

## Open questions / learnings

- **Wall-of-red for never-qualified programs.** The current v2 behavior
  shows ~33 red cells for women's teams and ~37 for men's that have
  never made Regionals. Honest and consistent, but visually loud.
  If it reads too harsh on the live preview, an alternative is a
  single summary line ("Has not appeared in NCAA Regionals,
  1993–2025") in place of the grid for zero-appearance teams.
  Left as-is pending eyeball feedback.

- **Newly-D1 programs.** Without D1-membership-year data, the wall
  of red for never-qualified teams may be technically misleading for
  programs that joined D1 recently (they didn't "miss" — they didn't
  exist yet). The page's bottom empty-state already softens this
  ("The program may be new to D1 or data is still being compiled"),
  so the framing is in place if/when the visual feedback comes back.

- **Dev/main sync gotcha.** `dev` had drifted 5 commits behind `main`
  because of the on-demand sanctioned-script pushes that go straight
  to `main`. David caught this before the feature merge — without
  catching up first, the eventual `dev`→`main` merge would have had
  a weird ancestry. Worth remembering: any time on-demand scripts
  have run since the last `dev`→`main` PR, FF `dev` to `main` before
  folding new feature branches in.

- **Local-branch-delete guardrail.** The guardrail regex
  `\bgit\s+branch\s+-D\b` matched case-insensitively, so even
  `git branch -d` (safe delete, refuses on unmerged) was blocked.
  Worked around by deleting only the remote branch
  (`git push origin --delete ...`). Local branch is still on the
  Ron host. Possible future tweak: tighten the regex so safe
  deletes pass while still blocking force deletes.
