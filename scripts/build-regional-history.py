"""Build src/data/regionals-rich.json from David's private Google Sheet.

The sheet holds per-team-per-year NCAA Regional tournament history with ~157
columns (seeding, scoring, strokes-gained, etc). This script reads both the
`D1 MEN` and `D1 WOMEN` tabs and writes a combined compact derived JSON keyed
by (year, gender, team, regional) with only the fields the site actually
uses.

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
    "Louisiana-LaFayette": "Louisiana-Lafayette",
}

# Women's canonical map. regionals-history.json uses "CSU - Northridge",
# "CSU - Fullerton", and "Central Florida" for women (unlike the men's set,
# which standardised on "UCF"). Normalise every sheet variant to that form.
WOMEN_CANONICAL: dict[str, str] = {
    "CSU Northridge": "CSU - Northridge",
    "CSU Fullerton": "CSU - Fullerton",
    "UCF": "Central Florida",
    "East Tennessee State": "ETSU",
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

# (tab_name, gender_label, canonical_map)
TABS = [
    ("D1 MEN", "men", MEN_CANONICAL),
    ("D1 WOMEN", "women", WOMEN_CANONICAL),
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


def _canonical(raw: str, canonical_map: dict[str, str]) -> str:
    raw = (raw or "").strip()
    return canonical_map.get(raw, raw)


def _process_tab(
    sheet_id: str,
    tab: str,
    gender: str,
    canonical_map: dict[str, str],
    canonical_teams: set[str],
) -> tuple[list[dict], dict[str, int]]:
    """Read one gender's tab and return (rows, unmatched_name_counter)."""
    rows = read_tab(sheet_id, tab)
    if not rows:
        print(f"WARN: '{tab}' tab is empty — skipping {gender}", file=sys.stderr)
        return [], {}
    header = rows[0]
    idx = {name: i for i, name in enumerate(header)}
    missing = [c for c in WANTED_COLUMNS if c not in idx]
    if missing:
        print(
            f"ERROR: sheet tab '{tab}' missing columns: {missing}",
            file=sys.stderr,
        )
        raise SystemExit(4)

    def cell(row: list[str], col: str) -> str:
        i = idx[col]
        return row[i] if i < len(row) else ""

    out: list[dict] = []
    unmatched: dict[str, int] = {}
    for row in rows[1:]:
        if not any(c for c in row):
            continue
        year = _to_int(cell(row, "Year"))
        team = _canonical(cell(row, "Team"), canonical_map)
        regional = (cell(row, "Regional") or "").strip()
        if year is None or not team:
            continue
        if team not in canonical_teams:
            unmatched[team] = unmatched.get(team, 0) + 1

        out.append(
            {
                "year": year,
                "gender": gender,
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
    return out, unmatched


def main() -> int:
    sheet_id = os.environ.get("REGIONALS_SHEET_ID")
    if not sheet_id:
        print(
            "ERROR: REGIONALS_SHEET_ID env var is required. "
            "Do NOT paste it into code or commit messages.",
            file=sys.stderr,
        )
        return 2

    # Load existing canonical team set so we can warn on unmatched names
    # (data-quality signal, not a hard failure — we still emit the row).
    existing_path = REPO_ROOT / "src" / "data" / "regionals-history.json"
    existing = json.loads(existing_path.read_text())
    canonical_by_gender: dict[str, set[str]] = {
        "men": {r["team"] for r in existing if r["gender"] == "men"},
        "women": {r["team"] for r in existing if r["gender"] == "women"},
    }

    all_rows: list[dict] = []
    any_rows_per_gender: dict[str, int] = {}
    unmatched_by_gender: dict[str, dict[str, int]] = {}

    for tab, gender, cmap in TABS:
        tab_rows, unmatched = _process_tab(
            sheet_id, tab, gender, cmap, canonical_by_gender[gender]
        )
        all_rows.extend(tab_rows)
        any_rows_per_gender[gender] = len(tab_rows)
        unmatched_by_gender[gender] = unmatched

    if not all_rows:
        print("ERROR: no rows produced from any tab", file=sys.stderr)
        return 3

    all_rows.sort(
        key=lambda r: (
            r["gender"],
            r["year"],
            r["regional"],
            r["finalPos"] or 99,
            r["team"],
        )
    )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(all_rows, indent=0, separators=(",", ":")) + "\n")

    print(f"wrote {OUT_PATH.relative_to(REPO_ROOT)}: {len(all_rows)} rows")
    for gender in ("men", "women"):
        g_rows = [r for r in all_rows if r["gender"] == gender]
        if not g_rows:
            continue
        yrs = sorted({r["year"] for r in g_rows})
        teams = {r["team"] for r in g_rows}
        print(
            f"  {gender}: {len(g_rows)} rows · "
            f"{yrs[0]}–{yrs[-1]} · {len(teams)} teams"
        )

    for gender, unmatched in unmatched_by_gender.items():
        if not unmatched:
            continue
        print(
            f"WARN: {len(unmatched)} {gender} team name(s) in sheet not in "
            "existing regionals-history.json (extend canonical map?):"
        )
        for name, n in sorted(unmatched.items(), key=lambda kv: -kv[1]):
            print(f"  {name}: {n} row(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
