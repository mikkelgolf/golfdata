#!/usr/bin/env python3
"""Write a human-supplied conference winner into championships-{men,women}-2026.ts.

Called by ``scripts/apply-manual-winner.sh``. Can also be invoked directly for
testing; the orchestrator handles git + vercel + Discord.

Usage:
    python3 scripts/apply_manual_winner.py \
        --conference MAAC --gender women --winner "Queens-Charlotte"

Exits:
    0 on a successful TS edit (or if the winner is already set to the same
      team and ``--allow-noop`` is passed).
    1 on validation failure (conference code not found, team not in
      all-teams data, championship has no matching block).
    2 if the championship already has a DIFFERENT winner and --force was
      not passed.

On success prints a single JSON line to stdout describing the edit —
designed so the shell wrapper can parse it for the commit message /
Discord summary. Shape::

    {"championshipId": 23, "conference": "MAAC", "conferenceFull": "...",
     "gender": "women", "winner": "Queens-Charlotte",
     "previousWinner": null, "tsFile": "src/data/championships-women-2026.ts"}
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

TS_FILE = {
    "men": REPO_ROOT / "src/data/championships-men-2026.ts",
    "women": REPO_ROOT / "src/data/championships-women-2026.ts",
}
ALL_TEAMS_FILE = {
    "men": REPO_ROOT / "src/data/all-teams-men-2026.ts",
    "women": REPO_ROOT / "src/data/all-teams-women-2026.ts",
}


def load_team_names(gender: str) -> set[str]:
    """Parse all-teams-{gender}-2026.ts and return the set of team strings."""
    text = ALL_TEAMS_FILE[gender].read_text()
    return set(re.findall(r'team:\s*"([^"]+)"', text))


def find_championship_block(text: str, conference: str):
    """Return (match, id, conference_full, existing_winner_or_None).

    Matches a brace-balanced block with ``conference: "CODE"``. Returns
    None when the conference code is absent.
    """
    # Pattern matches a single object literal from "{  id: N," through the
    # matching "}". Non-greedy and anchored on the conference field so we
    # don't accidentally bridge across two blocks.
    pat = re.compile(
        r"(\{\s*id:\s*(?P<id>\d+),[^{}]*?"
        rf'conference:\s*"{re.escape(conference)}",[^{{}}]*?'
        r"\})",
        re.DOTALL,
    )
    m = pat.search(text)
    if not m:
        return None
    body = m.group(1)
    full_match = re.search(r'conferenceFull:\s*"([^"]+)"', body)
    conference_full = full_match.group(1) if full_match else conference
    end_date_match = re.search(r'endDate:\s*"(\d{4}-\d{2}-\d{2})"', body)
    end_date = end_date_match.group(1) if end_date_match else None
    winner_match = re.search(r'winner:\s*"([^"]*)"', body)
    existing = winner_match.group(1) if winner_match else None
    return {
        "match": m,
        "id": int(m.group("id")),
        "conferenceFull": conference_full,
        "endDate": end_date,
        "existingWinner": existing,
    }


def insert_or_update_winner(body: str, winner: str) -> str:
    """Return a new block body with ``winner: "..."`` set to *winner*.

    *body* is the full matched object literal including the outer ``{`` and
    ``}``. If the block already has a ``winner`` field it's updated in place;
    otherwise a new ``winner: "..."`` field is inserted just before the
    closing brace, preserving the trailing-comma convention used by
    surrounding entries.
    """
    if re.search(r'\bwinner:\s*"[^"]*"', body):
        return re.sub(r'\bwinner:\s*"[^"]*"', f'winner: "{winner}"', body)
    # Strip closing brace + trailing whitespace + any trailing comma so we
    # don't end up with a double comma when the last field already had one.
    trimmed = body.rstrip().rstrip("}").rstrip().rstrip(",").rstrip()
    return trimmed + f',\n    winner: "{winner}",\n  }}'


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--conference", required=True, help="Conference code, e.g. MAAC, ACC, BSKY")
    ap.add_argument("--gender", required=True, choices=("men", "women"))
    ap.add_argument("--winner", required=True, help='Exact team name, e.g. "Queens-Charlotte"')
    ap.add_argument(
        "--force",
        action="store_true",
        help="Overwrite an existing winner (default: refuse unless same value).",
    )
    ap.add_argument(
        "--allow-noop",
        action="store_true",
        help="Exit 0 without writing if the winner is already set to this value.",
    )
    args = ap.parse_args()

    ts_path = TS_FILE[args.gender]
    if not ts_path.exists():
        print(f"ERROR: {ts_path} not found", file=sys.stderr)
        return 1

    # 1. Validate winner is in the all-teams data.
    team_names = load_team_names(args.gender)
    if args.winner not in team_names:
        print(
            f'ERROR: winner "{args.winner}" not found in {ALL_TEAMS_FILE[args.gender].relative_to(REPO_ROOT)}. '
            f"Check spelling (team names are case-sensitive).",
            file=sys.stderr,
        )
        # Help the human: print near-misses by case-insensitive match.
        near = [n for n in team_names if n.lower() == args.winner.lower()]
        if near:
            print(f'HINT: did you mean "{near[0]}"?', file=sys.stderr)
        return 1

    # 2. Locate the championship block by conference code.
    text = ts_path.read_text()
    info = find_championship_block(text, args.conference)
    if info is None:
        print(
            f'ERROR: no championship with conference "{args.conference}" in {ts_path.relative_to(REPO_ROOT)}',
            file=sys.stderr,
        )
        return 1

    existing = info["existingWinner"]
    if existing == args.winner:
        msg = (
            f'note: {args.conference} {args.gender} winner is already "{args.winner}" — no change.'
        )
        if args.allow_noop:
            print(msg, file=sys.stderr)
            result = {
                "championshipId": info["id"],
                "conference": args.conference,
                "conferenceFull": info["conferenceFull"],
                "gender": args.gender,
                "winner": args.winner,
                "previousWinner": existing,
                "tsFile": str(ts_path.relative_to(REPO_ROOT)),
                "noop": True,
            }
            print(json.dumps(result))
            return 0
        print(msg, file=sys.stderr)
        return 0
    if existing and not args.force:
        print(
            f'ERROR: {args.conference} {args.gender} already has winner "{existing}". '
            f'Pass --force to overwrite with "{args.winner}".',
            file=sys.stderr,
        )
        return 2

    # 3. Edit the block.
    block = info["match"].group(1)
    new_block = insert_or_update_winner(block, args.winner)
    new_text = text[: info["match"].start()] + new_block + text[info["match"].end() :]
    ts_path.write_text(new_text)

    result = {
        "championshipId": info["id"],
        "conference": args.conference,
        "conferenceFull": info["conferenceFull"],
        "gender": args.gender,
        "winner": args.winner,
        "previousWinner": existing,
        "endDate": info["endDate"],
        "tsFile": str(ts_path.relative_to(REPO_ROOT)),
        "noop": False,
    }
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
