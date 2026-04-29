"""Re-apply scripts/team-name-aliases.json to src/data/regionals-rich.json.

This is a hygiene tool — separate from the full ingest in
scripts/build-regional-history.py — for when an alias is added/fixed
and we want to canonicalise the existing JSON without re-reading the
private sheet. Idempotent: re-running with no alias changes is a
no-op.

Run from repo root:

    python scripts/canonicalize-regionals-rich.py

Prints a summary of how many rows changed per (gender, before→after).
Writes the file back with the same JSON formatting as
build-regional-history.py (indent=0, separators=(",",":"), trailing newline).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ALIASES_PATH = REPO_ROOT / "scripts" / "team-name-aliases.json"
DATA_PATH = REPO_ROOT / "src" / "data" / "regionals-rich.json"


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

    DATA_PATH.write_text(json.dumps(rows, indent=0, separators=(",", ":")) + "\n")

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
