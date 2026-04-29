"""Re-apply scripts/team-name-aliases.json to src/data/championships-history.json.

The full builder (scripts/build-championships-history.ts) reads CSV
dumps from /tmp/ncaa_sheet_dump/ which aren't always present, and it
carries its own MEN_CANONICAL / WOMEN_CANONICAL inline maps that
overlap with the shared aliases file. This hygiene script lets us
apply the shared aliases to the existing JSON without re-running the
full builder.

Idempotent: re-running with no alias changes is a no-op.

Run from repo root:

    python scripts/canonicalize-championships-history.py

Prints a summary of how many rows changed per (gender, before→after).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ALIASES_PATH = REPO_ROOT / "scripts" / "team-name-aliases.json"
DATA_PATH = REPO_ROOT / "src" / "data" / "championships-history.json"


def main() -> int:
    raw = json.loads(ALIASES_PATH.read_text())
    aliases = {
        "men": raw.get("men", {}),
        "women": raw.get("women", {}),
    }

    rows = json.loads(DATA_PATH.read_text())
    changes: dict[tuple[str, str, str], int] = {}
    for row in rows:
        gender = row.get("gender")
        team = row.get("team")
        if not gender or not team:
            continue
        canonical = aliases.get(gender, {}).get(team, team)
        if canonical != team:
            row["team"] = canonical
            key = (gender, team, canonical)
            changes[key] = changes.get(key, 0) + 1

    # Match the formatting build-championships-history.ts uses
    # (JSON.stringify(all) — no indentation, no trailing newline).
    DATA_PATH.write_text(json.dumps(rows, separators=(",", ":")))

    if not changes:
        print(f"{DATA_PATH.relative_to(REPO_ROOT)}: no changes (already canonical)")
        return 0

    total = sum(changes.values())
    print(
        f"{DATA_PATH.relative_to(REPO_ROOT)}: rewrote {total} row(s) "
        f"across {len(changes)} (gender, alias) substitution(s):"
    )
    for (gender, before, after), n in sorted(
        changes.items(), key=lambda kv: (-kv[1], kv[0])
    ):
        print(f"  {gender}  {before!r:>32}  →  {after!r:<32}  ×{n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
