# manual-winner-entry

**Started:** 2026-04-24T00:00:00Z
**Wrapped:** 2026-04-24T15:10:00Z
**Requester:** David Tenneson
**Branch:** ron/manual-winner-entry
**Base:** dev
**Status:** pr-open — awaiting Mikkel sign-off + guardrail amendment

## Task
Add a `scripts/apply-manual-winner.sh` script that lets a human-supplied
conference winner (told to Ron in Discord) flow through the same validate
→ commit → push-main → vercel-prod pipeline as the automated cron
(`scripts/update-conference-winner-on-demand.sh`).

Why: conference championships end on specific days and Mikkel wants them
on the live site immediately. The automated cron requires Clippd's
leaderboard page to return row-1 team data, which sometimes lags. A
manual path lets David/Mikkel push a known result straight through.

This script requires a **guardrail amendment** in Ron's system prompt to
add a narrow named-script exception to the "never push to main" rule.
That edit is Mikkel's — this session just builds the script + PRs it to
`dev`. Mikkel reviews, merges `dev → main`, and updates Ron's prompt in
the same sitting.

## Actions
1. Wrote `scripts/apply_manual_winner.py` — the edit-only helper. Given
   `--conference CODE --gender men|women --winner "Team"`, it:
   - Loads `all-teams-{gender}-2026.ts` and validates the team name is
     a known string (case-sensitive; emits a "did you mean …?" hint on
     mismatch).
   - Finds the championship block in `championships-{gender}-2026.ts`
     by conference code (brace-balanced regex).
   - Updates an existing `winner:` field or inserts a new one just
     before the closing brace, preserving the trailing-comma style used
     by neighboring entries.
   - Refuses to overwrite a different existing winner without `--force`;
     with `--allow-noop`, silently exits 0 when the value is already set.
   - Emits a single JSON line on stdout describing the edit (used by the
     shell wrapper for the commit message + Discord summary).
2. Wrote `scripts/apply-manual-winner.sh` — the orchestrator that
   mirrors `update-conference-winner-on-demand.sh` step-for-step:
   - 0. Kill switch + dirty-tree + binary checks.
   - 1. `git fetch && checkout main && pull --rebase`.
   - 2. Run the Python helper, capture JSON descriptor.
   - 3. Run `npx tsx scripts/verify-championships.ts`; rollback TS on
     failure.
   - 4. Synthesize `/tmp/champion-report-manual-*.json` with the single
     winner in `autoConfirmed` so `post_daily_summary.build_success_message`
     renders it identically to a cron-applied winner.
   - 5. `git add + commit + push origin main + vercel --prod --yes`.
   - 6. Post Discord summary with commit SHA + deploy URL.
   - `--dry-run` skips git+vercel and tree-reverts the TS edit so the
     working copy stays clean.
3. Dry-run tested five paths, all behave correctly:
   - Success: edit applied, `verify-championships.ts` passes, synthetic
     report + Discord summary renders.
   - Bad conference code → rc=1, clear error, failure summary path.
   - Bad team name → rc=1, case-insensitive hint.
   - No-op (winner already matches) → rc=0, skips commit/deploy, posts a
     "nothing to commit" note.
   - Overwrite without `--force` → rc=2 from Python, shell treats as
     hard failure.
4. Committed both scripts in `447f200`, pushed to `origin
   ron/manual-winner-entry`.

## Diff stats
```
 docs/sessions/2026-04-24-manual-winner-entry.md |  (this file)
 scripts/apply-manual-winner.sh                  | 279 ++++ (new, executable)
 scripts/apply_manual_winner.py                  | 201 ++++ (new, executable)
```

## Open questions / learnings
- **Guardrail amendment required (Mikkel only).** This script
  deliberately pushes to `main` and runs `vercel --prod`. The current
  system prompt says "Never push to main/master" and "Never run
  `vercel --prod` unless explicitly asked in-message". We need a narrow
  named-script exception for *this* script plus
  `update-conference-winner-on-demand.sh` and
  `update-rankings-on-demand.sh` (the cron-style counterparts). Draft
  wording is in the Mikkel summary Ron posted to Discord.
- **Team-name canonicalization is the weakest link.** The Python helper
  accepts only exact strings already present in
  `all-teams-{gender}-2026.ts`. If Mikkel/David type "Queens Charlotte"
  instead of "Queens-Charlotte", we reject. That's intentional — the
  wrapper shouldn't silently guess — but it means the caller has to
  know the canonical spelling. If this becomes painful, add a
  "--suggest" mode that prints near-matches and exits 0 without
  editing.
- **Discord summary synthesis.** We build a synthetic
  `champions_report` so the human-entered winner flows through the same
  Discord formatter as the automated cron. This keeps `ron-collegegolfdata`
  channel output visually consistent regardless of how a winner landed.
  Trade-off: the synthesized JSON is discarded after one use, so
  anything looking for audit history still needs to go through git.
- **The automated cron is the correct default.** Manual entry is for
  the ~1–3 championships/year where Clippd lags or the source URL
  changed format. Expectation: manual entry is rare; when automated
  works, it's preferred because it carries a Clippd confirmation
  receipt via the sourceUrl check.
