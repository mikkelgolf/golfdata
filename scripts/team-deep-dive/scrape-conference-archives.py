#!/usr/bin/env python
"""scrape-conference-archives.py — pull conference championship history from
each conference site + Wayback snapshots.

Each conference has its own site/URL pattern. Mappings cover the program's
historical conference home (SWC for TT pre-1996, Big 8/12 OSU, etc.).

Output: data/team-deep-dive/conference-history.json — flat array of
{conference, year, champion, medalist?, host_school?, source_url}.

Usage:
    ~/venv/bin/python scripts/team-deep-dive/scrape-conference-archives.py
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.http_cache import HttpCache  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_PATH = REPO_ROOT / "data" / "team-deep-dive" / "conference-history.json"

# Conference championship index URLs. Wikipedia is the most reliable
# cross-conference source for historical championship medalists; we hit those
# first, then conference-specific sites for any gaps.
CONFERENCE_INDEXES = [
    {"conference": "SEC", "wiki": "SEC men's golf championship"},
    {"conference": "ACC", "wiki": "ACC men's golf championship"},
    {"conference": "Big 12", "wiki": "Big 12 men's golf championship"},
    {"conference": "Big Ten", "wiki": "Big Ten men's golf championship"},
    {"conference": "Pac-12", "wiki": "Pac-12 men's golf championship"},
    {"conference": "Big East", "wiki": "Big East men's golf championship"},
    {"conference": "Southwest Conference", "wiki": "Southwest Conference men's golf championship"},
    {"conference": "Big Eight", "wiki": "Big Eight Conference men's golf championship"},
]

WIKI_API = "https://en.wikipedia.org/w/api.php"


def fetch_wikitext(http: HttpCache, title: str) -> str | None:
    url = f"{WIKI_API}?action=parse&page={title.replace(' ', '_')}&prop=wikitext&format=json&redirects=1"
    status, _, _ = http.get(url)
    if status != 200:
        return None
    # The HttpCache helper returns the response text; for JSON endpoints we
    # need to parse it.
    cache_path = http._cache_path(url)
    import gzip

    if cache_path.exists():
        with gzip.open(cache_path, "rt") as f:
            text = f.read()
        try:
            j = json.loads(text)
        except json.JSONDecodeError:
            return None
        return j.get("parse", {}).get("wikitext", {}).get("*")
    return None


def parse_championship_table(wt: str, conference: str) -> list[dict]:
    """Extract rows from a Wikipedia wikitable that lists year/champion/medalist."""
    out: list[dict] = []
    if not wt:
        return out
    # Locate any wikitable
    for tbl in re.finditer(r"\{\|[\s\S]+?\n\|\}", wt):
        block = tbl.group(0)
        rows = re.split(r"\n\|-+", block)
        for chunk in rows[1:]:
            cells: list[str] = []
            for ln in chunk.strip().splitlines():
                ln = ln.strip()
                if not ln or ln.startswith(("{|", "|+", "|}")):
                    continue
                if ln.startswith(("|", "!")):
                    body = ln.lstrip("!|").strip()
                    if "||" in body:
                        cells.extend([c.strip() for c in body.split("||")])
                    else:
                        if re.match(r"^\w[^|]*\|", body):
                            body = body.split("|", 1)[1].strip()
                        cells.append(body)
            if not cells:
                continue
            year_m = re.match(r"^(\d{4})$", cells[0])
            if not year_m:
                continue
            year = int(year_m.group(1))
            # Champion: first link in cells[1]
            champ_link = re.search(r"\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]", cells[1] if len(cells) > 1 else "")
            champion = (
                champ_link.group(2) or champ_link.group(1) if champ_link else (cells[1] if len(cells) > 1 else "")
            )
            # Medalist: usually cells[2] or wherever a player link appears.
            medalist = None
            for c in cells[2:]:
                pl = re.search(r"\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]", c)
                if pl:
                    nm = pl.group(2) or pl.group(1)
                    if nm and len(nm) < 60 and not nm.startswith("Category:"):
                        medalist = nm
                        break
            host = None
            if len(cells) > 3:
                host_m = re.search(r"\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]", cells[-1])
                if host_m:
                    host = host_m.group(2) or host_m.group(1)
            out.append(
                {
                    "conference": conference,
                    "year": year,
                    "champion": champion.strip(),
                    "medalist": medalist,
                    "host_school": host,
                }
            )
    return out


def main() -> None:
    http = HttpCache(rate_limit_seconds=1.0, respect_robots=False)
    all_rows: list[dict] = []
    for cfg in CONFERENCE_INDEXES:
        wt = fetch_wikitext(http, cfg["wiki"])
        if not wt:
            print(f"[conf] {cfg['conference']}: no wiki page found")
            continue
        rows = parse_championship_table(wt, cfg["conference"])
        print(f"[conf] {cfg['conference']}: {len(rows)} championship years")
        for r in rows:
            r["source_url"] = f"https://en.wikipedia.org/wiki/{cfg['wiki'].replace(' ', '_')}"
        all_rows.extend(rows)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(all_rows, indent=2))
    print(f"\n[conf] done — {len(all_rows)} rows in {OUT_PATH}")


if __name__ == "__main__":
    main()
