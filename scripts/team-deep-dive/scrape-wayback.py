#!/usr/bin/env python
"""scrape-wayback.py — Internet Archive CDX walks for historical snapshots
of school news pages, ranking pages, GolfStat tournament archive, etc.

For each seed URL we care about, query CDX:
    http://web.archive.org/cdx/search/cdx?url=<URL>&output=json&from=<YYYY>&to=<YYYY>

Default policy: keep first snapshot per year + latest 3 per year per URL,
cap 500 snapshots per seed URL. For each kept snapshot:
    https://web.archive.org/web/<timestamp>/<original_url>

Fetch + cache + emit evidence files. Article-style snapshots get the same
extractor as scrape-school-news.py (light HTML strip).

Seed URLs per slug:
    - school athletics golf news index (matches scrape-school-news.py site
      mapping)
    - agoragolf.com Golfweek/Sagarin team rankings (cross-team, but indexed
      per pull)
    - sagarin.com/sports/menteams.htm
    - results.golfstat.com/public/leaderboards/archived.cfm
    - Conference championship pages (best-effort by slug)

Usage:
    ~/venv/bin/python scripts/team-deep-dive/scrape-wayback.py texas-tech men
    ~/venv/bin/python scripts/team-deep-dive/scrape-wayback.py oklahoma-state men --max-snapshots 200
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.http_cache import HttpCache  # noqa: E402

# Reuse SCHOOL_SITES from scrape-school-news.py
import importlib.util

_news_spec = importlib.util.spec_from_file_location(
    "school_news", Path(__file__).resolve().parent / "scrape-school-news.py"
)
_news_mod = importlib.util.module_from_spec(_news_spec)
_news_spec.loader.exec_module(_news_mod)  # type: ignore
SCHOOL_SITES = _news_mod.SCHOOL_SITES
extract_article_evidence = _news_mod.extract_article_evidence

REPO_ROOT = Path(__file__).resolve().parents[2]
EVIDENCE_ROOT = REPO_ROOT / "data" / "team-deep-dive" / "evidence"

CDX_API = "http://web.archive.org/cdx/search/cdx"

# Cross-team seed URLs (rankings, GolfStat archive). Always crawled regardless
# of which slug we're running for, but only once per session via cache.
GLOBAL_SEEDS = [
    "https://www.agoragolf.com/index.php/gw-sag",
    "http://sagarin.com/sports/menteams.htm",
    "https://results.golfstat.com/public/leaderboards/archived.cfm",
    "https://www.wagr.com/men/elite-amateurs",
]


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("gender", choices=["men", "women", "m", "w"])
    ap.add_argument("--max-snapshots", type=int, default=500, help="Per seed URL")
    ap.add_argument("--from-year", type=int, default=1996)
    ap.add_argument("--to-year", type=int, default=datetime.now().year)
    return ap.parse_args()


def cdx_query(http: HttpCache, target_url: str, from_year: int, to_year: int) -> list[dict]:
    """Query CDX API. Returns list of {timestamp, original, mimetype, status}."""
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
    if not rows or len(rows) < 2:
        return []
    header = rows[0]
    out = []
    for r in rows[1:]:
        rec = dict(zip(header, r))
        out.append(rec)
    return out


def select_snapshots(rows: list[dict], cap: int) -> list[dict]:
    """Default policy: first per year + latest 3 per year, cap total."""
    by_year: dict[str, list[dict]] = {}
    for r in rows:
        ts = r.get("timestamp", "")
        if len(ts) < 4:
            continue
        year = ts[:4]
        by_year.setdefault(year, []).append(r)
    selected: list[dict] = []
    for year in sorted(by_year):
        rs = sorted(by_year[year], key=lambda x: x["timestamp"])
        if not rs:
            continue
        # First per year
        selected.append(rs[0])
        # Latest 3 per year (skip if same as first)
        for r in rs[-3:]:
            if r is not rs[0]:
                selected.append(r)
    # Dedupe + cap
    seen = set()
    deduped = []
    for r in selected:
        key = r.get("timestamp")
        if key in seen:
            continue
        seen.add(key)
        deduped.append(r)
    return deduped[:cap]


def fetch_snapshot(http: HttpCache, row: dict) -> tuple[str, str] | None:
    timestamp = row.get("timestamp")
    original = row.get("original")
    if not timestamp or not original:
        return None
    snap_url = f"https://web.archive.org/web/{timestamp}/{original}"
    status, html, _ = http.get(snap_url)
    if status != 200 or not html:
        return None
    return snap_url, html


def write_evidence(slug: str, url: str, source: str, parsed: dict, original_url: str) -> Path:
    out_dir = EVIDENCE_ROOT / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    h = hashlib.sha1(url.encode()).hexdigest()
    p = out_dir / f"{h}.json"
    record = {
        "url": url,
        "original_url": original_url,
        "source": source,
        "fetched_at": datetime.now().isoformat(timespec="seconds") + "Z",
        **parsed,
    }
    p.write_text(json.dumps(record, indent=2))
    return p


def main() -> None:
    args = parse_args()
    if args.slug not in SCHOOL_SITES:
        print(f"WARN: no site mapping for slug '{args.slug}'; skipping wayback", file=sys.stderr)
        sys.exit(0)
    site = SCHOOL_SITES[args.slug]
    domain = site["domain"]
    news_path = site["news_path"]

    # Slug-specific seeds + global seeds
    seeds = [
        f"https://{domain}{news_path}",
        f"https://{domain}/sports/mens-golf",
    ] + GLOBAL_SEEDS

    http = HttpCache(rate_limit_seconds=2.0, respect_robots=False)
    # Wayback's robots respects original robots; we bypass since the original
    # publisher's robots may have changed. Internet Archive is permissive.

    written = 0
    for seed in seeds:
        rows = cdx_query(http, seed, args.from_year, args.to_year)
        if not rows:
            print(f"[wayback] {seed}: 0 snapshots")
            continue
        chosen = select_snapshots(rows, args.max_snapshots)
        print(f"[wayback] {seed}: {len(rows)} total, keeping {len(chosen)}")
        for i, row in enumerate(chosen, 1):
            res = fetch_snapshot(http, row)
            if not res:
                continue
            snap_url, html = res
            try:
                parsed = extract_article_evidence(snap_url, html)
            except Exception:
                continue
            if not parsed.get("raw_text") or len(parsed["raw_text"]) < 100:
                continue
            # Drop links_extracted to keep evidence small (snapshots often have
            # archive UI noise).
            parsed["links_extracted"] = parsed.get("links_extracted", [])[:30]
            parsed["wayback_timestamp"] = row.get("timestamp")
            write_evidence(
                args.slug,
                snap_url,
                "wayback",
                parsed,
                original_url=row.get("original", ""),
            )
            written += 1
            if i % 25 == 0:
                print(f"[wayback]   {i}/{len(chosen)} for {seed} done")
    print(f"\n[wayback] done — {written} new evidence files")


if __name__ == "__main__":
    main()
