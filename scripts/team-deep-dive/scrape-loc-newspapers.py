#!/usr/bin/env python
"""scrape-loc-newspapers.py — Library of Congress Chronicling America for
pre-1963 historical newspaper coverage of a college golf program.

API: https://chroniclingamerica.loc.gov/search/pages/results/?...&format=json
Free, no auth, generous rate limits. Searches OCR'd US newspaper text.
Coverage is best 1900-1963; gaps in some states.

Strategy per slug:
  1. Build an OCR-friendly query: "<School> golf" within the program's
     home state, year-bounded.
  2. Walk pages of results (default 25 per page; up to ~10 pages = 250
     hits per query).
  3. Each hit has an OCR text URL — fetch that, write evidence.

Per-slug state filter narrows results to in-state papers (most program
news is local), with optional country-wide fallback for big championships.

Usage:
    ~/venv/bin/python scripts/team-deep-dive/scrape-loc-newspapers.py texas-tech men
    ~/venv/bin/python scripts/team-deep-dive/scrape-loc-newspapers.py oklahoma-state men
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.http_cache import HttpCache  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
EVIDENCE_ROOT = REPO_ROOT / "data" / "team-deep-dive" / "evidence"

LOC_BASE = "https://chroniclingamerica.loc.gov/search/pages/results/"

# Slug → (school name in OCR, primary state code, optional alt names)
SCHOOL_OCR: dict[str, dict] = {
    "texas-tech": {"name": "Texas Tech", "state": "tx", "alt": ["Red Raiders", "Texas Technological"]},
    "oklahoma-state": {"name": "Oklahoma State", "state": "ok", "alt": ["Oklahoma A. and M.", "Oklahoma A&M", "Cowboys"]},
    "stanford": {"name": "Stanford", "state": "ca", "alt": ["Cardinal", "Indians"]},
    "vanderbilt": {"name": "Vanderbilt", "state": "tn", "alt": ["Commodores"]},
    "auburn": {"name": "Auburn", "state": "al", "alt": ["Tigers", "Plainsmen"]},
    "alabama": {"name": "Alabama", "state": "al", "alt": ["Crimson Tide"]},
    "arkansas": {"name": "Arkansas", "state": "ar", "alt": ["Razorbacks"]},
    "georgia": {"name": "Georgia", "state": "ga", "alt": ["Bulldogs"]},
    "lsu": {"name": "Louisiana State", "state": "la", "alt": ["LSU", "Tigers"]},
    "florida": {"name": "Florida", "state": "fl", "alt": ["Gators"]},
    "tennessee": {"name": "Tennessee", "state": "tn", "alt": ["Volunteers"]},
    "arizona-state": {"name": "Arizona State", "state": "az", "alt": ["Sun Devils"]},
    "north-carolina": {"name": "North Carolina", "state": "nc", "alt": ["Tar Heels"]},
    "nc-state": {"name": "North Carolina State", "state": "nc", "alt": ["Wolfpack"]},
    "duke": {"name": "Duke", "state": "nc", "alt": ["Blue Devils"]},
    "wake-forest": {"name": "Wake Forest", "state": "nc", "alt": ["Demon Deacons"]},
    "virginia": {"name": "Virginia", "state": "va", "alt": ["Cavaliers"]},
    "clemson": {"name": "Clemson", "state": "sc", "alt": ["Tigers"]},
    "florida-state": {"name": "Florida State", "state": "fl", "alt": ["Seminoles"]},
    "ohio-state": {"name": "Ohio State", "state": "oh", "alt": ["Buckeyes"]},
    "michigan": {"name": "Michigan", "state": "mi", "alt": ["Wolverines"]},
    "purdue": {"name": "Purdue", "state": "in", "alt": ["Boilermakers"]},
    "illinois": {"name": "Illinois", "state": "il", "alt": ["Fighting Illini"]},
    "northwestern": {"name": "Northwestern", "state": "il", "alt": ["Wildcats"]},
    "oklahoma": {"name": "Oklahoma", "state": "ok", "alt": ["Sooners"]},
    "tcu": {"name": "Texas Christian", "state": "tx", "alt": ["TCU", "Horned Frogs"]},
    "smu": {"name": "Southern Methodist", "state": "tx", "alt": ["SMU", "Mustangs"]},
    "houston": {"name": "Houston", "state": "tx", "alt": ["Cougars"]},
    "baylor": {"name": "Baylor", "state": "tx", "alt": ["Bears"]},
    "texas": {"name": "Texas", "state": "tx", "alt": ["Longhorns"]},
    "brigham-young": {"name": "Brigham Young", "state": "ut", "alt": ["BYU", "Cougars"]},
}


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("gender", choices=["men", "women", "m", "w"])
    ap.add_argument("--from-year", type=int, default=1925)
    ap.add_argument("--to-year", type=int, default=1963)  # LoC coverage thins post-1963
    ap.add_argument("--max-pages", type=int, default=10, help="Result pages per query")
    return ap.parse_args()


def build_queries(school: dict) -> list[str]:
    """Variants of '<school> golf' to maximize OCR recall."""
    base_names = [school["name"]] + school.get("alt", [])
    queries = []
    for nm in base_names:
        queries.append(f"\"{nm}\" golf")
    return queries


def search_loc(
    http: HttpCache, query: str, state: str, from_year: int, to_year: int, page: int
) -> dict | None:
    params = {
        "andtext": query,
        "state": state,
        "dateFilterType": "yearRange",
        "date1": str(from_year),
        "date2": str(to_year),
        "format": "json",
        "rows": "25",
        "page": str(page),
    }
    url = LOC_BASE + "?" + urlencode(params)
    status, text, _ = http.get(url)
    if status != 200 or not text.strip():
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def fetch_ocr_text(http: HttpCache, page_id: str) -> str | None:
    """LoC OCR text URL: https://chroniclingamerica.loc.gov/<page_id>/ocr.txt"""
    url = f"https://chroniclingamerica.loc.gov{page_id}ocr.txt"
    status, text, _ = http.get(url)
    if status != 200 or not text.strip():
        return None
    return text[:8000]


def write_evidence(slug: str, url: str, parsed: dict) -> Path:
    out_dir = EVIDENCE_ROOT / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    h = hashlib.sha1(url.encode()).hexdigest()
    p = out_dir / f"{h}.json"
    record = {
        "url": url,
        "source": "loc_chronicling_america",
        "fetched_at": datetime.now().isoformat(timespec="seconds") + "Z",
        **parsed,
    }
    p.write_text(json.dumps(record, indent=2))
    return p


def main() -> None:
    args = parse_args()
    if args.slug not in SCHOOL_OCR:
        print(f"WARN: no LoC mapping for slug '{args.slug}'; skipping loc_newspapers", file=sys.stderr)
        sys.exit(0)
    school = SCHOOL_OCR[args.slug]
    http = HttpCache(rate_limit_seconds=1.0, respect_robots=False)

    written = 0
    queries = build_queries(school)
    print(f"[loc] {args.slug}: queries={len(queries)}, state={school['state']}, years={args.from_year}-{args.to_year}")
    for query in queries:
        for page in range(1, args.max_pages + 1):
            data = search_loc(http, query, school["state"], args.from_year, args.to_year, page)
            if not data:
                break
            items = data.get("items", []) or []
            if not items:
                break
            for item in items:
                page_id = item.get("id") or ""
                if not page_id:
                    continue
                ocr = fetch_ocr_text(http, page_id)
                if not ocr or len(ocr) < 200:
                    continue
                # Verify school name actually appears (LoC search is fuzzy).
                if school["name"].lower() not in ocr.lower() and not any(
                    a.lower() in ocr.lower() for a in school.get("alt", [])
                ):
                    continue
                page_url = f"https://chroniclingamerica.loc.gov{page_id}"
                parsed = {
                    "title": item.get("title") or "",
                    "published_at": item.get("date"),
                    "raw_text": ocr,
                    "headings": [],
                    "links_extracted": [],
                    "loc_meta": {
                        "lccn": item.get("lccn"),
                        "city": item.get("city"),
                        "state": item.get("state"),
                        "publisher": item.get("publisher"),
                    },
                }
                write_evidence(args.slug, page_url, parsed)
                written += 1
            if len(items) < 25:
                break  # last page
    print(f"\n[loc] done — {written} evidence files written")


if __name__ == "__main__":
    main()
