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

# Sheet-variant -> canonical-site-name aliases live in a shared JSON file so
# they can be edited without touching code (and so a future ingest from a
# different feed can reuse the same map). The file is keyed by gender; each
# value maps a raw sheet name to the canonical name used in
# regionals-history.json + rankings + all-teams. Add new aliases there as
# they surface; this script prints a WARN line for every sheet team that
# doesn't resolve to a known canonical name.
ALIASES_PATH = REPO_ROOT / "scripts" / "team-name-aliases.json"


def _load_aliases() -> tuple[dict[str, str], dict[str, str]]:
    raw = json.loads(ALIASES_PATH.read_text())
    # Strip leading-underscore keys (used for inline schema/comment docs in
    # the JSON file — not real gender entries).
    return (
        {k: v for k, v in raw.get("men", {}).items()},
        {k: v for k, v in raw.get("women", {}).items()},
    )


MEN_CANONICAL, WOMEN_CANONICAL = _load_aliases()

# Sheet column indices are resolved by header name at read time, so additions
# to the sheet don't break us. Kept here as documentation.
WANTED_COLUMNS = [
    "Year",
    "Regional",
    "Team",
    "Initial Seeding",
    "Expected to Adv",
    "Team Advanced",
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

        seed = _to_int(cell(row, "Initial Seeding"))
        expected_adv = _to_bool(cell(row, "Expected to Adv"))
        # Normalization rule (David, 2026-04-28): if a team has a Regional
        # seed but the spreadsheet's "Expected to Adv" cell is empty, treat
        # that as an explicit `false`. The cell is only ever blank for two
        # reasons — (a) the team wasn't seeded that year (no seed value),
        # in which case we genuinely don't know the expectation, OR (b) the
        # spreadsheet author left it implicit. The seed-present case is
        # always (b): committee-flagged-as-not-expected. Anything explicitly
        # `true` stays `true`; existing `false` values stay `false`.
        if seed is not None and expected_adv is None:
            expected_adv = False

        out.append(
            {
                "year": year,
                "gender": gender,
                "team": team,
                "regional": regional,
                "seed": seed,
                "expectedAdv": expected_adv,
                "teamAdvanced": _to_bool(cell(row, "Team Advanced")),
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
