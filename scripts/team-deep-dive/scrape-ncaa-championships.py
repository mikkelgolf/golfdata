#!/usr/bin/env python
"""
scrape-ncaa-championships.py — for each NCAA D-I Men's Golf Championship
year, fetch the Wikipedia page and parse:
  - team standings (top N teams + finish position)
  - individual top finishers (when listed)
  - medalist
  - venue + course

Output:
    src/data/events/ncaa-championship-<year>.json — same shape as the BQ
    event exports so /events/[id] route renders without modification.

Usage:
    ~/venv/bin/python scripts/team-deep-dive/scrape-ncaa-championships.py
    ~/venv/bin/python scripts/team-deep-dive/scrape-ncaa-championships.py --start 2010 --end 2024
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
EVENTS_DIR = REPO_ROOT / "src" / "data" / "events"
CACHE_DIR = REPO_ROOT / "data" / "cache" / "wikipedia-ncaa"

USER_AGENT = "CollegeGolfData/0.1 (mikkelgolfllc@gmail.com)"
RATE_LIMIT_SECONDS = 1.0
API_BASE = "https://en.wikipedia.org/w/api.php"


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", type=int, default=1939)
    ap.add_argument("--end", type=int, default=datetime.now().year)
    return ap.parse_args()


def cache_path(key: str) -> Path:
    return CACHE_DIR / f"{hashlib.sha1(key.encode()).hexdigest()}.json.gz"


def fetch_wikitext(title: str) -> str | None:
    p = cache_path(title)
    if p.exists():
        with gzip.open(p, "rt") as f:
            return json.load(f).get("wikitext")
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


def parse_individual_table(wt: str) -> list[dict]:
    """Find a wikitable that looks like an individual leaderboard.
    Heuristic: header row contains 'Position' or 'Place' or 'Rank' AND
    'Player' or 'Golfer' AND 'School'/'Team'."""
    out: list[dict] = []
    seen = set()
    for tbl in re.finditer(r"\{\|[\s\S]+?\n\|\}", wt):
        block = tbl.group(0)
        # Header detection
        head = block[:1500].lower()
        if not (
            ("position" in head or "place" in head or "rank" in head or "pos" in head)
            and ("player" in head or "golfer" in head or "name" in head)
            and ("school" in head or "team" in head or "college" in head)
        ):
            continue
        # Parse rows
        rows = re.split(r"\n\|-+", block)
        for chunk in rows[1:]:  # skip table header
            cells: list[str] = []
            for ln in chunk.strip().splitlines():
                ln = ln.strip()
                if not ln or ln.startswith(("{|", "|+", "|}")):
                    continue
                if ln.startswith("|") or ln.startswith("!"):
                    body = ln.lstrip("!|").strip()
                    if "||" in body:
                        cells.extend([c.strip() for c in body.split("||")])
                    else:
                        if re.match(r"^\w[^|]*\|", body):
                            body = body.split("|", 1)[1].strip()
                        cells.append(body)
            if len(cells) < 3:
                continue
            # Heuristic mapping: position, player, school, ... score / total
            pos_raw = cells[0]
            player_raw = cells[1]
            school_raw = cells[2] if len(cells) > 2 else ""
            score_raw = cells[-1] if len(cells) > 3 else ""

            pos_m = re.match(r"T?(\d+)", pos_raw)
            pos = int(pos_m.group(1)) if pos_m else None
            link = re.search(r"\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]", player_raw)
            if not link:
                # Try plain text
                player = re.sub(r"<[^>]+>", "", player_raw).strip()
            else:
                player = (link.group(2) or link.group(1)).strip()
            school_link = re.search(r"\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]", school_raw)
            school = (school_link.group(2) or school_link.group(1)).strip() if school_link else re.sub(r"<[^>]+>", "", school_raw).strip()
            score_m = re.search(r"\b(\d{3})\b", score_raw)
            score = int(score_m.group(1)) if score_m else None
            if not player or len(player) > 60 or player.lower() in {"player", "name"}:
                continue
            if (player, school) in seen:
                continue
            seen.add((player, school))
            out.append(
                {
                    "raw_name": player,
                    "team": school,
                    "individual_position": pos,
                    "total_to_par": None,
                    "total_strokes": score,
                    "rounds": [],
                    "sources": ["wikipedia"],
                }
            )
        if out:
            return out
    return out


def parse_meta(wt: str, year: int) -> dict:
    """Pull venue, course, dates from infobox."""
    ib_m = re.search(r"\{\{Infobox[\s\S]+?^\}\}", wt, re.M)
    course = None
    venue = None
    if ib_m:
        ib = ib_m.group(0)
        course_m = re.search(r"\|\s*(?:venue|course|location)\s*=\s*([^\n|]+)", ib, re.I)
        if course_m:
            raw = course_m.group(1).strip()
            link = re.search(r"\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]", raw)
            if link:
                course = (link.group(2) or link.group(1)).strip()
                venue = course
            else:
                course = re.sub(r"<[^>]+>", "", raw).strip()
                venue = course
    return {"course": course, "venue": venue}


def title_for(year: int) -> str:
    return f"{year} NCAA Division I men's golf championship"


def main() -> None:
    args = parse_args()
    EVENTS_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for year in range(args.start, args.end + 1):
        title = title_for(year)
        wt = fetch_wikitext(title)
        if not wt:
            print(f"[ncaa] {year}: no page")
            continue
        competitors = parse_individual_table(wt)
        meta = parse_meta(wt, year)
        if not competitors:
            print(f"[ncaa] {year}: no individual table")
            continue
        evt = {
            "tournament_id": f"ncaa-championship-{year}",
            "tournament": f"NCAA Division I Men's Golf Championship",
            "course": meta.get("course"),
            "start_date": f"{year}-05-15",  # rough — championship usually late-May / early-June
            "season_year": year,
            "gender": "m",
            "division": "Men - NCAA Division I",
            "competitors": competitors,
            "competitor_count": len(competitors),
            "team_count": len({c["team"] for c in competitors if c["team"]}),
            "built_at": datetime.now().isoformat(timespec="seconds") + "Z",
            "source": "wikipedia",
            "source_url": f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}",
        }
        out_path = EVENTS_DIR / f"ncaa-championship-{year}.json"
        out_path.write_text(json.dumps(evt, indent=2))
        written += 1
        print(f"[ncaa] {year}: +{len(competitors)} individuals, {evt['team_count']} teams")

    # Update events index.
    idx_path = EVENTS_DIR / "index.json"
    idx: list[dict] = json.loads(idx_path.read_text()) if idx_path.exists() else []
    by_id = {e["tournament_id"]: e for e in idx}
    for f in EVENTS_DIR.glob("ncaa-championship-*.json"):
        try:
            evt = json.loads(f.read_text())
        except Exception:
            continue
        by_id[evt["tournament_id"]] = {
            "file": f.name,
            "tournament_id": evt["tournament_id"],
            "tournament": evt["tournament"],
            "course": evt.get("course"),
            "start_date": evt.get("start_date"),
            "season_year": evt.get("season_year"),
            "gender": evt.get("gender"),
            "competitor_count": evt.get("competitor_count", 0),
            "team_count": evt.get("team_count", 0),
        }
    merged = sorted(by_id.values(), key=lambda e: (e.get("start_date") or "", e["tournament"]))
    idx_path.write_text(json.dumps(merged, indent=2))

    print(f"\nWrote {written} NCAA championship events; index now has {len(merged)} total.")


if __name__ == "__main__":
    main()
