#!/usr/bin/env python
"""
scrape-wikipedia-program.py — pull structured data from a school's
men's-golf Wikipedia page.

Wikipedia is a high-leverage source: every D1 program with notable
history has a page (or section), and the wikitext is queryable via the
MediaWiki API. The data we extract:
  - NCAA Championships won (year list)
  - Conference titles (year + conference)
  - Notable alumni (name + pro circuit + accomplishments)
  - Head coaches table (name + tenure)
  - All-Americans (year + tier + name) — when listed on the page
  - Individual NCAA medalists from the program

Output: data/team-deep-dive/wikipedia-<slug>.json
Merged into record book by build-record-book.ts (separate task).

Usage:
    ~/venv/bin/python scripts/team-deep-dive/scrape-wikipedia-program.py oklahoma-state men
    ~/venv/bin/python scripts/team-deep-dive/scrape-wikipedia-program.py --all   # iterate src/data/players/index.json schools
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
from urllib.parse import quote

import requests

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = REPO_ROOT / "data" / "team-deep-dive"
CACHE_DIR = REPO_ROOT / "data" / "cache" / "wikipedia"
PLAYERS_INDEX = REPO_ROOT / "src" / "data" / "players" / "index.json"

USER_AGENT = "CollegeGolfData/0.1 (mikkelgolfllc@gmail.com)"
RATE_LIMIT_SECONDS = 1.0  # Wikipedia API allows higher rates with proper UA
API_BASE = "https://en.wikipedia.org/w/api.php"


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug", nargs="?")
    ap.add_argument("gender", nargs="?", choices=["men", "women", "m", "w"])
    ap.add_argument("--all", action="store_true", help="Iterate every school in players index")
    ap.add_argument("--no-cache", action="store_true")
    return ap.parse_args()


def cache_path(key: str) -> Path:
    return CACHE_DIR / f"{hashlib.sha1(key.encode()).hexdigest()}.json.gz"


def query_redirect(title: str, use_cache: bool = True) -> tuple[str, str | None]:
    """Resolve a title via the query API. Returns (target_title, fragment_or_None)."""
    p = cache_path("redirect:" + title)
    if use_cache and p.exists():
        with gzip.open(p, "rt") as f:
            j = json.load(f)
        return j["target"], j.get("fragment")
    r = requests.get(
        API_BASE,
        params={
            "action": "query",
            "titles": title,
            "redirects": 1,
            "format": "json",
        },
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    r.raise_for_status()
    j = r.json()
    target = title
    fragment = None
    redirects = j.get("query", {}).get("redirects", [])
    if redirects:
        target = redirects[-1].get("to") or title
        fragment = redirects[-1].get("tofragment")
    pages = j.get("query", {}).get("pages", {})
    if pages and "-1" in pages:
        # Page does not exist
        target = ""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with gzip.open(p, "wt") as f:
        json.dump({"title": title, "target": target, "fragment": fragment}, f)
    time.sleep(RATE_LIMIT_SECONDS)
    return target, fragment


def fetch_wikitext(title: str, use_cache: bool = True) -> tuple[str, str] | tuple[None, None]:
    """Returns (resolved_title, wikitext) or (None, None)."""
    p = cache_path(title)
    if use_cache and p.exists():
        with gzip.open(p, "rt") as f:
            j = json.load(f)
        return j.get("resolved_title") or j.get("title"), j.get("wikitext")
    print(f"[wiki] fetching: {title}", file=sys.stderr)
    r = requests.get(
        API_BASE,
        params={
            "action": "parse",
            "page": title,
            "prop": "wikitext",
            "format": "json",
            "redirects": 1,
        },
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    r.raise_for_status()
    j = r.json()
    wt = None
    resolved = title
    if "parse" in j and "wikitext" in j["parse"]:
        wt = j["parse"]["wikitext"]["*"]
        resolved = j["parse"].get("title") or title
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with gzip.open(p, "wt") as f:
        json.dump({"title": title, "resolved_title": resolved, "wikitext": wt}, f)
    time.sleep(RATE_LIMIT_SECONDS)
    return resolved, wt


MASCOTS = [
    "Cowboys", "Tigers", "Bulldogs", "Razorbacks", "Crimson Tide", "Longhorns",
    "Red Raiders", "Sun Devils", "Commodores", "Cardinal", "Tar Heels",
    "Wolfpack", "Demon Deacons", "Cougars", "Bruins", "Trojans", "Wildcats",
    "Buckeyes", "Boilermakers", "Cavaliers", "Seminoles", "Wolverines",
    "Hawkeyes", "Blue Devils", "Aggies", "Hokies", "Lady Vols", "Lady Tigers",
    "Lady Bulldogs", "Lady Razorbacks", "Lady Raiders",
]


def candidate_titles(slug: str, school_name: str | None, gender: str) -> list[str]:
    """Try several title variants. Wikipedia program pages are usually
    "<School> <Mascot> <gender>'s golf"; we try a couple."""
    base = school_name or slug.replace("-", " ").title()
    g = "men" if gender in ("m", "men") else "women"
    out = [
        f"{base} {g}'s golf",
        f"{base} {g}'s golf team",
        f"{base} Tigers golf",
    ]
    for mascot in MASCOTS:
        out.append(f"{base} {mascot} {g}'s golf")
    return out


SCHOOL_DISPLAY_NAMES: dict[str, str] = {
    "texas-tech": "Texas Tech Red Raiders",
    "oklahoma-state": "Oklahoma State Cowboys",
    "stanford": "Stanford Cardinal",
    "vanderbilt": "Vanderbilt Commodores",
    "auburn": "Auburn Tigers",
    "alabama": "Alabama Crimson Tide",
    "arkansas": "Arkansas Razorbacks",
    "georgia": "Georgia Bulldogs",
    "lsu": "LSU Tigers",
    "florida": "Florida Gators",
    "tennessee": "Tennessee Volunteers",
    "arizona-state": "Arizona State Sun Devils",
    "ucla": "UCLA Bruins",
    "usc": "USC Trojans",
    "southern-california": "USC Trojans",
    "byu": "BYU Cougars",
    "tcu": "TCU Horned Frogs",
    "smu": "SMU Mustangs",
    "houston": "Houston Cougars",
    "north-carolina": "North Carolina Tar Heels",
    "nc-state": "NC State Wolfpack",
    "duke": "Duke Blue Devils",
    "wake-forest": "Wake Forest Demon Deacons",
    "virginia": "Virginia Cavaliers",
    "clemson": "Clemson Tigers",
    "florida-state": "Florida State Seminoles",
    "ohio-state": "Ohio State Buckeyes",
    "michigan": "Michigan Wolverines",
    "purdue": "Purdue Boilermakers",
    "illinois": "Illinois Fighting Illini",
    "iowa": "Iowa Hawkeyes",
    "northwestern": "Northwestern Wildcats",
    "wisconsin": "Wisconsin Badgers",
    "minnesota": "Minnesota Golden Gophers",
    "indiana": "Indiana Hoosiers",
    "kansas": "Kansas Jayhawks",
    "kansas-state": "Kansas State Wildcats",
    "iowa-state": "Iowa State Cyclones",
    "oklahoma": "Oklahoma Sooners",
    "baylor": "Baylor Bears",
    "texas": "Texas Longhorns",
    "ole-miss": "Ole Miss Rebels",
    "south-carolina": "South Carolina Gamecocks",
    "kentucky": "Kentucky Wildcats",
    "missouri": "Missouri Tigers",
    "mississippi-state": "Mississippi State Bulldogs",
    "pepperdine": "Pepperdine Waves",
    "san-diego-state": "San Diego State Aztecs",
    "fresno-state": "Fresno State Bulldogs",
    "georgia-tech": "Georgia Tech Yellow Jackets",
}


def title_matches_gender(resolved: str, gender: str) -> bool:
    """Reject pages where the redirect landed on the wrong gender's page
    (or a generic athletics page). Wikipedia titles always include
    "men's golf" / "women's golf" for the dedicated program pages."""
    g = "men" if gender in ("m", "men") else "women"
    other = "women" if g == "men" else "men"
    rl = resolved.lower()
    if f"{other}'s golf" in rl and f"{g}'s golf" not in rl:
        return False
    # Also require the gender keyword somewhere in the title — otherwise the
    # page is a generic team/athletics page and the parsed sections will be
    # noise from other sports.
    if f"{g}'s golf" not in rl and "golf" not in rl:
        return False
    return True


def try_resolve(title: str, gender: str) -> tuple[str, str] | None:
    """Resolve a candidate title. Returns (display_title, wikitext) where
    wikitext is either the full page wikitext (if no fragment redirect) or
    just the slice for the relevant section (if redirected to a fragment on
    a broader athletics page)."""
    target, fragment = query_redirect(title)
    if not target:
        return None
    if fragment:
        # Broader athletics page; slice to just our section.
        _, full_wt = fetch_wikitext(target)
        if not full_wt:
            return None
        section_wt = slice_section(full_wt, fragment)
        if not section_wt:
            return None
        # Sanity-check: section header should mention our gender.
        g = "men" if gender in ("m", "men") else "women"
        if g not in fragment.lower():
            return None
        return f"{target}#{fragment}", section_wt
    # No fragment — must be a dedicated program page; verify gender match.
    if not title_matches_gender(target, gender):
        return None
    _, wt = fetch_wikitext(target)
    if not wt:
        return None
    return target, wt


def resolve_title(slug: str, gender: str) -> tuple[str, str] | None:
    display = SCHOOL_DISPLAY_NAMES.get(slug, slug.replace("-", " ").title())
    g = "men" if gender in ("m", "men") else "women"
    primary = f"{display} {g}'s golf"
    res = try_resolve(primary, gender)
    if res:
        return res
    for t in candidate_titles(slug, display, gender):
        if t == primary:
            continue
        res = try_resolve(t, gender)
        if res:
            return res
    return None


# ---------------------------------------------------------------------------
# Section extraction
# ---------------------------------------------------------------------------


def slice_section(wt: str, header: str) -> str:
    """Return wiki text between '== <header> ==' (or sub-level) and the next
    same-level heading. Case-insensitive on header name."""
    pat = re.compile(
        rf"^(==+)\s*{re.escape(header)}\s*\1\s*$([\s\S]+?)(?=^==+\s|\Z)",
        re.M | re.I,
    )
    m = pat.search(wt)
    return m.group(2) if m else ""


def find_year_list(text: str) -> list[int]:
    """Find any 4-digit years in the text and return sorted unique."""
    return sorted({int(y) for y in re.findall(r"\b(1[89]\d{2}|20\d{2})\b", text)})


def get_infobox(wt: str) -> str:
    """Grab the {{Infobox college golf team ...}} block."""
    m = re.search(r"\{\{Infobox[\s\S]+?^\}\}", wt, re.M)
    return m.group(0) if m else ""


def infobox_field(infobox: str, *names: str) -> str | None:
    for n in names:
        m = re.search(rf"\|\s*{re.escape(n)}\s*=\s*([^\n]*?)(?=\n\s*\|\s*\w+\s*=|\n\}}\}})", infobox)
        if m:
            return m.group(1).strip()
    return None


def parse_ncaa_titles(wt: str) -> list[int]:
    ib = get_infobox(wt)
    f = infobox_field(ib, "NCAAchampion", "NCAA champions", "national_titles", "NCAA titles")
    if f:
        return find_year_list(f)
    sec = slice_section(wt, "NCAA Championships") or slice_section(wt, "Championships")
    if sec:
        return find_year_list(sec[:2000])
    return []


def parse_ncaa_runner_up(wt: str) -> list[int]:
    ib = get_infobox(wt)
    f = infobox_field(ib, "NCAArunnerUp", "NCAA runner-up")
    return find_year_list(f) if f else []


def parse_ncaa_matchplay(wt: str) -> list[int]:
    ib = get_infobox(wt)
    f = infobox_field(ib, "NCAAmatchplay", "NCAA match play")
    return find_year_list(f) if f else []


def parse_ncaa_appearances(wt: str) -> list[int]:
    ib = get_infobox(wt)
    f = infobox_field(ib, "NCAAappearance", "NCAA appearances")
    return find_year_list(f) if f else []


def parse_individual_champions(wt: str) -> list[dict]:
    """Field looks like: '[[Earl Moeller]] (1953)<br />[[Grier Jones]] (1968)<br />...'"""
    ib = get_infobox(wt)
    f = infobox_field(ib, "Individualchampion", "Individual champion", "Individual_champion")
    if not f:
        return []
    out = []
    # Each entry is roughly "[[link|Name]] (YEAR)" or "Name (YEAR)" separated
    # by <br /> or <br/>.
    for chunk in re.split(r"<br\s*/?>", f):
        chunk = chunk.strip()
        if not chunk:
            continue
        year_m = re.search(r"\((\d{4})\)", chunk)
        # Player: prefer the [[link]] target; if piped, use the display label.
        link = re.search(r"\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]", chunk)
        if link:
            name = link.group(2) or link.group(1)
        else:
            name = re.sub(r"\(\d{4}\)", "", chunk).strip()
        if year_m and name:
            out.append({"year": int(year_m.group(1)), "player": name.strip()})
    return out


def parse_conference_titles(wt: str) -> list[dict]:
    """Conference titles can be in infobox (multi-line, multiple conferences)
    or in a section. Infobox format on OK State:
        |Conferencechampion  = [[Missouri Valley Conference|Missouri Valley]]<br />1947, 1948, ...
        [[Big Eight Conference|Big Eight]]<br />1962, 1963, ...
        [[Big 12 Conference|Big 12]]<br />1996, 1997, ...
    """
    ib = get_infobox(wt)
    f = infobox_field(ib, "Conferencechampion", "Conference champion", "Conferencechampions")
    out: list[dict] = []
    if f:
        # Walk the field linearly. Each segment alternates between a
        # conference-link block and a year list.
        # Strategy: find every [[Link|Display]] and capture years that
        # follow until the next link.
        parts = re.split(r"(\[\[[^\]]+\]\])", f)
        current_conf: str | None = None
        for p in parts:
            if not p:
                continue
            if p.startswith("[["):
                m = re.match(r"\[\[(?:[^\]\|]+\|)?([^\]]+)\]\]", p)
                if m:
                    current_conf = m.group(1).strip()
            else:
                for y in find_year_list(p):
                    if 1900 <= y <= 2030:
                        out.append({"year": y, "conference": current_conf or ""})
        if out:
            return out

    for label in ["Conference titles", "Conference championships", "Conference Tournament"]:
        sec = slice_section(wt, label)
        if not sec:
            continue
        for ln in sec.splitlines():
            yrs = find_year_list(ln)
            for y in yrs:
                m = re.search(r"([A-Z][A-Za-z &\-]+?)\s*\b" + str(y) + r"\b", ln)
                conf = m.group(1).strip() if m else ""
                out.append({"year": y, "conference": conf})
        if out:
            break
    return out


def parse_notable_alumni(wt: str) -> list[dict]:
    """Try a wide range of section header conventions used across programs."""
    headers_to_try = [
        "Notable players",
        "Notable alumni",
        "Notable golfers",
        "Notable Cowboys",
        "Notable Cowboys in pro golf",
        "PGA Tour professionals",
        "PGA Tour members",
        "Alumni in professional golf",
        "Players in professional golf",
        "Alumni",
        "Professional players",
        "Professional alumni",
        "Notable players in professional golf",
        "Tar Heels in pro golf",
        "Sun Devils in professional golf",
    ]
    sec = ""
    for h in headers_to_try:
        sec = slice_section(wt, h)
        if sec:
            break
    if not sec:
        return []
    out = []
    seen = set()

    bullet_lines = [ln.strip() for ln in sec.splitlines() if ln.strip().startswith("*")]
    if bullet_lines:
        # Bullet-list format (LSU, Illinois, Stanford, etc.).
        for ln in bullet_lines:
            body = ln.lstrip("* ").strip()
            name_match = re.search(r"\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]", body)
            if not name_match:
                plain = re.sub(r"<[^>]+>", "", body).strip()
                first = plain.split(",")[0].strip()
                if not first or len(first) > 60:
                    continue
                if first.lower() in seen:
                    continue
                seen.add(first.lower())
                out.append({"name": first, "raw_line": body[:300]})
                continue
            target = name_match.group(1).strip()
            display = name_match.group(2)
            canonical = re.sub(r"\s*\([^)]*\)\s*$", "", target).strip()
            name = display or canonical
            if not name or name.lower() in seen:
                continue
            seen.add(name.lower())
            out.append({"name": name, "raw_line": body[:300]})
    else:
        # Paragraph-list format (OK State, etc.) — extract every linked name
        # and the parenthetical that follows.
        # Cleave the section into "name + parenthetical" chunks by walking
        # the text and emitting one entry per [[link]] occurrence.
        link_re = re.compile(r"\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]")
        # Build a position-indexed list of links.
        positions = [(m.start(), m.end(), m.group(1), m.group(2)) for m in link_re.finditer(sec)]
        # Filter likely player links: heuristically, names are 2-4 word
        # capitalized strings. Also skip section-link backrefs and obvious
        # non-player links (tournament names, course names, etc.).
        for i, (start, end, target, display) in enumerate(positions):
            canonical = re.sub(r"\s*\([^)]*\)\s*$", "", target).strip()
            name = display or canonical
            # Reject obvious non-players.
            blacklist = {"PGA Tour", "European Tour", "World Golf Championships",
                         "Japan Golf Tour", "Korn Ferry Tour", "1986 PGA Championship",
                         "The Players Championship", "Players Championship",
                         "WGC events", "Senior PGA Tour", "U.S. Open", "U.S. Senior Open",
                         "British Open", "Masters Tournament", "PGA Championship",
                         "Category:Oklahoma State Cowboys golfers", "Karsten Creek"}
            if name in blacklist or name.startswith("Category:") or name.startswith("File:"):
                continue
            if re.match(r"^\d{4}", name):  # tournament year
                continue
            if not re.match(r"^[A-Z][a-zA-Z\.\-' ]+$", name) or len(name) > 50:
                continue
            words = name.split()
            if len(words) < 2 or len(words) > 5:
                continue
            if name.lower() in seen:
                continue
            seen.add(name.lower())
            # Capture the parenthetical that follows (if it's near the link).
            after = sec[end : end + 200]
            paren_m = re.match(r"\s*\(([^)]+)\)", after)
            paren = paren_m.group(1).strip() if paren_m else ""
            out.append({"name": name, "raw_line": (paren or "")[:300]})

    return out


def parse_head_coaches_table(wt: str) -> list[dict]:
    """Wikipedia program pages often have a head-coach table with name + tenure."""
    sec = slice_section(wt, "Head coaches") or slice_section(wt, "Coaching staff") or slice_section(wt, "Coaches")
    if not sec:
        return []
    out = []
    # Crude: look for lines with "Name (start–end)" or "Name | start | end".
    for ln in sec.splitlines():
        m = re.search(r"\[\[([A-Z][A-Za-z'\-\. ]+)(?:\|[^\]]+)?\]\].*?(\d{4})\s*[–-]\s*(\d{4}|present)", ln)
        if m:
            out.append(
                {
                    "name": m.group(1).strip(),
                    "start_year": int(m.group(2)),
                    "end_year": (
                        int(m.group(3)) if m.group(3).isdigit() else None
                    ),
                    "raw_line": ln.strip()[:200],
                }
            )
    return out


def parse_all_americans(wt: str) -> list[dict]:
    sec = slice_section(wt, "All-Americans") or slice_section(wt, "All-America")
    if not sec:
        return []
    out = []
    for ln in sec.splitlines():
        ln = ln.strip()
        if not ln.startswith("*"):
            continue
        body = ln.lstrip("* ").strip()
        # Examples:
        #  * Joe Smith (1991, 1992)
        #  * 1991: Joe Smith (1st team)
        years = find_year_list(body)
        if not years:
            continue
        # Extract player name as the first capitalized phrase.
        name_match = re.search(r"\[\[([^\]\|]+)(?:\|[^\]]+)?\]\]", body)
        name = name_match.group(1) if name_match else body.split("(")[0].strip()
        tier = None
        if re.search(r"first[\s\-]*team|1st team", body, re.I):
            tier = "first_team"
        elif re.search(r"second[\s\-]*team|2nd team", body, re.I):
            tier = "second_team"
        elif re.search(r"third[\s\-]*team|3rd team", body, re.I):
            tier = "third_team"
        elif re.search(r"honorable", body, re.I):
            tier = "honorable_mention"
        for y in years:
            out.append({"year": y, "player": name.strip(), "tier": tier, "raw": body[:200]})
    return out


def parse_program(slug: str, gender: str) -> dict | None:
    res = resolve_title(slug, gender)
    if not res:
        return None
    title, wt = res

    return {
        "school_slug": slug,
        "gender": "m" if gender in ("m", "men") else "w",
        "wikipedia_title": title,
        "wikipedia_url": f"https://en.wikipedia.org/wiki/{quote(title.replace(' ', '_'))}",
        "scraped_at": datetime.now().isoformat(timespec="seconds") + "Z",
        "ncaa_championships": parse_ncaa_titles(wt),
        "ncaa_runner_up": parse_ncaa_runner_up(wt),
        "ncaa_match_play_berths": parse_ncaa_matchplay(wt),
        "ncaa_appearances_from_infobox": parse_ncaa_appearances(wt),
        "individual_ncaa_champions": parse_individual_champions(wt),
        "conference_titles": parse_conference_titles(wt),
        "notable_alumni": parse_notable_alumni(wt),
        "head_coaches": parse_head_coaches_table(wt),
        "all_americans": parse_all_americans(wt),
    }


def main() -> None:
    args = parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if args.all:
        if not PLAYERS_INDEX.exists():
            print("No players index — run pipeline first")
            sys.exit(1)
        idx = json.loads(PLAYERS_INDEX.read_text())
        pairs = sorted({(e["school_slug"], e.get("gender") or "m") for e in idx})
        print(f"Running for {len(pairs)} school/gender pairs …")
        for slug, g in pairs:
            out = parse_program(slug, g)
            if not out:
                print(f"[wiki] {slug} {g}: no Wikipedia page resolved")
                continue
            out_path = OUT_DIR / f"wikipedia-{slug}-{g}.json"
            out_path.write_text(json.dumps(out, indent=2))
            print(
                f"[wiki] {slug} {g}: ncaa={len(out['ncaa_championships'])} "
                f"conf={len(out['conference_titles'])} "
                f"alumni={len(out['notable_alumni'])} "
                f"coaches={len(out['head_coaches'])} "
                f"AA={len(out['all_americans'])}"
            )
        return

    if not args.slug:
        print("Usage: <slug> <men|women>  OR  --all")
        sys.exit(1)
    g = "m" if args.gender in ("m", "men") else "w"
    out = parse_program(args.slug, g)
    if not out:
        print(f"No Wikipedia page found for {args.slug} ({g})")
        sys.exit(1)
    out_path = OUT_DIR / f"wikipedia-{args.slug}-{g}.json"
    out_path.write_text(json.dumps(out, indent=2))
    print(f"Wrote {out_path}")
    print(json.dumps({k: len(v) if isinstance(v, list) else v for k, v in out.items() if k != "wikipedia_url"}, indent=2))


if __name__ == "__main__":
    main()
