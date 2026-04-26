#!/usr/bin/env python
"""
scrape-gcaa-all-americans.py — pull every D1 men's golf All-American on
record from the Golf Coaches Association of America (GCAA) database.

Source: https://gcaa.coach/awards/search-past-awards — Joomla site with a
paginated results table. URL filter params don't reliably filter, so we
walk all pages and filter in Python (division=I, men's only — but the
award name itself is gender-implicit since "All-America Team 1" etc. are
the men's PING teams).

Output: data/team-deep-dive/gcaa-all-americans.json — flat array of
{year, tier, player, school, division, source_url, scraped_at}.

Usage:
    ~/venv/bin/python scripts/team-deep-dive/scrape-gcaa-all-americans.py
    ~/venv/bin/python scripts/team-deep-dive/scrape-gcaa-all-americans.py --max-pages 50  # quick smoke
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
from urllib.parse import urlencode

import requests
from bs4 import BeautifulSoup

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = REPO_ROOT / "data" / "team-deep-dive"
CACHE_DIR = REPO_ROOT / "data" / "cache" / "gcaa"

BASE_URL = "https://gcaa.coach/awards/search-past-awards"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
RATE_LIMIT_SECONDS = 3.0

AWARD_TIER = {
    "All-America Team 1": "first_team",
    "All-America Team 2": "second_team",
    "All-America Team 3": "third_team",
    "All-American Honorable Mention": "honorable_mention",
}

# Division values we keep (D-I men's golf is "I"; women's golf doesn't appear
# in this PING D-I list — they have a separate WGCA list).
KEEP_DIVISIONS = {"I"}


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-pages", type=int, default=None, help="Cap pages (debug)")
    ap.add_argument("--no-cache", action="store_true")
    return ap.parse_args()


def cache_path(url: str) -> Path:
    h = hashlib.sha1(url.encode()).hexdigest()
    return CACHE_DIR / f"{h}.html.gz"


_session: requests.Session | None = None


def get_session() -> requests.Session:
    global _session
    if _session is None:
        _session = requests.Session()
        _session.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"})
    return _session


def fetch(url: str, use_cache: bool = True, retries: int = 5) -> str:
    p = cache_path(url)
    if use_cache and p.exists():
        with gzip.open(p, "rt") as f:
            return f.read()
    sess = get_session()
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            r = sess.get(url, timeout=30)
            r.raise_for_status()
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            with gzip.open(p, "wt") as f:
                f.write(r.text)
            time.sleep(RATE_LIMIT_SECONDS)
            return r.text
        except (requests.ConnectionError, requests.Timeout, requests.HTTPError) as e:
            last_err = e
            backoff = (2 ** attempt) * 5
            print(f"[gcaa] retry {attempt+1} after {backoff}s ({e})", file=sys.stderr)
            time.sleep(backoff)
    raise last_err if last_err else RuntimeError("retries exhausted")


def parse_page(html: str, source_url: str, scraped_at: str) -> tuple[list[dict], int]:
    """Returns (rows, total_records). Rows match this schema:
    {year, tier, player, school, division, source_url, scraped_at}.
    """
    soup = BeautifulSoup(html, "html.parser")
    out: list[dict] = []
    tbody = soup.find("tbody")
    if not tbody:
        return [], 0
    for tr in tbody.find_all("tr"):
        # Skip empty/data-message rows.
        if "groupDataMsg" in (tr.get("class") or []) or tr.find("td", class_="emptyDataMessage"):
            continue
        cells = [c.get_text(" ", strip=True) for c in tr.find_all("td")]
        if len(cells) < 6:
            continue
        award_raw, first, last, school, division, year, *_ = cells
        tier = AWARD_TIER.get(award_raw)
        if not tier:
            continue
        if division not in KEEP_DIVISIONS:
            continue
        try:
            yr = int(year)
        except ValueError:
            continue
        out.append(
            {
                "year": yr,
                "tier": tier,
                "player": f"{first} {last}".strip(),
                "school": school,
                "division": division,
                "source_url": source_url,
                "scraped_at": scraped_at,
            }
        )

    # Find total record count from "Page X of Y" or pagination text.
    text = soup.get_text(" ", strip=True)
    m = re.search(r"Page\s+(\d+)\s+of\s+(\d+)", text)
    total_pages = int(m.group(2)) if m else 1
    return out, total_pages


def main() -> None:
    args = parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    scraped_at = datetime.now().isoformat(timespec="seconds") + "Z"

    all_rows: list[dict] = []
    page = 0
    total_pages: int | None = None
    LIMIT = 10  # site default; trying to override is rejected by the edge

    while True:
        limitstart = page * LIMIT
        url = f"{BASE_URL}?limitstart={limitstart}" if limitstart else BASE_URL
        try:
            html = fetch(url, use_cache=not args.no_cache)
        except Exception as e:
            print(f"[gcaa] page {page} fetch failed: {e}", file=sys.stderr)
            break
        rows, total_pages_observed = parse_page(html, url, scraped_at)
        all_rows.extend(rows)
        # Heuristic stop: empty pages or hit total pages.
        if not rows and page > 0:
            print(f"[gcaa] empty page {page}; stopping")
            break
        if total_pages is None and total_pages_observed:
            print(f"[gcaa] total pages reported: {total_pages_observed}")
            total_pages = total_pages_observed
        page += 1
        if page % 10 == 0:
            print(f"[gcaa] page {page} ({len(all_rows)} D-I rows so far)")
        if args.max_pages and page >= args.max_pages:
            print(f"[gcaa] hit --max-pages limit")
            break
        if total_pages and page > total_pages:
            print(f"[gcaa] reached estimated total ({page} > {total_pages}); stopping")
            break

    # Dedupe.
    seen = set()
    deduped = []
    for r in all_rows:
        key = (r["year"], r["tier"], r["player"], r["school"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(r)

    out_path = OUT_DIR / "gcaa-all-americans.json"
    out_path.write_text(json.dumps(deduped, indent=2))
    print(f"\nWrote {out_path}")
    print(f"Total D-I men's All-Americans: {len(deduped)}")
    if not deduped:
        return
    from collections import Counter

    by_year = Counter(r["year"] for r in deduped)
    by_tier = Counter(r["tier"] for r in deduped)
    schools = Counter(r["school"] for r in deduped)
    print(f"Year range: {min(by_year)}-{max(by_year)} ({len(by_year)} years)")
    print(f"By tier: {dict(by_tier)}")
    print(f"Distinct schools: {len(schools)}")
    print("Top 10 schools by All-American count:")
    for s, n in schools.most_common(10):
        print(f"  {n:>4}  {s}")


if __name__ == "__main__":
    main()
