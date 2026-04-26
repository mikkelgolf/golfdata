#!/usr/bin/env python
"""scrape-school-news.py — crawl a school athletics site's men's-golf news
archive going back as far as the site serves.

Strategy:
  1. Try sitemap.xml first (most schools have it: domain/sitemap.xml or
     sitemap_index.xml). Filter for /news/ paths under the men's-golf section.
  2. Fall back to /sports/mens-golf/news?page=N pagination (Sidearm sites)
     or other discovered patterns.
  3. For each article URL, fetch + cache + extract structured evidence.
  4. Emit one evidence file per article under
     data/team-deep-dive/evidence/<slug>/<sha1(url)>.json with shape:
     {url, fetched_at, source, title, published_at, raw_text, headings,
      links_extracted}

Rate limit: 1 req/3s per host. Robots.txt respected. All caching gzip on disk.

Usage:
    ~/venv/bin/python scripts/team-deep-dive/scrape-school-news.py texas-tech men
    ~/venv/bin/python scripts/team-deep-dive/scrape-school-news.py oklahoma-state men --max-articles 200
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.http_cache import HttpCache  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
EVIDENCE_ROOT = REPO_ROOT / "data" / "team-deep-dive" / "evidence"

# Map school slug → (athletics_domain, sitemap_url, news_index_path)
# Most Sidearm-built sites follow consistent patterns. Defaults work; per-slug
# overrides handle exceptions.
SCHOOL_SITES: dict[str, dict] = {
    "texas-tech": {"domain": "texastech.com", "news_path": "/sports/mens-golf/news"},
    "oklahoma-state": {"domain": "okstate.com", "news_path": "/sports/mens-golf/news"},
    "stanford": {"domain": "gostanford.com", "news_path": "/sports/mens-golf/news"},
    "vanderbilt": {"domain": "vucommodores.com", "news_path": "/sports/mgolf/news"},
    "auburn": {"domain": "auburntigers.com", "news_path": "/sports/mens-golf/news"},
    "alabama": {"domain": "rolltide.com", "news_path": "/sports/mens-golf/news"},
    "arkansas": {"domain": "arkansasrazorbacks.com", "news_path": "/sport/m-golf/"},
    "georgia": {"domain": "georgiadogs.com", "news_path": "/sports/m-golf/news"},
    "lsu": {"domain": "lsusports.net", "news_path": "/sports/mg/news"},
    "florida": {"domain": "floridagators.com", "news_path": "/sports/mens-golf/news"},
    "tennessee": {"domain": "utsports.com", "news_path": "/sports/mens-golf/news"},
    "arizona-state": {"domain": "thesundevils.com", "news_path": "/sports/mens-golf/news"},
    "north-carolina": {"domain": "goheels.com", "news_path": "/sports/mens-golf/news"},
    "nc-state": {"domain": "gopack.com", "news_path": "/sports/mens-golf/news"},
    "duke": {"domain": "goduke.com", "news_path": "/sports/mens-golf/news"},
    "wake-forest": {"domain": "godeacs.com", "news_path": "/sports/mens-golf/news"},
    "virginia": {"domain": "virginiasports.com", "news_path": "/sports/mens-golf/news"},
    "clemson": {"domain": "clemsontigers.com", "news_path": "/sports/mens-golf/news"},
    "florida-state": {"domain": "seminoles.com", "news_path": "/sports/mens-golf/news"},
    "ohio-state": {"domain": "ohiostatebuckeyes.com", "news_path": "/sports/mens-golf/news"},
    "michigan": {"domain": "mgoblue.com", "news_path": "/sports/mens-golf/news"},
    "purdue": {"domain": "purduesports.com", "news_path": "/sports/mens-golf/news"},
    "illinois": {"domain": "fightingillini.com", "news_path": "/sports/mens-golf/news"},
    "northwestern": {"domain": "nusports.com", "news_path": "/sports/mens-golf/news"},
    "oklahoma": {"domain": "soonersports.com", "news_path": "/sports/mens-golf/news"},
    "tcu": {"domain": "gofrogs.com", "news_path": "/sports/mens-golf/news"},
    "smu": {"domain": "smumustangs.com", "news_path": "/sports/mens-golf/news"},
    "houston": {"domain": "uhcougars.com", "news_path": "/sports/mens-golf/news"},
    "baylor": {"domain": "baylorbears.com", "news_path": "/sports/mens-golf/news"},
    "texas": {"domain": "texaslonghorns.com", "news_path": "/sports/mens-golf/news"},
    "brigham-young": {"domain": "byucougars.com", "news_path": "/sports/mens-golf/news"},
    "california": {"domain": "calbears.com", "news_path": "/sports/mens-golf/news"},
    "washington": {"domain": "gohuskies.com", "news_path": "/sports/mens-golf/news"},
    "oregon": {"domain": "goducks.com", "news_path": "/sports/mens-golf/news"},
    "utah": {"domain": "utahutes.com", "news_path": "/sports/mens-golf/news"},
    "pepperdine": {"domain": "pepperdinewaves.com", "news_path": "/sports/mens-golf/news"},
}


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("gender", choices=["men", "women", "m", "w"])
    ap.add_argument("--max-articles", type=int, default=None)
    ap.add_argument("--max-pages", type=int, default=200, help="Pagination cap")
    return ap.parse_args()


def discover_sitemap_news_urls(http: HttpCache, domain: str, news_path: str, slug: str) -> list[str]:
    """Walk sitemap.xml + sitemap_index.xml. Filter to URLs under the news_path."""
    out: set[str] = set()
    candidates = [f"https://{domain}/sitemap.xml", f"https://{domain}/sitemap_index.xml"]
    for sm_url in candidates:
        status, text, _ = http.get(sm_url)
        if status != 200 or not text.strip():
            continue
        try:
            root = ET.fromstring(text)
        except ET.ParseError:
            continue
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        # If it's a sitemap-index, recurse one level.
        sub_sitemaps = [el.text for el in root.findall(".//sm:sitemap/sm:loc", ns) if el.text]
        if sub_sitemaps:
            for sub in sub_sitemaps[:30]:  # bound the fan-out
                sub_status, sub_text, _ = http.get(sub)
                if sub_status != 200 or not sub_text:
                    continue
                try:
                    sub_root = ET.fromstring(sub_text)
                except ET.ParseError:
                    continue
                for loc in sub_root.findall(".//sm:url/sm:loc", ns):
                    if loc.text and "news" in loc.text.lower() and (
                        "golf" in loc.text.lower() or news_path.replace("news", "").strip("/") in loc.text
                    ):
                        out.add(loc.text)
        else:
            for loc in root.findall(".//sm:url/sm:loc", ns):
                if loc.text and "news" in loc.text.lower() and "golf" in loc.text.lower():
                    out.add(loc.text)
    return sorted(out)


def discover_paginated_news_urls(
    http: HttpCache,
    domain: str,
    news_path: str,
    max_pages: int,
) -> list[str]:
    """Walk paginated /sports/mens-golf/news?page=N until empty / 404."""
    out: set[str] = set()
    base = f"https://{domain}{news_path}"
    last_seen_count = -1
    for page in range(1, max_pages + 1):
        url = f"{base}?page={page}" if page > 1 else base
        status, text, _ = http.get(url)
        if status != 200 or not text:
            break
        # Extract any links that look like news article pages.
        article_urls = set(re.findall(r'href="(https?://[^"]*?/news/[^"]+?)"', text))
        if not article_urls:
            article_urls = set(re.findall(r'href="(/news/[^"]+?)"', text))
            article_urls = {f"https://{domain}{u}" for u in article_urls}
        new_count = len(out)
        out.update(article_urls)
        if len(out) == new_count and page > 2:
            break  # no new URLs surfacing — pagination exhausted
        if len(out) == last_seen_count:
            break
        last_seen_count = len(out)
    return sorted(out)


def extract_article_evidence(url: str, html: str) -> dict:
    """Strip HTML to extract title, published_at, raw_text, headings."""
    # Title
    title_m = re.search(r"<title[^>]*>(.*?)</title>", html, re.S | re.I)
    title = re.sub(r"\s+", " ", title_m.group(1)).strip() if title_m else None

    # Published date heuristics
    published_at = None
    for pat in (
        r'datetime="([^"]+)"',
        r'<meta property="article:published_time" content="([^"]+)"',
        r'class="[^"]*\bdate\b[^"]*"[^>]*>(.*?)</',
    ):
        m = re.search(pat, html, re.I | re.S)
        if m:
            published_at = re.sub(r"<[^>]+>", "", m.group(1)).strip()[:60]
            break

    # Headings
    headings = re.findall(r"<h[1-3][^>]*>(.*?)</h[1-3]>", html, re.S | re.I)
    headings = [re.sub(r"<[^>]+>", "", h).strip() for h in headings if h.strip()][:30]

    # Article body — try common containers, fallback to all <p> tags.
    body = ""
    for pat in (
        r'<article[^>]*>([\s\S]+?)</article>',
        r'<div[^>]*class="[^"]*\b(?:article-body|entry-content|news-detail|body)\b[^"]*"[^>]*>([\s\S]+?)</div>\s*</div>',
        r'<main[^>]*>([\s\S]+?)</main>',
    ):
        m = re.search(pat, html, re.I)
        if m:
            body = m.group(1)
            break
    if not body:
        body = " ".join(re.findall(r"<p[^>]*>([\s\S]+?)</p>", html, re.I)[:50])
    raw_text = re.sub(r"<[^>]+>", " ", body)
    raw_text = re.sub(r"\s+", " ", raw_text).strip()
    raw_text = raw_text[:8000]  # cap so evidence files don't bloat

    # Outbound links (tournament pages, player profiles, etc.)
    links = re.findall(r'href="(https?://[^"]+)"', html)
    links_extracted = sorted(set(links))[:80]

    return {
        "title": title,
        "published_at": published_at,
        "raw_text": raw_text,
        "headings": headings,
        "links_extracted": links_extracted,
    }


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
    if args.slug not in SCHOOL_SITES:
        print(f"WARN: no site mapping for slug '{args.slug}'. Add to SCHOOL_SITES.", file=sys.stderr)
        sys.exit(1)
    site = SCHOOL_SITES[args.slug]
    domain = site["domain"]
    news_path = site["news_path"]

    http = HttpCache(rate_limit_seconds=3.0)

    print(f"[news] discovering article URLs for {args.slug} ({domain})")
    sm_urls = discover_sitemap_news_urls(http, domain, news_path, args.slug)
    print(f"[news] sitemap yielded {len(sm_urls)} URLs")
    pg_urls = discover_paginated_news_urls(http, domain, news_path, args.max_pages)
    print(f"[news] pagination yielded {len(pg_urls)} URLs")

    all_urls = sorted(set(sm_urls) | set(pg_urls))
    if args.max_articles:
        all_urls = all_urls[: args.max_articles]
    print(f"[news] total unique URLs: {len(all_urls)}")

    written = 0
    skipped_existing = 0
    slug_evidence_dir = EVIDENCE_ROOT / args.slug
    for i, url in enumerate(all_urls, 1):
        # Skip non-article URLs (index pages, etc.)
        if url.rstrip("/") in (f"https://{domain}{news_path}", f"https://{domain}{news_path.rstrip('/')}"):
            continue
        # Resumability: if evidence already on disk from a prior (perhaps
        # timed-out) run, skip the fetch + parse entirely. The 2h news
        # phase timeout would otherwise cap us at ~2400 articles per run
        # for sites with deep archives.
        h = hashlib.sha1(url.encode()).hexdigest()
        if (slug_evidence_dir / f"{h}.json").exists():
            skipped_existing += 1
            if i % 100 == 0:
                print(f"[news] {i}/{len(all_urls)} processed, {written} written, {skipped_existing} resume-skipped")
            continue
        status, html, cached = http.get(url)
        if status != 200:
            continue
        try:
            parsed = extract_article_evidence(url, html)
        except Exception as e:
            print(f"[news] extraction failed on {url}: {e}", file=sys.stderr)
            continue
        if not parsed.get("raw_text") or len(parsed["raw_text"]) < 100:
            continue  # likely an index page or 404 with HTML shell
        write_evidence(args.slug, url, "school_news", parsed)
        written += 1
        if i % 25 == 0:
            print(f"[news] {i}/{len(all_urls)} processed, {written} evidence files written")

    print(f"\n[news] done — {written} evidence files in {EVIDENCE_ROOT / args.slug}")


if __name__ == "__main__":
    main()
