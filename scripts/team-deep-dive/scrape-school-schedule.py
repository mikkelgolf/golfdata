#!/usr/bin/env python
"""scrape-school-schedule.py — pull each year's complete men's-golf schedule
from the school athletics site.

Sidearm-built sites (Texas Tech, OK State, most P5) expose a season-pickable
schedule URL like:
    https://texastech.com/sports/mens-golf/schedule?season=YYYY-YY

Returns event name, dates, location, course, team finish (when posted), and
linked recap URL. This becomes the ground-truth schedule we diff against
granular_master.

Output: data/team-deep-dive/expected-schedule-<slug>.json — flat array of
events per academic year going back as far as the site serves.

Usage:
    ~/venv/bin/python scripts/team-deep-dive/scrape-school-schedule.py texas-tech men
    ~/venv/bin/python scripts/team-deep-dive/scrape-school-schedule.py oklahoma-state men --from-season 2010
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
OUT_DIR = REPO_ROOT / "data" / "team-deep-dive"

# Reuse SCHOOL_SITES from scrape-school-news.py
import importlib.util

_news_spec = importlib.util.spec_from_file_location(
    "school_news", Path(__file__).resolve().parent / "scrape-school-news.py"
)
_news_mod = importlib.util.module_from_spec(_news_spec)
_news_spec.loader.exec_module(_news_mod)  # type: ignore
SCHOOL_SITES = _news_mod.SCHOOL_SITES


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("gender", choices=["men", "women", "m", "w"])
    ap.add_argument("--from-season", type=int, default=2010)
    ap.add_argument("--to-season", type=int, default=datetime.now().year)
    return ap.parse_args()


def candidate_urls(domain: str, year: int) -> list[str]:
    """Most Sidearm sites serve schedules at predictable patterns."""
    next_year_2 = str(year + 1)[-2:]
    return [
        f"https://{domain}/sports/mens-golf/schedule?season={year}-{next_year_2}",
        f"https://{domain}/sports/mens-golf/schedule/season/{year}-{next_year_2}",
        f"https://{domain}/sports/mens-golf/schedule?year={year}",
        f"https://{domain}/sport/m-golf/schedule/{year}-{next_year_2}",  # Arkansas pattern
    ]


def parse_schedule_html(html: str, year: int, source_url: str) -> list[dict]:
    """Extract events. Sidearm pattern: each event is in a table row or card
    with class containing 'event' or 'sidearm-schedule-game'. Heuristic since
    every school customizes."""
    out: list[dict] = []
    # Try common card patterns.
    # Strategy 1: <li class="sidearm-schedule-game"...> ... </li>
    cards = re.findall(
        r'<li[^>]*class="[^"]*\b(?:sidearm-schedule-game|s-game-card|schedule-event)\b[^"]*"[^>]*>([\s\S]+?)</li>',
        html,
    )
    if not cards:
        # Strategy 2: <article class="schedule-event">
        cards = re.findall(
            r'<article[^>]*class="[^"]*\bschedule-event\b[^"]*"[^>]*>([\s\S]+?)</article>',
            html,
        )
    if not cards:
        # Strategy 3: <tr class="..."> rows in a schedule table
        cards = re.findall(r'<tr[^>]*class="[^"]*\b(?:event|game)\b[^"]*"[^>]*>([\s\S]+?)</tr>', html)
    for card in cards:
        text = re.sub(r"<[^>]+>", " | ", card)
        text = re.sub(r"\s*\|\s*\|\s*", " | ", text)
        text = re.sub(r"\s+", " ", text).strip(" |")
        # Tournament name: first capitalized phrase, often inside the title link.
        link_m = re.search(
            r'<a[^>]*class="[^"]*\b(?:event-title|game-title|s-game-card__title|tournament-link)\b[^"]*"[^>]*>([\s\S]+?)</a>',
            card,
        )
        title = re.sub(r"<[^>]+>", " ", link_m.group(1)).strip() if link_m else None
        if not title:
            # Fallback: first <a> with substantial text.
            for am in re.finditer(r"<a[^>]*>([\s\S]+?)</a>", card):
                t = re.sub(r"<[^>]+>", "", am.group(1)).strip()
                if t and len(t) > 5 and not t.lower().startswith(("box score", "recap", "results")):
                    title = t
                    break
        if not title:
            continue
        # Recap link, if any.
        recap_m = re.search(r'href="([^"]+/news/[^"]+)"', card)
        recap = recap_m.group(1) if recap_m else None
        # Finish
        finish_m = re.search(
            r"\b(1st|2nd|3rd|\d+(?:st|nd|rd|th)|T\d+)\s*(?:place|finish)?\b", text, re.I
        )
        finish = finish_m.group(0) if finish_m else None
        # Course / location
        loc_m = re.search(r"\b(?:at|hosted by|in)\s+([A-Z][A-Za-z .,'\-]{4,80})", text)
        location = loc_m.group(1).strip() if loc_m else None
        # Date
        date_m = re.search(
            r"(?:Aug|Sep|Sept|Oct|Nov|Dec|Jan|Feb|Mar|Apr|May|Jun|Jul)[a-z]*\.?\s+\d{1,2}(?:[–-]\d{1,2})?,?\s*\d{0,4}",
            text,
        )
        date_str = date_m.group(0) if date_m else None
        out.append(
            {
                "academic_year": year,
                "tournament_name": title,
                "date_text": date_str,
                "location": location,
                "finish_text": finish,
                "recap_url": recap,
                "raw_card_text": text[:300],
                "source_url": source_url,
            }
        )
    return out


def main() -> None:
    args = parse_args()
    if args.slug not in SCHOOL_SITES:
        print(f"WARN: no athletics-site mapping for {args.slug}", file=sys.stderr)
        sys.exit(1)
    domain = SCHOOL_SITES[args.slug]["domain"]
    http = HttpCache(rate_limit_seconds=2.5)
    all_events: list[dict] = []
    seasons_with_data: list[int] = []
    for year in range(args.from_season, args.to_season + 1):
        for url in candidate_urls(domain, year):
            status, html, _ = http.get(url)
            if status != 200 or not html or len(html) < 1000:
                continue
            events = parse_schedule_html(html, year, url)
            if events:
                all_events.extend(events)
                seasons_with_data.append(year)
                print(f"[schedule] {args.slug} {year}-{str(year+1)[-2:]}: {len(events)} events from {url}")
                break  # don't try more URL patterns for this season
        else:
            print(f"[schedule] {args.slug} {year}: no schedule page found")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"expected-schedule-{args.slug}.json"
    out_path.write_text(json.dumps(all_events, indent=2))
    print(f"\n[schedule] done — {len(all_events)} events across {len(seasons_with_data)} seasons → {out_path}")


if __name__ == "__main__":
    main()
