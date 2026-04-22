"""Daily check: which conference championships just ended without a winner?

Reads ``src/data/championships-{men,women}-2026.ts`` and ``data/clippd/
tournaments-YYYY-MM-DD.json`` (latest) and emits a structured report of
championships whose ``endDate`` fell in the last N days but whose
``winner`` field is still empty.

For each eligible championship this script attempts to resolve a matching
Clippd tournament (by gender + end-date ±1 day + name similarity). When
found, the report includes the Clippd tournament URL so Mikkel can open
the page in one click to confirm the winner.

Auto-commit of winners is intentionally deferred — Clippd's public API
does not expose per-tournament team leaderboards (the results page is
React-rendered). A follow-up commit can wire a Playwright-based winner
extractor into ``resolve_winner()`` and pass ``--apply-winners`` here
to have the TS files rewritten in place.

Usage:
    python3 scripts/detect_new_champions.py \\
        --tournaments data/clippd/tournaments-YYYY-MM-DD.json \\
        --days 14 \\
        --output /tmp/champion-report.json

Exit codes:
    0 — report generated (regardless of findings)
    2 — bad args or missing inputs
    3 — internal error while parsing TS file
"""

from __future__ import annotations

import argparse
import datetime as dt
import glob
import json
import os
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CHAMP_DIR = REPO_ROOT / "src" / "data"

# Matches one championship object in championships-{men,women}-2026.ts.
# The files are hand-edited TypeScript with a uniform shape — regex
# parsing is sufficient and avoids a @babel/parser dependency.
#
# Capture groups:
#   id, conference, conferenceFull, name, startDate, endDate, winner (opt)
CHAMP_BLOCK = re.compile(
    r"""
    \{\s*
    id:\s*(?P<id>\d+),\s*
    conference:\s*"(?P<conf>[^"]*)",\s*
    conferenceFull:\s*"(?P<conf_full>[^"]*)",\s*
    name:\s*"(?P<name>[^"]*)",\s*
    .*?
    startDate:\s*"(?P<start>\d{4}-\d{2}-\d{2})",\s*
    endDate:\s*"(?P<end>\d{4}-\d{2}-\d{2})",\s*
    .*?
    (?:winner:\s*"(?P<winner>[^"]*)",\s*)?
    \}
    """,
    re.DOTALL | re.VERBOSE,
)


def load_championships(gender: str) -> list[dict]:
    path = CHAMP_DIR / f"championships-{gender}-2026.ts"
    text = path.read_text()
    out = []
    for m in CHAMP_BLOCK.finditer(text):
        out.append(
            {
                "id": int(m.group("id")),
                "conference": m.group("conf"),
                "conferenceFull": m.group("conf_full"),
                "name": m.group("name"),
                "startDate": m.group("start"),
                "endDate": m.group("end"),
                "winner": (m.group("winner") or "").strip(),
                "gender": gender,
            }
        )
    return out


def load_tournaments(path: Path) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(f"tournaments JSON not found: {path}")
    data = json.loads(path.read_text())
    combined = list(data.get("men", [])) + list(data.get("women", []))
    return combined


def name_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def date_within(a: str, b: str, days: int) -> bool:
    try:
        da = dt.date.fromisoformat(a)
        db = dt.date.fromisoformat(b)
    except ValueError:
        return False
    return abs((da - db).days) <= days


def find_match(champ: dict, tournaments: list[dict]) -> dict | None:
    """Return the Clippd tournament representing this championship.

    Strict: same gender, endDate within ±1 day, and the tournament name
    (or host) must contain the conference abbreviation or the full
    conference name as a substring. Fuzzy-similarity fallback removed
    because it produced false matches (e.g. CAA → SoCon based on shared
    "Women's Golf Championship" boilerplate).
    """
    gender = champ["gender"]
    needles = {
        champ["conference"].lower(),
        champ["conferenceFull"].lower(),
    }
    needles -= {""}

    for t in tournaments:
        if t.get("gender") != gender:
            continue
        if not date_within(t.get("endDate", ""), champ["endDate"], 1):
            continue
        t_name_low = t.get("tournamentName", "").lower()
        host_low = (t.get("hostName") or "").lower()
        host_conf_low = (t.get("hostConference") or "").lower()
        haystack = f"{t_name_low} || {host_low} || {host_conf_low}"
        if any(n and n in haystack for n in needles):
            return t
    return None


def resolve_winner(tournament: dict) -> str | None:
    """Extract the tournament winner via Clippd's team-leaderboard page.

    Uses ``clippd_winner_extractor.extract_winner_from_clippd`` which renders
    ``/tournaments/<id>/scoring/team`` with Playwright and reads the first
    data row's TEAM cell. Returns None if the tournament is unresolved
    (not started, in-progress, or render failed) so callers fall back to
    needs-manual.

    Only called for tournaments that Clippd already flagged isComplete=true
    AND hasResults=true at scrape time, so a None here is a genuine scrape
    failure rather than an incomplete event.
    """
    if not tournament:
        return None
    if not tournament.get("isComplete") or not tournament.get("hasResults"):
        return None
    tournament_id = tournament.get("tournamentId")
    if not tournament_id:
        return None
    try:
        from clippd_winner_extractor import extract_winner_from_clippd
    except ImportError:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from clippd_winner_extractor import extract_winner_from_clippd
    return extract_winner_from_clippd(str(tournament_id))


def emit_report(
    champs: list[dict],
    tournaments: list[dict],
    days: int,
) -> dict:
    today = dt.date.today()
    cutoff = today - dt.timedelta(days=days)

    auto_confirmed: list[dict] = []
    needs_manual: list[dict] = []
    still_open: list[dict] = []
    already_set: list[dict] = []

    for champ in champs:
        try:
            end = dt.date.fromisoformat(champ["endDate"])
        except ValueError:
            continue
        if end > today:
            continue
        if end < cutoff:
            continue

        if champ["winner"]:
            already_set.append(
                {
                    "gender": champ["gender"],
                    "conference": champ["conference"],
                    "name": champ["name"],
                    "endDate": champ["endDate"],
                    "winner": champ["winner"],
                }
            )
            continue

        match = find_match(champ, tournaments)
        clippd_url = match.get("clippdUrl") if match else None
        tournament_id = match.get("tournamentId") if match else None
        tournament_name = match.get("tournamentName") if match else None

        winner = resolve_winner(match) if match else None

        entry = {
            "gender": champ["gender"],
            "conference": champ["conference"],
            "conferenceFull": champ["conferenceFull"],
            "name": champ["name"],
            "endDate": champ["endDate"],
            "tsFile": f"src/data/championships-{champ['gender']}-2026.ts",
            "championshipId": champ["id"],
            "tournamentId": tournament_id,
            "tournamentName": tournament_name,
            "clippdUrl": clippd_url,
        }

        if winner:
            entry["winner"] = winner
            auto_confirmed.append(entry)
        else:
            needs_manual.append(entry)

    # Championships that are in-progress (started, not yet ended)
    for champ in champs:
        try:
            start = dt.date.fromisoformat(champ["startDate"])
            end = dt.date.fromisoformat(champ["endDate"])
        except ValueError:
            continue
        if start <= today <= end and not champ["winner"]:
            still_open.append(
                {
                    "gender": champ["gender"],
                    "conference": champ["conference"],
                    "name": champ["name"],
                    "endDate": champ["endDate"],
                }
            )

    return {
        "generatedAt": dt.datetime.now().isoformat(timespec="seconds"),
        "sinceDate": cutoff.isoformat(),
        "throughDate": today.isoformat(),
        "autoConfirmed": auto_confirmed,
        "needsManual": needs_manual,
        "stillOpen": still_open,
        "alreadySet": already_set,
    }


def apply_auto_winners(report: dict) -> list[str]:
    """Write confirmed winners back to the TS files.

    Only touches championships listed in ``report['autoConfirmed']``. No-op
    when that list is empty (the current MVP state).
    Returns the list of file paths modified.
    """
    touched: list[str] = []
    for entry in report.get("autoConfirmed", []):
        gender = entry["gender"]
        champ_id = entry["championshipId"]
        winner = entry.get("winner")
        if not winner:
            continue
        path = REPO_ROOT / entry["tsFile"]
        text = path.read_text()
        # Find the specific championship block by id and ensure it has
        # a ``winner: "..."`` field — insert one just before the closing
        # brace if absent, update if present.
        block_re = re.compile(
            rf"(\{{\s*id:\s*{champ_id},\b.*?)(\s*\}})",
            re.DOTALL,
        )
        m = block_re.search(text)
        if not m:
            continue
        body = m.group(1)
        if re.search(r"\bwinner:\s*\"[^\"]*\"", body):
            new_body = re.sub(
                r"\bwinner:\s*\"[^\"]*\"",
                f'winner: "{winner}"',
                body,
            )
        else:
            # Preserve trailing comma/indent convention used by neighbors.
            new_body = body.rstrip() + f',\n    winner: "{winner}"'
        new_text = text[: m.start()] + new_body + m.group(2) + text[m.end() :]
        path.write_text(new_text)
        touched.append(str(path.relative_to(REPO_ROOT)))
    return touched


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--tournaments",
        type=Path,
        help="Path to Clippd tournaments JSON (defaults to newest data/clippd/tournaments-*.json)",
    )
    parser.add_argument("--days", type=int, default=14)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("/tmp/champion-report.json"),
    )
    parser.add_argument(
        "--apply-winners",
        action="store_true",
        help="Rewrite championships-*.ts with auto-confirmed winners (no-op today, reserved for Playwright winner extractor follow-up)",
    )
    args = parser.parse_args()

    tournaments_path = args.tournaments
    if tournaments_path is None:
        candidates = sorted(
            glob.glob(str(REPO_ROOT / "data" / "clippd" / "tournaments-*.json"))
        )
        if not candidates:
            print(
                "ERROR: no tournaments JSON found. Run scrape-clippd-tournaments.ts first.",
                file=sys.stderr,
            )
            return 2
        tournaments_path = Path(candidates[-1])

    try:
        men = load_championships("men")
        women = load_championships("women")
    except Exception as exc:
        print(f"ERROR parsing TS championship file: {exc}", file=sys.stderr)
        return 3

    try:
        tournaments = load_tournaments(tournaments_path)
    except FileNotFoundError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    report = emit_report(men + women, tournaments, args.days)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")

    print(
        f"champions report: auto-confirmed={len(report['autoConfirmed'])} "
        f"needs-manual={len(report['needsManual'])} "
        f"still-open={len(report['stillOpen'])} "
        f"already-set={len(report['alreadySet'])}"
    )

    if args.apply_winners and report["autoConfirmed"]:
        touched = apply_auto_winners(report)
        print(f"applied {len(report['autoConfirmed'])} winners to: {touched}")
    elif args.apply_winners:
        print("--apply-winners: no auto-confirmed winners to apply")

    return 0


if __name__ == "__main__":
    sys.exit(main())
