"""Build src/data/regionals-rich.json from David's private Google Sheet.

The sheet holds per-team-per-year NCAA Regional tournament history with ~157
columns (seeding, scoring, strokes-gained, etc). This script reads the D1 MEN
tab and writes a compact derived JSON keyed by (year, team, regional) with only
the fields the site actually uses.

Run (from the repo root, on the Mac Mini where Ron's venv + creds live):

    GOOGLE_APPLICATION_CREDENTIALS=~/.config/gcloud/bigquery-credentials.json \\
    REGIONALS_SHEET_ID=<id> \\
    ~/projects/ron/.venv/bin/python scripts/build-regional-history.py

Privacy contract (David, 2026-04-21): the sheet ID is private. It is taken
from REGIONALS_SHEET_ID at runtime and NEVER written into the repo or logged.
Raw row payloads are likewise never persisted — only the compact per-row
derived records below end up in regionals-rich.json.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# Ron's helper lives next to ron.py, not inside this repo.
sys.path.insert(0, "/Users/mikkelbjerchandresen/projects/ron")
from google_sheets import read_tab  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = REPO_ROOT / "src" / "data" / "regionals-rich.json"

# Known sheet-variant -> canonical-site-name used in regionals-history.json
# and rankings. Mirrors the map in scripts/build-championships-history.ts but
# kept local so this script has no TS build dependency.
MEN_CANONICAL: dict[str, str] = {
    "East Tennessee State": "ETSU",
    "Central Florida": "UCF",
    "Memphis State": "Memphis",
    "North Texas State": "North Texas",
    "Lamar Tech": "Lamar",
    "Augusta State": "Augusta",
    "Detroit": "Detroit Mercy",
    "Kent": "Kent State",
    "West Point": "Army",
}

# Sheet column indices are resolved by header name at read time, so additions
# to the sheet don't break us. Kept here as documentation.
WANTED_COLUMNS = [
    "Year",
    "Regional",
    "Team",
    "Initial Seeding",
    "Expected to Adv",
    "Team Result",
    "FinalTeamPos",
    "Team SG Total",
    "Margin of Victory",
    "Regional Title Count (including this year)",
]


def _to_int(value: str) -> int | None:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    try:
        return int(float(s))
    except (TypeError, ValueError):
        return None


def _to_float(value: str) -> float | None:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def _to_bool(value: str) -> bool | None:
    if value is None:
        return None
    s = str(value).strip().lower()
    if s in {"1", "true", "yes", "y"}:
        return True
    if s in {"0", "false", "no", "n"}:
        return False
    return None


def _canonical_team(raw: str) -> str:
    raw = (raw or "").strip()
    return MEN_CANONICAL.get(raw, raw)


def main() -> int:
    sheet_id = os.environ.get("REGIONALS_SHEET_ID")
    if not sheet_id:
        print(
            "ERROR: REGIONALS_SHEET_ID env var is required. "
            "Do NOT paste it into code or commit messages.",
            file=sys.stderr,
        )
        return 2

    rows = read_tab(sheet_id, "D1 MEN")
    if not rows:
        print("ERROR: D1 MEN tab is empty", file=sys.stderr)
        return 3
    header = rows[0]
    idx = {name: i for i, name in enumerate(header)}
    missing = [c for c in WANTED_COLUMNS if c not in idx]
    if missing:
        print(f"ERROR: sheet missing columns: {missing}", file=sys.stderr)
        return 4

    def cell(row: list[str], col: str) -> str:
        i = idx[col]
        return row[i] if i < len(row) else ""

    # Load existing canonical team set so we can warn on unmatched names
    # (data-quality signal, not a hard failure — we still emit the row).
    existing_path = REPO_ROOT / "src" / "data" / "regionals-history.json"
    existing = json.loads(existing_path.read_text())
    canonical_men_teams = {r["team"] for r in existing if r["gender"] == "men"}

    out: list[dict] = []
    unmatched_teams: dict[str, int] = {}
    for row in rows[1:]:
        if not any(c for c in row):
            continue
        year = _to_int(cell(row, "Year"))
        team = _canonical_team(cell(row, "Team"))
        regional = (cell(row, "Regional") or "").strip()
        if year is None or not team:
            continue
        if team not in canonical_men_teams:
            unmatched_teams[team] = unmatched_teams.get(team, 0) + 1

        out.append(
            {
                "year": year,
                "gender": "men",
                "team": team,
                "regional": regional,
                "seed": _to_int(cell(row, "Initial Seeding")),
                "expectedAdv": _to_bool(cell(row, "Expected to Adv")),
                "result": (cell(row, "Team Result") or "").strip() or None,
                "finalPos": _to_int(cell(row, "FinalTeamPos")),
                "sgTotal": _to_float(cell(row, "Team SG Total")),
                "margin": _to_float(cell(row, "Margin of Victory")),
                "titleCount": _to_int(
                    cell(row, "Regional Title Count (including this year)")
                ),
            }
        )

    out.sort(key=lambda r: (r["year"], r["regional"], r["finalPos"] or 99, r["team"]))

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, indent=0, separators=(",", ":")) + "\n")

    print(f"wrote {OUT_PATH.relative_to(REPO_ROOT)}: {len(out)} rows")
    print(f"year range: {min(r['year'] for r in out)}–{max(r['year'] for r in out)}")
    print(f"unique teams: {len({r['team'] for r in out})}")
    if unmatched_teams:
        print(
            f"WARN: {len(unmatched_teams)} team name(s) in sheet not in existing "
            "regionals-history.json (check canonical map):"
        )
        for name, n in sorted(unmatched_teams.items(), key=lambda kv: -kv[1]):
            print(f"  {name}: {n} row(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
