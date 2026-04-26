#!/usr/bin/env python
"""scrape-usga-amateur.py — pull historical USGA amateur championship fields.

Sources:
  - US Amateur (1895-present): Wikipedia year-by-year pages
  - US Mid-Amateur (1981-present): Wikipedia + USGA
  - US Open qualifying records: Wikipedia year-by-year (medalists list)
  - Walker Cup already covered by scrape-cups.py

Output: data/team-deep-dive/usga-amateur-history.json — flat array of
{championship, year, player, school?, finish?, source_url}.

Usage:
    ~/venv/bin/python scripts/team-deep-dive/scrape-usga-amateur.py
"""

from __future__ import annotations

import argparse
import gzip
import json
import re
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.http_cache import HttpCache  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_PATH = REPO_ROOT / "data" / "team-deep-dive" / "usga-amateur-history.json"
WIKI_API = "https://en.wikipedia.org/w/api.php"

CHAMPIONSHIP_TITLES = [
    {"name": "US Amateur", "wiki_template": "{year} U.S. Amateur (golf)"},
    {"name": "US Mid-Amateur", "wiki_template": "{year} U.S. Mid-Amateur"},
    {"name": "US Junior Amateur", "wiki_template": "{year} U.S. Junior Amateur"},
]


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-year", type=int, default=1980)
    ap.add_argument("--to-year", type=int, default=datetime.now().year)
    return ap.parse_args()


def fetch_wikitext(http: HttpCache, title: str) -> str | None:
    url = f"{WIKI_API}?action=parse&page={title.replace(' ', '_')}&prop=wikitext&format=json&redirects=1"
    status, _, _ = http.get(url)
    cache_path = http._cache_path(url)
    if not cache_path.exists():
        return None
    with gzip.open(cache_path, "rt") as f:
        text = f.read()
    try:
        j = json.loads(text)
    except json.JSONDecodeError:
        return None
    return j.get("parse", {}).get("wikitext", {}).get("*")


def parse_winner_and_finalist(wt: str) -> tuple[str | None, str | None]:
    """Extract winner + runner-up from infobox or page lead."""
    if not wt:
        return None, None
    ib_m = re.search(r"\{\{Infobox[\s\S]+?^\}\}", wt, re.M)
    if ib_m:
        ib = ib_m.group(0)
        winner = None
        runner = None
        for label, target in (
            ("champion", "winner"),
            ("winner", "winner"),
            ("runner-up", "runner"),
            ("runner_up", "runner"),
        ):
            m = re.search(rf"\|\s*{label}\s*=\s*([^\n|]+)", ib, re.I)
            if m:
                raw = m.group(1).strip()
                link = re.search(r"\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]", raw)
                name = (link.group(2) or link.group(1)).strip() if link else re.sub(r"<[^>]+>", "", raw).strip()
                if target == "winner":
                    winner = name
                else:
                    runner = name
        return winner, runner
    return None, None


def main() -> None:
    args = parse_args()
    http = HttpCache(rate_limit_seconds=1.0, respect_robots=False)
    all_rows: list[dict] = []

    for ch in CHAMPIONSHIP_TITLES:
        for year in range(args.from_year, args.to_year + 1):
            title = ch["wiki_template"].format(year=year)
            wt = fetch_wikitext(http, title)
            if not wt:
                continue
            winner, runner = parse_winner_and_finalist(wt)
            source_url = f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}"
            if winner:
                all_rows.append(
                    {
                        "championship": ch["name"],
                        "year": year,
                        "player": winner,
                        "finish": "champion",
                        "source_url": source_url,
                    }
                )
            if runner:
                all_rows.append(
                    {
                        "championship": ch["name"],
                        "year": year,
                        "player": runner,
                        "finish": "runner-up",
                        "source_url": source_url,
                    }
                )
        print(f"[usga] {ch['name']}: cumulative {len(all_rows)} rows after {args.to_year}")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(all_rows, indent=2))
    print(f"\n[usga] done — {len(all_rows)} rows in {OUT_PATH}")


if __name__ == "__main__":
    main()
