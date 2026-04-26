#!/usr/bin/env python
"""scrape-rankings-history.py — pulls historical team + individual rankings
from Wayback snapshots of:
  - Sagarin men's college team ratings (sagarin.com/sports/menteams.htm)
  - Golfweek/Sagarin via agoragolf.com
  - WAGR amateur rankings (wagr.com)
  - Junior Golf Scoreboard top-N (juniorgolfscoreboard.com)
  - Clippd current snapshot (modern only, already weekly-cron)

Output: data/team-deep-dive/ranking-snapshots.json — flat array of
{source, as_of_date, team_slug?, player_name?, value, value_meta, source_url}.

This complements the per-team evidence files: rankings get their own
top-level JSON because they're cross-team by nature.

Usage:
    ~/venv/bin/python scripts/team-deep-dive/scrape-rankings-history.py
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
OUT_PATH = REPO_ROOT / "data" / "team-deep-dive" / "ranking-snapshots.json"
CDX_API = "http://web.archive.org/cdx/search/cdx"

# Seed pages that hold rankings worth snapshotting through Wayback.
SEED_URLS = [
    {"source": "sagarin", "url": "http://sagarin.com/sports/menteams.htm", "kind": "team"},
    {"source": "agoragolf_sagarin", "url": "https://www.agoragolf.com/index.php/gw-sag", "kind": "team"},
    {"source": "wagr", "url": "https://www.wagr.com/men/elite-amateurs", "kind": "individual"},
    {"source": "wagr_top_100", "url": "https://www.wagr.com/men/elite-amateurs?division=college", "kind": "individual"},
    {"source": "jgs_top_class", "url": "https://www.juniorgolfscoreboard.com/Rankings/USRankings.aspx", "kind": "individual"},
]


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-year", type=int, default=2004)
    ap.add_argument("--to-year", type=int, default=datetime.now().year)
    ap.add_argument("--max-snapshots", type=int, default=300)
    return ap.parse_args()


def cdx_query(http: HttpCache, target_url: str, from_year: int, to_year: int) -> list[dict]:
    params = (
        f"?url={target_url}&output=json&from={from_year}0101&to={to_year}1231"
        f"&filter=statuscode:200&filter=mimetype:text/html&collapse=timestamp:6"
    )
    status, text, _ = http.get(CDX_API + params)
    if status != 200 or not text.strip():
        return []
    try:
        rows = json.loads(text)
    except json.JSONDecodeError:
        return []
    if len(rows) < 2:
        return []
    header = rows[0]
    return [dict(zip(header, r)) for r in rows[1:]]


def select_one_per_quarter(rows: list[dict], cap: int) -> list[dict]:
    """Take one snapshot per calendar quarter — captures rank movement nicely
    without over-fetching."""
    by_q: dict[str, dict] = {}
    for r in rows:
        ts = r.get("timestamp", "")
        if len(ts) < 6:
            continue
        year = ts[:4]
        month = int(ts[4:6])
        quarter = (month - 1) // 3 + 1
        key = f"{year}Q{quarter}"
        if key not in by_q:
            by_q[key] = r
    return list(by_q.values())[:cap]


# --------- Per-source parsers ------------------------------------------------

def parse_sagarin_teams(html: str, as_of_date: str, source_url: str) -> list[dict]:
    """Sagarin's plain-text page: each team line has rank + name + rating."""
    out = []
    # Lines look like:
    #   1  Oklahoma State          A  =  90.00 ...
    pat = re.compile(r"^\s*(\d+)\s+([A-Za-z][A-Za-z &\-'.()]+?)\s{2,}", re.M)
    for m in pat.finditer(html):
        rank = int(m.group(1))
        team = m.group(2).strip()
        out.append(
            {
                "source": "sagarin",
                "kind": "team",
                "as_of_date": as_of_date,
                "team_name": team,
                "value": rank,
                "value_meta": {},
                "source_url": source_url,
            }
        )
    return out[:400]  # Sagarin lists ~300 teams


def parse_wagr_individual(html: str, as_of_date: str, source_url: str) -> list[dict]:
    """WAGR pages render as HTML tables. Extract rows with rank + player name +
    country."""
    out = []
    # Heuristic: rows look like <tr ...><td>1</td><td>Player Name</td>...</tr>
    rows = re.findall(r"<tr[^>]*>([\s\S]+?)</tr>", html)
    for tr in rows:
        cells = re.findall(r"<td[^>]*>([\s\S]+?)</td>", tr)
        cells = [re.sub(r"<[^>]+>", "", c).strip() for c in cells]
        if len(cells) < 3:
            continue
        if not cells[0].isdigit():
            continue
        rank = int(cells[0])
        # Player name is usually cells[1] or cells[2].
        name = cells[1] if len(cells[1]) > 3 and not cells[1].isdigit() else cells[2]
        if not name or len(name) > 60:
            continue
        out.append(
            {
                "source": "wagr",
                "kind": "individual",
                "as_of_date": as_of_date,
                "player_name": name,
                "value": rank,
                "value_meta": {},
                "source_url": source_url,
            }
        )
    return out[:500]


def parse_jgs_individual(html: str, as_of_date: str, source_url: str) -> list[dict]:
    """JGS uses an ASP.NET grid; extract rank + player name + class year."""
    out = []
    rows = re.findall(r"<tr[^>]*>([\s\S]+?)</tr>", html)
    for tr in rows:
        cells = re.findall(r"<td[^>]*>([\s\S]+?)</td>", tr)
        cells = [re.sub(r"<[^>]+>", "", c).strip() for c in cells]
        if len(cells) < 3:
            continue
        if not cells[0].isdigit():
            continue
        rank = int(cells[0])
        name = cells[1] if len(cells[1]) > 3 else cells[2]
        if not name or len(name) > 60:
            continue
        out.append(
            {
                "source": "jgs",
                "kind": "individual",
                "as_of_date": as_of_date,
                "player_name": name,
                "value": rank,
                "value_meta": {},
                "source_url": source_url,
            }
        )
    return out[:500]


PARSERS = {
    "sagarin": parse_sagarin_teams,
    "agoragolf_sagarin": parse_sagarin_teams,
    "wagr": parse_wagr_individual,
    "wagr_top_100": parse_wagr_individual,
    "jgs_top_class": parse_jgs_individual,
}


def main() -> None:
    args = parse_args()
    http = HttpCache(rate_limit_seconds=2.0, respect_robots=False)

    all_rows: list[dict] = []
    for seed in SEED_URLS:
        rows = cdx_query(http, seed["url"], args.from_year, args.to_year)
        if not rows:
            print(f"[rankings] {seed['source']}: 0 CDX rows")
            continue
        chosen = select_one_per_quarter(rows, args.max_snapshots)
        print(f"[rankings] {seed['source']}: {len(rows)} CDX rows, keeping {len(chosen)} (one per quarter)")
        for row in chosen:
            ts = row.get("timestamp", "")
            if len(ts) < 8:
                continue
            as_of_date = f"{ts[:4]}-{ts[4:6]}-{ts[6:8]}"
            snap_url = f"https://web.archive.org/web/{ts}/{row.get('original')}"
            status, html, _ = http.get(snap_url)
            if status != 200 or not html:
                continue
            parser = PARSERS.get(seed["source"])
            if not parser:
                continue
            try:
                snap_rows = parser(html, as_of_date, snap_url)
            except Exception as e:
                print(f"[rankings]   parse failed for {snap_url}: {e}", file=sys.stderr)
                continue
            all_rows.extend(snap_rows)
        print(f"[rankings] {seed['source']}: cumulative {len(all_rows)} rows so far")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(all_rows, indent=2))
    print(f"\n[rankings] done — {len(all_rows)} ranking rows in {OUT_PATH}")


if __name__ == "__main__":
    main()
