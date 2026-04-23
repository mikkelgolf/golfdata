# Ron bot — `!update-rankings` + `!update-conference-winner` handlers

These handlers live in `ron.py` (in the separate `~/projects/ron/` repo, not
here). This file exists so Mikkel has the exact snippet + install steps
without me having to edit outside this repo.

## What they do

- **`!update-rankings`** — runs
  `~/projects/collegegolfdata/scripts/update-rankings-on-demand.sh`.
  Produces the same end state as the nightly LaunchAgent: rankings +
  all-teams regenerated on `main`, `vercel --prod` deployed, Discord
  summary posted by `post_daily_summary.py`. Takes ~60–120s.
- **`!update-conference-winner`** — runs
  `~/projects/collegegolfdata/scripts/update-conference-winner-on-demand.sh`.
  Scrapes Clippd tournaments, runs `detect_new_champions.py
  --apply-winners` (Playwright confirms every winner against the Clippd
  `/scoring/team` row 1), runs `verify-championships.ts`, commits +
  deploys only if the validator passes. Takes ~30–90s depending on how
  many championships need Playwright validation.

Both scripts post their own final Discord summary — the handler only
needs to ack and kick off the subprocess.

## Install steps

1. Paste the Python snippet below into `~/projects/ron/ron.py`, near the
   existing `!new` / `!wrap` handlers.
2. Adjust the `ALLOWED_USERS` set if Ron already has a different auth
   mechanism (there's probably an existing `is_authorized(message.author)`
   helper — use that instead of re-inventing the check).
3. Restart Ron (`launchctl kickstart -k gui/$(id -u)/com.mikkel.ron` or
   whatever the LaunchAgent label is).

## Snippet

```python
import asyncio
import os
from pathlib import Path

CGD_DIR = Path(os.path.expanduser("~/projects/collegegolfdata"))

# Discord usernames (NOT user IDs) that can invoke these two commands.
# Swap out for Ron's existing authorized-users check if one exists.
ON_DEMAND_ALLOWED = {"mikkelgolf", "collegegolfbook"}  # David confirmed 2026-04-22


async def _run_on_demand_script(channel, author, script_name: str, label: str):
    """Kick off a long-running CGD script as a subprocess.

    The scripts themselves handle:
      - working-tree / kill-switch safety
      - the final Discord summary (via post_daily_summary.py)
      - failure notifications

    So Ron's job is just: ack, spawn, stream stderr on non-zero exit.
    """
    if author.name not in ON_DEMAND_ALLOWED:
        await channel.send(
            f"{author.mention} — `!{label}` is restricted to Mikkel + David."
        )
        return

    script_path = CGD_DIR / "scripts" / script_name
    if not script_path.exists():
        await channel.send(
            f"script not found: `{script_path}`. Is the `ron/on-demand-commands` "
            f"branch merged into `main` yet?"
        )
        return

    await channel.send(
        f"{author.mention} kicked off `!{label}` — this takes ~1–2 min. "
        f"I'll let the script post the summary when it finishes."
    )

    # Run as subprocess so Ron doesn't block its event loop on bash.
    proc = await asyncio.create_subprocess_exec(
        "bash",
        str(script_path),
        cwd=str(CGD_DIR),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    stdout, _ = await proc.communicate()

    if proc.returncode != 0:
        # The script should already have posted a failure message via
        # post_daily_summary.py --failed, but include the last chunk of
        # stdout so Mikkel/David can see what went wrong without SSH'ing
        # to the Mac mini.
        tail = (stdout or b"").decode("utf-8", errors="replace").splitlines()[-25:]
        tail_str = "\n".join(tail) or "(no output)"
        await channel.send(
            f"`!{label}` exited with code {proc.returncode}. Last lines:\n"
            f"```\n{tail_str[-1800:]}\n```"
        )


# Wire into your existing on_message dispatch. Example:
#
# @bot.event
# async def on_message(message):
#     if message.author.bot:
#         return
#     content = message.content.strip()
#
#     if content == "!update-rankings":
#         await _run_on_demand_script(
#             message.channel, message.author,
#             "update-rankings-on-demand.sh", "update-rankings",
#         )
#         return
#
#     if content == "!update-conference-winner":
#         await _run_on_demand_script(
#             message.channel, message.author,
#             "update-conference-winner-on-demand.sh", "update-conference-winner",
#         )
#         return
#
#     # ... existing !new / !wrap / etc. handlers below ...
```

## Testing (before announcing to David)

1. Dry-run both scripts locally first:
   ```bash
   bash scripts/update-rankings-on-demand.sh --dry-run
   bash scripts/update-conference-winner-on-demand.sh --dry-run
   ```
   Both should print every step they *would* take and exit 0 without
   touching git.

2. After merging to `main` and paste-installing the handler, fire
   `!update-rankings` from the Discord channel. Expected: Ron acks, then
   60–120s later the existing `post_daily_summary.py` message appears
   with the commit + Vercel URL.

3. Fire `!update-conference-winner`. If no championships ended today the
   script posts a "No new conference winners to confirm. needsManual=N,
   stillOpen=M." note and exits 0 (no commit, no deploy).

## Auth note

David confirmed his Discord handle is `collegegolfbook` on 2026-04-22, so
the allowlist is `{"mikkelgolf", "collegegolfbook"}`. If Mikkel's handle
changes, update the set and restart Ron.

## Guardrail reminder

Both scripts push to `main`. That violates Ron's general "never push to
main" guardrail, BUT Mikkel explicitly opted in on 2026-04-22 — invoking
the sanctioned `daily-refresh.sh` / `update-conference-winner-on-demand.sh`
pipeline is the allowed exception because these scripts have their own
kill switch (`.daily-refresh-disabled`) + sanity gates. Ron running a
direct `git push origin main` is still forbidden.
