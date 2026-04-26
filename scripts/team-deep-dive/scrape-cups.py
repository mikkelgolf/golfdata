#!/usr/bin/env python
"""
scrape-cups.py — pull every U.S. Walker Cup, Palmer Cup, and Curtis Cup
team roster from Wikipedia.

Wikipedia has dedicated pages for each year's Walker Cup match (e.g.
"2023 Walker Cup") that list both teams' rosters. Same for Palmer Cup
(US vs International, 1997-present) and Curtis Cup (women).

Output:
    data/team-deep-dive/cup-appearances.json — flat array of
    {cup, year, team_country, player, school?, source_url, scraped_at}

The "school" field is best-effort: Wikipedia listings sometimes annotate
"(Stanford)" or similar after the player name, but more often we just
get the player name. Downstream the build-record-book merge tries to
resolve player name → school via the player index.

Usage:
    ~/venv/bin/python scripts/team-deep-dive/scrape-cups.py
    ~/venv/bin/python scripts/team-deep-dive/scrape-cups.py --cup walker --years 2010-2025
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = REPO_ROOT / "data" / "team-deep-dive"
CACHE_DIR = REPO_ROOT / "data" / "cache" / "wikipedia-cups"

USER_AGENT = "CollegeGolfData/0.1 (mikkelgolfllc@gmail.com)"
RATE_LIMIT_SECONDS = 1.0
API_BASE = "https://en.wikipedia.org/w/api.php"


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cup", choices=["walker", "palmer", "curtis", "all"], default="all")
    ap.add_argument("--years", default=None, help="e.g. 2000-2025")
    return ap.parse_args()


def cache_path(key: str) -> Path:
    return CACHE_DIR / f"{hashlib.sha1(key.encode()).hexdigest()}.json.gz"


def fetch_wikitext(title: str) -> str | None:
    p = cache_path(title)
    if p.exists():
        with gzip.open(p, "rt") as f:
            return json.load(f).get("wikitext")
    print(f"[cups] {title}", file=sys.stderr)
    r = requests.get(
        API_BASE,
        params={"action": "parse", "page": title, "prop": "wikitext", "format": "json", "redirects": 1},
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    if r.status_code != 200:
        return None
    j = r.json()
    if "parse" not in j or "wikitext" not in j["parse"]:
        return None
    wt = j["parse"]["wikitext"]["*"]
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with gzip.open(p, "wt") as f:
        json.dump({"title": title, "wikitext": wt}, f)
    time.sleep(RATE_LIMIT_SECONDS)
    return wt


# Walker Cup: U.S. amateurs vs Great Britain & Ireland, every other year
# starting 1922 (with WW2 gap). Page titles: "<year> Walker Cup".
WALKER_CUP_YEARS = list(range(1922, 1939, 2)) + list(range(1947, 2026, 2))
PALMER_CUP_YEARS = list(range(1997, 2026))  # annual
CURTIS_CUP_YEARS = list(range(1932, 1939, 2)) + list(range(1948, 2026, 2))  # women


def _extract_us_team_table(wt: str) -> str | None:
    """Find the wikitable that starts with the Team USA flag/header.

    Walker / Palmer Cup pages use a wikitable per team. The U.S. team's
    table contains '{{flagicon|USA' or "'''Team USA'''" near the top.
    """
    # Find every wikitable start.
    matches = []
    for m in re.finditer(r"\{\|[\s\S]+?\n\|\}", wt):
        block = m.group(0)
        if (
            "flagicon|USA" in block
            or "flagicon|United States" in block
            or "Team USA" in block[:200]
            or "United States" in block[:300]
        ):
            matches.append(block)
    return matches[0] if matches else None


def _parse_wikitable_rows(table: str) -> list[list[str]]:
    """Return rows of cells, each cell as raw wikitext (links preserved)."""
    out = []
    # Split on row separators "|-".
    chunks = re.split(r"\n\|-+", table)
    for chunk in chunks:
        # Each cell starts with "|" (or "!" for headers); cells separated by
        # "||" on a single line OR each on its own line starting with "|".
        cells: list[str] = []
        # Drop the table-start line.
        lines = chunk.strip().splitlines()
        for ln in lines:
            ln = ln.strip()
            if not ln or ln.startswith(("{|", "|+", "|}")):
                continue
            if ln.startswith("|") or ln.startswith("!"):
                # Strip leading "|" or "!" and any style attrs (text before "|").
                body = ln[1:].lstrip("!|").lstrip()
                if "||" in body:
                    cells.extend([c.strip() for c in body.split("||")])
                else:
                    # If it has style="..." | content, take the content after the "|".
                    if re.match(r"^\w[^|]*\|", body):
                        body = body.split("|", 1)[1].strip()
                    cells.append(body)
        if cells:
            out.append(cells)
    return out


def _row_to_player(cells: list[str]) -> dict | None:
    if not cells:
        return None
    # First cell normally contains the player link.
    first = cells[0]
    link = re.search(r"\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]", first)
    if not link:
        return None
    name = (link.group(2) or link.group(1)).strip()
    if not name or len(name) > 60:
        return None
    # Reject obvious header-row noise.
    if name.lower() in {"name", "rank", "age", "hometown"}:
        return None
    notes = " | ".join(c for c in cells[1:] if c)
    school = None
    sm = re.search(r"\(([A-Z][A-Za-z &\-]+?)\)", notes)
    if sm:
        cand = sm.group(1).strip()
        # Sanity: looks like a school name (not a city/state).
        if len(cand) > 3 and not re.match(r"^\d", cand):
            school = cand
    return {"player": name, "school": school, "notes": notes[:200]}


def parse_walker_cup_team(wt: str, year: int) -> list[dict]:
    table = _extract_us_team_table(wt)
    if not table:
        return []
    out: list[dict] = []
    seen: set[str] = set()
    for row in _parse_wikitable_rows(table):
        rec = _row_to_player(row)
        if not rec:
            continue
        if rec["player"] in seen:
            continue
        seen.add(rec["player"])
        out.append(rec)
    return out


def parse_palmer_cup_team(wt: str, year: int) -> list[dict]:
    return parse_walker_cup_team(wt, year)  # same wikitable layout


def parse_year_range(s: str | None) -> list[int]:
    if not s:
        return []
    m = re.match(r"(\d{4})\s*-\s*(\d{4})", s)
    if m:
        return list(range(int(m.group(1)), int(m.group(2)) + 1))
    return [int(y) for y in re.findall(r"\d{4}", s)]


def main() -> None:
    args = parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    scraped_at = datetime.now().isoformat(timespec="seconds") + "Z"

    out: list[dict] = []
    year_filter = set(parse_year_range(args.years)) if args.years else None

    cups_to_run: list[tuple[str, list[int], callable]] = []
    if args.cup in ("walker", "all"):
        cups_to_run.append(("walker", WALKER_CUP_YEARS, parse_walker_cup_team))
    if args.cup in ("palmer", "all"):
        cups_to_run.append(("palmer", PALMER_CUP_YEARS, parse_palmer_cup_team))

    for cup, years, parser in cups_to_run:
        for year in years:
            if year_filter and year not in year_filter:
                continue
            title = f"{year} {cup.capitalize()} Cup"
            wt = fetch_wikitext(title)
            if not wt:
                continue
            entries = parser(wt, year)
            for e in entries:
                out.append(
                    {
                        "cup": cup,
                        "year": year,
                        "team_country": "United States",
                        "player": e["player"],
                        "school": e.get("school"),
                        "source_url": f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}",
                        "scraped_at": scraped_at,
                    }
                )
            print(f"[cups] {title}: +{len(entries)} US players")

    out_path = OUT_DIR / "cup-appearances.json"
    out_path.write_text(json.dumps(out, indent=2))
    print(f"\nWrote {out_path}")
    print(f"Total cup-appearance rows: {len(out)}")
    from collections import Counter

    print("By cup:", dict(Counter(r["cup"] for r in out)))
    print(f"Distinct players: {len(set(r['player'] for r in out))}")


if __name__ == "__main__":
    main()
