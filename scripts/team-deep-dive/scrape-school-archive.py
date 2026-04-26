#!/usr/bin/env python
"""scrape-school-archive.py — university library digital collections + student
newspaper archives.

Each school has a different archive system. Mappings:
  - Texas Tech → Southwest Collection (swco.library.ttu.edu) + The University
    Daily / Daily Toreador (texashistory.unt.edu hosts the digital archive)
  - Oklahoma State → OSU Library Digital Archive (digital.library.okstate.edu)
    + Daily O'Collegian
  - Stanford → Stanford Daily archive (archives.stanforddaily.com)
  - Vanderbilt → Hustler archive (vanderbilthustler.com/archive)
  - Auburn → Plainsman archive (theplainsman.com)
  - others → fallback to a generic "site:<library_domain> golf" Google search
    via Searx (later phase)

Strategy:
  - Per slug: target the school's known archive search URL
  - Walk results pages with golf keyword
  - Pull article text (HTML or PDF) — for PDFs, use pdftotext
  - Emit evidence files

Usage:
    ~/venv/bin/python scripts/team-deep-dive/scrape-school-archive.py texas-tech men
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import quote, urlencode

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.http_cache import HttpCache  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
EVIDENCE_ROOT = REPO_ROOT / "data" / "team-deep-dive" / "evidence"

# Slug → list of search-URL-builder configs.
# Each config has type ("html_search" | "ttu_unt_paper") + url/params.
ARCHIVE_CONFIGS: dict[str, list[dict]] = {
    "texas-tech": [
        # University Daily (TTU's student paper, hosted at UNT's Portal to Texas History)
        {
            "type": "ttu_unt_paper",
            "label": "the_university_daily",
            "search_url": "https://texashistory.unt.edu/search/?q=%22Texas+Tech%22+golf&t=fulltext&fq=str_collection_code%3ATDNP",
        },
        {
            "type": "html_search",
            "label": "ttu_swco",
            "url": "https://swco.library.ttu.edu/find?lookfor=men%27s+golf&type=AllFields",
        },
    ],
    "oklahoma-state": [
        {
            "type": "html_search",
            "label": "osu_digital_library",
            "url": "https://digital.library.okstate.edu/searchresults.aspx?searchtext=men%27s+golf",
        },
    ],
    "stanford": [
        {
            "type": "html_search",
            "label": "stanford_daily",
            "url": "https://archives.stanforddaily.com/?p=&action=newssearch&searchterm=men%27s+golf",
        },
    ],
    "vanderbilt": [
        {
            "type": "html_search",
            "label": "vanderbilt_hustler",
            "url": "https://vanderbilthustler.com/?s=men%27s+golf",
        },
    ],
    "auburn": [
        {
            "type": "html_search",
            "label": "the_plainsman",
            "url": "https://theplainsman.com/search?q=men%27s+golf",
        },
    ],
    "alabama": [
        {
            "type": "html_search",
            "label": "the_crimson_white",
            "url": "https://thecrimsonwhite.com/?s=men%27s+golf",
        },
    ],
    "lsu": [
        {
            "type": "html_search",
            "label": "the_reveille",
            "url": "https://www.lsureveille.com/search/?q=men%27s+golf",
        },
    ],
    "georgia": [
        {
            "type": "html_search",
            "label": "the_red_and_black",
            "url": "https://www.redandblack.com/search/?q=men%27s+golf",
        },
    ],
    "florida": [
        {
            "type": "html_search",
            "label": "the_alligator",
            "url": "https://www.alligator.org/search/?q=men%27s+golf",
        },
    ],
    "tennessee": [
        {
            "type": "html_search",
            "label": "the_daily_beacon",
            "url": "https://www.utdailybeacon.com/search/?q=men%27s+golf",
        },
    ],
    "north-carolina": [
        {
            "type": "html_search",
            "label": "daily_tar_heel",
            "url": "https://www.dailytarheel.com/search?q=men%27s+golf",
        },
    ],
    "duke": [
        {
            "type": "html_search",
            "label": "the_chronicle",
            "url": "https://www.dukechronicle.com/search?q=men%27s+golf",
        },
    ],
}


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("gender", choices=["men", "women", "m", "w"])
    ap.add_argument("--max-results-per-config", type=int, default=200)
    return ap.parse_args()


def extract_links(html: str, base_url: str) -> list[str]:
    """Pull article-looking outbound links from a search results HTML page."""
    out: set[str] = set()
    for m in re.finditer(r'href="([^"]+)"', html):
        link = m.group(1)
        if link.startswith("/"):
            from urllib.parse import urljoin

            link = urljoin(base_url, link)
        if not link.startswith("http"):
            continue
        # Heuristic: prefer URLs with a date or article-style slug.
        if (
            re.search(r"/(20\d{2}|19\d{2})/\d{2}/", link)
            or re.search(r"/(article|news|story|sports)/", link, re.I)
            or link.endswith(".pdf")
        ):
            out.add(link)
    return sorted(out)


def fetch_text(http: HttpCache, url: str) -> str | None:
    """Fetch HTML or PDF and return text. Light-strip HTML; use pdftotext for PDFs."""
    if url.endswith(".pdf"):
        # Download to /tmp, run pdftotext, return string.
        import tempfile

        status, blob, _ = http.get(url)
        if status != 200 or not blob:
            return None
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(blob.encode("utf-8", errors="ignore"))
            tmp = f.name
        try:
            proc = subprocess.run(
                ["pdftotext", tmp, "-"], capture_output=True, text=True, timeout=60
            )
            return proc.stdout[:8000] if proc.returncode == 0 else None
        finally:
            Path(tmp).unlink(missing_ok=True)
    status, html, _ = http.get(url)
    if status != 200 or not html:
        return None
    body = re.sub(r"<script[\s\S]*?</script>", " ", html)
    body = re.sub(r"<style[\s\S]*?</style>", " ", body)
    text = re.sub(r"<[^>]+>", " ", body)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:8000]


def write_evidence(slug: str, url: str, source: str, parsed: dict) -> Path:
    out_dir = EVIDENCE_ROOT / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    h = hashlib.sha1(url.encode()).hexdigest()
    p = out_dir / f"{h}.json"
    record = {
        "url": url,
        "source": source,
        "fetched_at": datetime.now().isoformat(timespec="seconds") + "Z",
        **parsed,
    }
    p.write_text(json.dumps(record, indent=2))
    return p


def main() -> None:
    args = parse_args()
    if args.slug not in ARCHIVE_CONFIGS:
        print(f"[archive] no archive mapping for {args.slug}; skipping (Searx will cover via search-aggregator)", file=sys.stderr)
        return
    http = HttpCache(rate_limit_seconds=2.5, respect_robots=False)
    written = 0
    for cfg in ARCHIVE_CONFIGS[args.slug]:
        url = cfg["url"] if cfg["type"] == "html_search" else cfg["search_url"]
        print(f"[archive] {args.slug}/{cfg['label']}: search at {url}")
        status, html, _ = http.get(url)
        if status != 200 or not html:
            print(f"[archive]   search page returned {status}")
            continue
        article_urls = extract_links(html, url)[: args.max_results_per_config]
        print(f"[archive]   {len(article_urls)} candidate articles")
        for art_url in article_urls:
            text = fetch_text(http, art_url)
            if not text or len(text) < 200:
                continue
            parsed = {
                "title": "",
                "published_at": None,
                "raw_text": text,
                "headings": [],
                "links_extracted": [],
                "archive_label": cfg["label"],
            }
            write_evidence(args.slug, art_url, f"school_archive/{cfg['label']}", parsed)
            written += 1
    print(f"\n[archive] done — {written} evidence files")


if __name__ == "__main__":
    main()
