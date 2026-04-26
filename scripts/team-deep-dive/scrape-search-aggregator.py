#!/usr/bin/env python
"""scrape-search-aggregator.py — Searx-driven structured search per team.

Runs ~500 structured queries via the local Searx instance at
http://localhost:8888. For each query, captures top 20 results (URL +
title + snippet) and emits one evidence file per result.

If Searx isn't reachable (Docker not installed or not started), this
phase no-ops gracefully — the rest of the pipeline produces deep coverage
without it.

Query suite per team:
  - "<School>" men's golf <year>           # × every year 1950-current
  - "<School>" "all-american"              # × tier modifiers
  - "<School>" "national championship" golf
  - "<School>" "conference championship" golf
  - "<School>" "PGA Tour" alumni
  - "<School>" "head coach" golf
  - "<School>" hall of fame golf
  - "<player>" "<School>"                  # × known roster names

Usage:
    ~/venv/bin/python scripts/team-deep-dive/scrape-search-aggregator.py texas-tech men
    ~/venv/bin/python scripts/team-deep-dive/scrape-search-aggregator.py oklahoma-state men --max-queries 200
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.http_cache import HttpCache  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
EVIDENCE_ROOT = REPO_ROOT / "data" / "team-deep-dive" / "evidence"
PLAYERS_INDEX = REPO_ROOT / "src" / "data" / "players" / "index.json"

SEARX_BASE = "http://localhost:8888/search"

# Display names — reuse from the wiki scraper if needed.
SCHOOL_DISPLAY: dict[str, str] = {
    "texas-tech": "Texas Tech",
    "oklahoma-state": "Oklahoma State",
    "stanford": "Stanford",
    "vanderbilt": "Vanderbilt",
    "auburn": "Auburn",
    "alabama": "Alabama",
    "arkansas": "Arkansas",
    "georgia": "Georgia",
    "lsu": "LSU",
    "florida": "Florida",
    "tennessee": "Tennessee",
    "arizona-state": "Arizona State",
    "north-carolina": "North Carolina",
    "nc-state": "NC State",
    "duke": "Duke",
    "wake-forest": "Wake Forest",
    "virginia": "Virginia",
    "clemson": "Clemson",
    "florida-state": "Florida State",
    "ohio-state": "Ohio State",
    "michigan": "Michigan",
    "purdue": "Purdue",
    "illinois": "Illinois",
    "northwestern": "Northwestern",
    "oklahoma": "Oklahoma",
    "tcu": "TCU",
    "smu": "SMU",
    "houston": "Houston",
    "baylor": "Baylor",
    "texas": "Texas",
    "brigham-young": "BYU",
    "pepperdine": "Pepperdine",
    "california": "California",
    "washington": "Washington",
    "oregon": "Oregon",
    "utah": "Utah",
}


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("gender", choices=["men", "women", "m", "w"])
    ap.add_argument("--max-queries", type=int, default=500)
    ap.add_argument("--from-year", type=int, default=1950)
    ap.add_argument("--to-year", type=int, default=datetime.now().year)
    return ap.parse_args()


def is_searx_up(http: HttpCache) -> bool:
    status, text, _ = http.get(f"{SEARX_BASE}?q=ping&format=json")
    if status != 200:
        return False
    try:
        json.loads(text)
        return True
    except Exception:
        return False


def build_query_suite(slug: str, school: str, args: argparse.Namespace) -> list[str]:
    queries = []
    for year in range(args.from_year, args.to_year + 1):
        queries.append(f'"{school}" men\'s golf {year}')
    queries += [
        f'"{school}" "all-american" golf',
        f'"{school}" "first team all-american" golf',
        f'"{school}" "national championship" golf',
        f'"{school}" "conference championship" golf',
        f'"{school}" "PGA Tour" alumni golf',
        f'"{school}" "Walker Cup" golf',
        f'"{school}" "Palmer Cup" golf',
        f'"{school}" "U.S. Amateur" golf',
        f'"{school}" "head coach" men\'s golf',
        f'"{school}" "hall of fame" golf',
        f'"{school}" "low round" men\'s golf',
        f'"{school}" "letterwinner" men\'s golf',
    ]
    # Per-player queries — pull from existing player index if available.
    if PLAYERS_INDEX.exists():
        idx = json.loads(PLAYERS_INDEX.read_text())
        names = sorted(
            {e["raw_name"] for e in idx if e["school_slug"] == slug and e["gender"] == "m"}
        )
        for name in names[:60]:  # cap so we don't blow query budget
            queries.append(f'"{name}" "{school}" golf')
    return queries[: args.max_queries]


def search(http: HttpCache, query: str) -> list[dict]:
    url = f"{SEARX_BASE}?q={query}&format=json&pageno=1"
    status, text, _ = http.get(url)
    if status != 200:
        return []
    try:
        data = json.loads(text)
    except Exception:
        return []
    return (data.get("results") or [])[:20]


def write_evidence(slug: str, query: str, result: dict) -> Path:
    out_dir = EVIDENCE_ROOT / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    url = result.get("url") or ""
    h = hashlib.sha1((query + "|" + url).encode()).hexdigest()
    p = out_dir / f"{h}.json"
    record = {
        "url": url,
        "source": "searx_serp",
        "fetched_at": datetime.now().isoformat(timespec="seconds") + "Z",
        "title": result.get("title") or "",
        "raw_text": (result.get("content") or "")[:2000],
        "headings": [],
        "links_extracted": [],
        "search_query": query,
        "engines": result.get("engines") or [],
    }
    p.write_text(json.dumps(record, indent=2))
    return p


def main() -> None:
    args = parse_args()
    if args.slug not in SCHOOL_DISPLAY:
        print(f"WARN: no display name for {args.slug}; skipping search_aggregator", file=sys.stderr)
        sys.exit(0)
    school = SCHOOL_DISPLAY[args.slug]

    http = HttpCache(rate_limit_seconds=0.5, respect_robots=False)
    if not is_searx_up(http):
        print(
            "[searx] localhost:8888 not reachable — Searx not installed or not running.\n"
            "        Run scripts/team-deep-dive/searx-setup.sh once on the Mac Mini, then re-run this phase.\n"
            "        Pipeline continues without search-aggregator coverage.",
            file=sys.stderr,
        )
        return

    queries = build_query_suite(args.slug, school, args)
    print(f"[searx] {args.slug}: {len(queries)} queries")
    written = 0
    for i, query in enumerate(queries, 1):
        results = search(http, query)
        for r in results:
            write_evidence(args.slug, query, r)
            written += 1
        if i % 25 == 0:
            print(f"[searx]   {i}/{len(queries)} queries done, {written} SERP evidence files")
    print(f"\n[searx] done — {written} SERP evidence files")


if __name__ == "__main__":
    main()
