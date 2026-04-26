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
from lib.claude_cli import ClaudeCLI  # noqa: E402

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
    # Go as far back as the live site + Wayback can support. ~1990 is a
    # reasonable floor for athletics-site schedule data; pre-1990 era is
    # better covered by school PDFs + LoC newspapers.
    ap.add_argument("--from-season", type=int, default=1990)
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


def llm_extract_schedule(cli: ClaudeCLI, html: str, year: int, source_url: str) -> list[dict]:
    """Fallback: hand schedule HTML to Claude. The model is good at pulling
    structured event lists from arbitrary site frameworks (Sidearm Vue.js,
    custom React, etc.) where regex per-school work is fragile.

    Modern Sidearm schedule pages are 400-700 KB but the actual schedule
    payload is buried in a `window.__NUXT__=...` JSON blob, OR in late-page
    `s-game-card` cards. Naive head-of-document truncation misses both.
    Strategy: hunt for the highest-signal slice and send up to 80 KB of it.
    """
    snippet = ""
    # 1. Try the Nuxt hydration blob first.
    nuxt_m = re.search(r"window\.__NUXT__\s*=\s*\(?function[\s\S]+?</script>", html)
    if nuxt_m:
        snippet = nuxt_m.group(0)[:120000]
    # 2. Fall back to a window around the first s-game-card occurrence.
    if not snippet or len(snippet) < 5000:
        card_m = re.search(r"s-game-card s-game-card--standard", html)
        if card_m:
            start = max(0, card_m.start() - 5000)
            snippet = html[start : start + 120000]
    # 3. Last resort: head + tail concatenation.
    if not snippet or len(snippet) < 5000:
        snippet = html[:40000] + "\n\n[...truncated middle...]\n\n" + html[-80000:]
    prompt = f"""You are extracting a college golf team's schedule for the {year}-{str(year+1)[-2:]} academic year from this raw HTML.

Return ONLY a JSON array. Each entry is one tournament the team played (or has scheduled) that season:
  {{
    "tournament_name": "...",            # e.g. "Carmel Cup", "Big 12 Championship"
    "date_text": "Aug 29-31" or null,
    "location": "Pebble Beach, CA" or null,
    "course": "Pebble Beach Golf Links" or null,
    "host_school": "Stanford" or null,
    "finish_text": "1st" / "T5" / "MC" / null
  }}

Rules:
  - Extract **EVERY single event** the team has on the page — do NOT cap at 10. Top programs play 11-15 events per year including postseason. Specifically include:
    * Regular-season tournaments (typically 8-11)
    * **Conference Championship** (e.g. Big 12 Championship, SEC Championship, ACC Championship)
    * **NCAA Regional** (e.g. NCAA Stillwater Regional, NCAA Bremerton Regional)
    * **NCAA Championship** — both Stroke Play AND Match Play if both are on the page
    * **East Lake Cup** if invited
    * Match Play events when listed
  - Skip nav links, recap teasers, future-season previews, ranking widgets, individual-tournament Pro-Am events the team did not play in.
  - Include events with no posted finish (future-scheduled or in-progress).
  - If a season has 11-13 events you should output 11-13 — not 10.
  - Strict JSON. No markdown. No prose.
  - If you can't find a single real event, return [].

HTML follows.
=== HTML ({len(snippet):,} chars) ===
{snippet}
=== END HTML ===

Return the JSON array now."""
    try:
        out = cli.extract_json(prompt)
    except Exception as e:
        print(f"[schedule]   llm extract failed: {e}", file=sys.stderr)
        return []
    if not isinstance(out, list):
        return []
    events = []
    for ev in out:
        if not isinstance(ev, dict) or not ev.get("tournament_name"):
            continue
        events.append({
            "academic_year": year,
            "tournament_name": ev.get("tournament_name"),
            "date_text": ev.get("date_text"),
            "location": ev.get("location") or ev.get("course"),
            "course": ev.get("course"),
            "host_school": ev.get("host_school"),
            "finish_text": ev.get("finish_text"),
            "recap_url": None,
            "raw_card_text": "",
            "source_url": source_url,
            "extraction_method": "llm",
        })
    return events


def page_matches_year(html: str, year: int) -> bool:
    """Verify the schedule page actually serves data for the requested
    academic year. Sidearm sites silently fall back to the current schedule
    when an unrecognized `?season=` param is passed.

    Heuristics, any of which is sufficient:
      1. <title> contains "<year>-<yy>" or "<year>" pattern.
      2. The first ~5KB of body mentions the year string.
      3. A canonical Sidearm season-picker dropdown contains the year as
         the SELECTED option.
    """
    seasons_y2 = str(year + 1)[-2:]
    target_yy = f"{year}-{seasons_y2}"
    target_year_str = str(year)
    title_m = re.search(r"<title[^>]*>(.+?)</title>", html, re.S | re.I)
    title = title_m.group(1) if title_m else ""
    if target_yy in title or target_year_str in title:
        return True
    # Selected option in the season-picker.
    sel_m = re.search(
        r'<option[^>]*selected[^>]*>\s*(\d{4}[-–]\d{2,4})\s*</option>',
        html,
    )
    if sel_m and (target_yy in sel_m.group(1) or target_year_str in sel_m.group(1)):
        return True
    # Body mention is weak signal but better than nothing for legacy pages.
    head_blob = html[:8000]
    if target_yy in head_blob:
        return True
    return False


def wayback_fallback(
    http: HttpCache, cli: ClaudeCLI, domain: str, year: int, slug: str
) -> list[dict]:
    """For years when the live athletics site has no schedule (pre-Sidearm
    era or removed pages), walk Wayback CDX snapshots of every candidate URL
    and try the largest snapshot. Pre-2014 athletics sites used different
    domains entirely (cstv.com, collegesports.com); we'll need richer
    discovery later but Wayback often has the modern domain back to ~2010.
    """
    cdx_base = "http://web.archive.org/cdx/search/cdx"
    seasons_y2 = str(year + 1)[-2:]
    candidate_archived = [
        f"https://{domain}/sports/mens-golf/schedule?season={year}-{seasons_y2}",
        f"https://{domain}/sports/mens-golf/schedule",
        f"https://{domain}/sport/m-golf/",
        # Pre-2014 patterns that historic athletics URLs sometimes used.
        f"http://www.{domain}/sports/m-golf/auto_pdf/",
        f"http://{domain}/sports/m-golf/",
    ]
    for archived in candidate_archived:
        cdx_url = (
            f"{cdx_base}?url={archived}&output=json"
            f"&from={year}0101&to={year+1}0731"
            f"&filter=statuscode:200&filter=mimetype:text/html"
            f"&collapse=timestamp:6"
        )
        status, text, _ = http.get(cdx_url)
        if status != 200 or not text.strip():
            continue
        try:
            rows = json.loads(text)
        except json.JSONDecodeError:
            continue
        if len(rows) < 2:
            continue
        # Pick the LATEST snapshot in the year — most likely to have full season.
        rows = rows[1:]  # skip header
        rows.sort(key=lambda r: r[1], reverse=True)  # by timestamp desc
        for row in rows[:3]:  # try up to 3 snapshots per URL
            ts, original = row[1], row[2]
            snap_url = f"https://web.archive.org/web/{ts}/{original}"
            status, html, _ = http.get(snap_url)
            if status != 200 or not html or len(html) < 1500:
                continue
            if not page_matches_year(html, year):
                continue
            events = parse_schedule_html(html, year, snap_url)
            if len(events) < 5:
                events = llm_extract_schedule(cli, html, year, snap_url)
            if events:
                # Tag as wayback for provenance.
                for e in events:
                    e["extraction_method"] = (e.get("extraction_method") or "regex") + ":wayback"
                    e["wayback_timestamp"] = ts
                print(f"[schedule] {slug} {year}: {len(events)} events from Wayback {ts[:8]} ({original})")
                return events
    return []


def main() -> None:
    args = parse_args()
    if args.slug not in SCHOOL_SITES:
        print(f"WARN: no athletics-site mapping for {args.slug}", file=sys.stderr)
        sys.exit(1)
    domain = SCHOOL_SITES[args.slug]["domain"]
    http = HttpCache(rate_limit_seconds=2.5)
    cli = ClaudeCLI(timeout_seconds=300)
    all_events: list[dict] = []
    seasons_with_data: list[int] = []
    for year in range(args.from_season, args.to_season + 1):
        seasoned = False
        for url in candidate_urls(domain, year):
            status, html, _ = http.get(url)
            if status != 200 or not html or len(html) < 1000:
                continue
            # Sanity check: does this page actually correspond to the
            # requested academic year? Sidearm sites silently serve the
            # CURRENT schedule when an old `?season=` param is passed,
            # which would produce hallucinated event lists if we let the
            # LLM extract from it. The page <title> typically says
            # "<YEAR>-<YY> <Mascot> Golf Schedule" — verify the year is
            # in there.
            if not page_matches_year(html, year):
                continue
            events = parse_schedule_html(html, year, url)
            if len(events) < 5:
                # Regex didn't find enough — fall back to LLM extraction.
                llm_events = llm_extract_schedule(cli, html, year, url)
                if len(llm_events) >= len(events):
                    events = llm_events
                    print(f"[schedule] {args.slug} {year}-{str(year+1)[-2:]}: {len(events)} events from LLM fallback ({url})")
                else:
                    print(f"[schedule] {args.slug} {year}-{str(year+1)[-2:]}: {len(events)} events from regex ({url})")
            else:
                print(f"[schedule] {args.slug} {year}-{str(year+1)[-2:]}: {len(events)} events from regex ({url})")
            if events:
                all_events.extend(events)
                seasons_with_data.append(year)
                seasoned = True
                break  # don't try more URL patterns for this season

        # Wayback Machine fallback: if no events from the live site, walk
        # CDX snapshots of every candidate URL and try the most-substantial
        # snapshot. Captures pre-Sidearm-era schedules + recently-removed
        # archive pages.
        if not seasoned:
            wb_events = wayback_fallback(http, cli, domain, year, args.slug)
            if wb_events:
                all_events.extend(wb_events)
                seasons_with_data.append(year)
                seasoned = True

        if not seasoned:
            print(f"[schedule] {args.slug} {year}: no schedule page found (live + wayback)")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"expected-schedule-{args.slug}.json"
    out_path.write_text(json.dumps(all_events, indent=2))
    print(f"\n[schedule] done — {len(all_events)} events across {len(seasons_with_data)} seasons → {out_path}")


if __name__ == "__main__":
    main()
