#!/usr/bin/env python
"""
parse-school-pdf.py — extract structured records from a school media-guide
or record-book PDF.

Texas Tech 2022 record book is the reference layout. Other schools' PDFs
will need school-specific tweaks; for now this is tuned to the TTU PDF
shape but written to be extended.

Sections extracted:
  - all_time_letterwinners (massive — every player who ever lettered)
  - head_coaches (year ranges)
  - all_americans (1st / 2nd / 3rd team / honorable mention)
  - all_big_12 (year + player)
  - academic_all_americans
  - academic_all_conference
  - palmer_cup
  - walker_cup
  - masters_appearances
  - major_amateur_titles
  - ncaa_regional_appearances (year + location + finish)
  - ncaa_championships_appearances (year + location + finish)
  - southwest_conference_championships (year + champion + medalist + Tech finish)
  - team_tournament_wins (sands era)
  - individual_tournament_wins (sands era)
  - top_54_hole_scores
  - top_10_tournament_winners
  - top_10_season_scoring_avg
  - low_round_records
  - big_12_player_of_year
  - hogan / haskins / nicklaus semifinalists
  - gcaa_coach_of_year

Usage:
  ~/venv/bin/python scripts/team-deep-dive/parse-school-pdf.py \\
      data/source/texas-tech-record-book-2022.pdf texas-tech men
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = REPO_ROOT / "data" / "team-deep-dive"


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf_path")
    ap.add_argument("slug")
    ap.add_argument("gender", choices=["men", "women", "m", "w"])
    return ap.parse_args()


def extract_text(pdf_path: Path) -> str:
    """Use pdftotext -layout (preserves columns)."""
    proc = subprocess.run(
        ["pdftotext", "-layout", str(pdf_path), "-"],
        check=True,
        capture_output=True,
        text=True,
    )
    return proc.stdout


def extract_text_raw(pdf_path: Path) -> str:
    """Single-column extraction — better for some sections that span columns."""
    proc = subprocess.run(
        ["pdftotext", "-raw", str(pdf_path), "-"],
        check=True,
        capture_output=True,
        text=True,
    )
    return proc.stdout


# ---------------------------------------------------------------------------
# All-time letterwinners
# ---------------------------------------------------------------------------

LETTERWINNER_RE = re.compile(
    r"""
    ^                                # start of stripped column line
    ([A-Z][A-Za-z'’\-\.]+(?:\s[A-Za-z'’\-\.]+)*),  # last name(s) (possibly hyphenated, with apostrophes)
    \s*                              # comma + optional space
    (.+?)                            # first name + initials/suffixes/quoted middle
    ,\s*                             # comma before year
    (\d{4}(?:-(?:\d{2}|\d{4}))?      # year range like "1985-89" or "1985-1989" or "1985"
        |N/A                         # or N/A
        |\d{4}-current               # or "1985-current"
    )
    \s*$
    """,
    re.VERBOSE,
)


def parse_letterwinners(text: str) -> list[dict]:
    """The letterwinners section is a 3-column alphabetical listing.

    Strategy: find the heading 'ALL-TIME LETTERWINNERS', slurp to end-of-doc
    or to 'HEAD COACHES'. Within that block, every line that matches the
    pattern 'Last, First, year-range' is a letterwinner. Letter-section
    headers (-A-, -B-, ...) are ignored.

    Because it's a 3-column layout from pdftotext -layout, each text line
    contains up to 3 entries side-by-side. We split each line on whitespace
    runs ≥ 2 spaces, then match each piece individually.
    """
    m = re.search(r"ALL-TIME LETTERWINNERS([\s\S]+?)(?:HEAD COACHES|\Z)", text)
    if not m:
        return []
    block = m.group(1)
    out: list[dict] = []
    seen: set[str] = set()
    for line in block.splitlines():
        # Split on 2+ whitespace runs — column separator.
        parts = re.split(r"\s{2,}", line.strip())
        for piece in parts:
            piece = piece.strip()
            if not piece:
                continue
            if re.fullmatch(r"-[A-Z]-", piece):
                continue
            if "(CONT" in piece.upper() or "ALL-TIME LETTERWINNERS" in piece.upper():
                continue
            mm = LETTERWINNER_RE.match(piece)
            if not mm:
                continue
            last, first, years = mm.groups()
            full = f"{first.strip()} {last.strip()}"
            key = full.lower()
            if key in seen:
                continue
            seen.add(key)
            first_year, last_year = parse_letter_years(years)
            out.append(
                {
                    "raw_name": full,
                    "last_name": last.strip(),
                    "first_name": first.strip(),
                    "years_raw": years,
                    "first_year": first_year,
                    "last_year": last_year,
                    "is_current": "current" in years.lower(),
                }
            )
    out.sort(key=lambda x: (x["last_name"], x["first_name"]))
    return out


def parse_letter_years(years: str) -> tuple[int | None, int | None]:
    if years.upper() == "N/A":
        return (None, None)
    if "-current" in years.lower():
        m = re.match(r"(\d{4})-current", years, re.I)
        if m:
            return (int(m.group(1)), 2026)
        return (None, None)
    m = re.match(r"^(\d{4})(?:-(\d{2,4}))?$", years.strip())
    if not m:
        return (None, None)
    a = int(m.group(1))
    b = m.group(2)
    if not b:
        return (a, a)
    if len(b) == 2:
        # "1985-89" → 1985, 1989
        century = (a // 100) * 100
        end = century + int(b)
        if end < a:
            end += 100
        return (a, end)
    return (a, int(b))


# ---------------------------------------------------------------------------
# Head coaches
# ---------------------------------------------------------------------------

# Pattern: "Greg Sands       2001- pres." OR "Tommy Wilson    1986-98 (13)"
COACH_RE = re.compile(
    r"^([A-Z][A-Za-z'’\-\.]+(?:\s[A-Z][A-Za-z'’\-\.]+)+)\s+"
    r"(\d{4}(?:-\d{2,4}|-\s*pres(?:\.|ent)?|,\s*\d{2}-\d{2,4}|,\s*\d{4})?)"
    r"(?:\s+\((\d+)\))?$"
)


def parse_head_coaches(text: str) -> list[dict]:
    """Coach rows look like:
        Gene Mitchell           1967-70, 81-83 (7)
        Greg Sands              2001- pres.
    Use a single regex over the full HEAD COACHES block — the >= 3 spaces
    between name and years anchor the match.
    """
    m = re.search(r"HEAD COACHES([\s\S]+?)(?:\Z)", text)
    if not m:
        return []
    block = m.group(1)
    coach_re = re.compile(
        r"([A-Z][A-Za-z'’\-\.]+(?:\s[A-Z][A-Za-z'’\-\.]+)+)\s{3,}"
        r"(\d{4}(?:[-,\s\d]+(?:pres(?:\.|ent)?\.?)?)?)"
        r"(?:\s*\((\d+)\))?",
        re.M,
    )
    out: list[dict] = []
    seen: set[str] = set()
    for mm in coach_re.finditer(block):
        name, years, n = mm.groups()
        # Filter out letterwinners that happen to land on a coach line
        # (e.g. "Pope, Travis, 1996-97" — has a comma; coach names don't).
        if "," in name:
            continue
        if name in seen:
            continue
        seen.add(name)
        out.append(
            {
                "name": name,
                "years_raw": re.sub(r"\s+", " ", years.strip().rstrip(",")),
                "tenure_years": int(n) if n else None,
            }
        )
    return out


# ---------------------------------------------------------------------------
# All-Americans (1st / 2nd / 3rd / HM)
# ---------------------------------------------------------------------------

AA_TIER_PATTERNS = {
    "first_team": r"FIRST-TEAM ALL-AMERICANS",
    "second_team": r"SECOND-TEAM ALL-AMERICANS",
    "third_team": r"THIRD-TEAM ALL-AMERICANS",
    "honorable_mention": r"HONORABLE MENTION ALL-AMERICANS",
}

AA_LINE_RE = re.compile(
    r"^(\d{4})\s+([A-Z][A-Za-z'’\-\.]+(?:\s[A-Z][A-Za-z'’\-\.]+)+)(?:\s*\(.+\))?$"
)


def _extract_left_column(text: str) -> str:
    """Drop everything beyond column 1 by clipping each line to the first
    big-whitespace gap. Useful when a section sits in the left column and
    a different section runs in the right column."""
    out_lines = []
    for ln in text.splitlines():
        # Drop right column: split on >=4 spaces.
        first = re.split(r"\s{4,}", ln, maxsplit=1)[0]
        out_lines.append(first)
    return "\n".join(out_lines)


def parse_all_americans(text: str) -> dict[str, list[dict]]:
    """Each tier is a left-column block under its header."""
    out: dict[str, list[dict]] = {k: [] for k in AA_TIER_PATTERNS}
    # Use left-column slice so PING ALL-REGION TEAM (right column) doesn't bleed in.
    left = _extract_left_column(text)
    for tier, pat in AA_TIER_PATTERNS.items():
        m = re.search(rf"{pat}([\s\S]+?)(?:FIRST-TEAM ALL-AMERICANS|SECOND-TEAM ALL-AMERICANS|THIRD-TEAM ALL-AMERICANS|HONORABLE MENTION ALL-AMERICANS|PING ALL-REGION|MAJOR AMATEUR|MASTERS APPEARANCES|WALKER CUP|SOUTHWEST CONFERENCE|INDIVIDUAL HONORS|\Z)", left)
        if not m:
            continue
        for line in m.group(1).splitlines():
            line = line.strip()
            mm = AA_LINE_RE.match(line)
            if not mm:
                continue
            year, name = mm.groups()
            note = ""
            paren = re.search(r"\(([^)]+)\)", line)
            if paren:
                note = paren.group(1)
            out[tier].append({"year": int(year), "player": name, "note": note})
    return out


# ---------------------------------------------------------------------------
# All-Big 12 (right column on the same page as INDIVIDUAL HONORS)
# ---------------------------------------------------------------------------

ALL_BIG12_LINE_RE = re.compile(r"^(\d{4})\s*\.+\s*([A-Z].+?)(?:,\s*([A-Z].+))?$")


def parse_all_big_12(text: str) -> list[dict]:
    m = re.search(r"^ALL-BIG 12\s*$([\s\S]+?)^\s*BIG 12 SCHOLAR", text, re.M)
    if not m:
        return []
    out = []
    for line in m.group(1).splitlines():
        s = line.strip()
        # Format like "2004 ......................... Andrew Dresser"
        mm = re.match(r"^(\d{4})[\s\.]+([A-Z][A-Za-z\-'’\s]+?)(?:\s*\(.+\))?$", s)
        if not mm:
            continue
        out.append({"year": int(mm.group(1)), "player": mm.group(2).strip()})
    return out


# ---------------------------------------------------------------------------
# Single-line "year + player" sections (Big 12 POY / Hogan / Haskins / Nicklaus / GCAA Coach)
# ---------------------------------------------------------------------------

SINGLE_LINE_HEADERS = {
    "big_12_player_of_the_year": r"BIG 12 PLAYER OF THE YEAR",
    "gcaa_coach_of_the_year": r"GCAA Central Region Coach of the Year",
    "ben_hogan_award_semifinalist": r"BEN HOGAN AWARD SEMIFINALIST",
    "haskins_award_semifinalist": r"HASKINS AWARD SEMIFINALIST",
    "nicklaus_award_semifinalist": r"NICKLAUS AWARD SEMIFINALIST",
    "arnold_palmer_cup": r"ARNOLD PALMER CUP INTERNATIONAL TEAM",
    "walker_cup_appearances": r"WALKER CUP APPEARANCES",
    "masters_appearances": r"MASTERS APPEARANCES",
    "major_amateur_titles": r"MAJOR AMATEUR TITLES",
}

NEXT_HEADER_RE = re.compile(
    r"^(?:BIG 12 PLAYER|GCAA |BEN HOGAN|HASKINS|NICKLAUS|ARNOLD PALMER|ALL-BIG 12|BIG 12 SCHOLAR|ALL BIG 12|ACADEMIC ALL|WALKER CUP|MASTERS APPEAR|MAJOR AMATEUR|PING ALL-REGION|FIRST-TEAM|SECOND-TEAM|THIRD-TEAM|HONORABLE|SOUTHWEST CONFERENCE|INDIVIDUAL HONORS|HEAD COACHES|ALL-TIME LETTERWINNERS)",
    re.M,
)


def parse_single_line_sections(text: str) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {k: [] for k in SINGLE_LINE_HEADERS}
    for key, header in SINGLE_LINE_HEADERS.items():
        m = re.search(rf"{header}([\s\S]+?)(?:^[A-Z][A-Z0-9 \-/]+$|\Z)", text, re.M)
        if not m:
            continue
        block = m.group(1)
        # Stop at next major header.
        nxt = NEXT_HEADER_RE.search(block)
        if nxt:
            block = block[: nxt.start()]
        for line in block.splitlines():
            s = line.strip()
            if not s:
                continue
            # "2018 ............................. Fredrik Nilehn"
            # "Sandy Scott - 2019" (Walker Cup style)
            # "Matias Dominguez - Latin American Amateur Championship (2015)"
            mm = re.match(r"^(\d{4})[\s\.]*([A-Z].+?)$", s)
            if mm:
                out[key].append({"year": int(mm.group(1)), "entry": mm.group(2).strip()})
                continue
            mm2 = re.match(r"^([A-Z][A-Za-z\s'’\-\.&]+?)\s*[-–]\s*(.+)$", s)
            if mm2:
                player, rest = mm2.groups()
                yr_m = re.search(r"(\d{4})", rest)
                out[key].append(
                    {
                        "year": int(yr_m.group(1)) if yr_m else None,
                        "entry": f"{player.strip()} — {rest.strip()}",
                    }
                )
    return out


# ---------------------------------------------------------------------------
# NCAA Regional Appearances + NCAA Championships Appearances
# ---------------------------------------------------------------------------

NCAA_LINE_RE = re.compile(
    r"^(\*?\d{4})\s+(.+?)\.+\s*(.+)$"
)


def parse_ncaa_appearances(text: str) -> dict[str, list[dict]]:
    out = {"regional": [], "championships": []}

    m = re.search(r"NCAA REGIONAL APPEARANCES([\s\S]+?)(?:NCAA Regional Team|NCAA CHAMPIONSHIPS APPEARANCES|\Z)", text)
    if m:
        for line in m.group(1).splitlines():
            s = line.strip()
            if "Year" in s and "Tournament" in s:
                continue
            mm = NCAA_LINE_RE.match(s)
            if not mm:
                continue
            year_raw, where, finish = mm.groups()
            year_clean = year_raw.lstrip("*")
            if not year_clean.isdigit():
                continue
            out["regional"].append(
                {"year": int(year_clean), "location": where.strip(), "finish": finish.strip(), "canceled": "*" in year_raw}
            )

    m = re.search(r"NCAA CHAMPIONSHIPS APPEARANCES([\s\S]+?)(?:NCAA Regional Team|NCAA Championships Team|Top 54-Hole|Top 10|ALL-AMERICANS|SOUTHWEST CONFERENCE|INDIVIDUAL HONORS|\Z)", text)
    if m:
        for line in m.group(1).splitlines():
            s = line.strip()
            if "Year" in s and "Location" in s:
                continue
            mm = NCAA_LINE_RE.match(s)
            if not mm:
                continue
            year_raw, where, finish = mm.groups()
            year_clean = year_raw.lstrip("*")
            if not year_clean.isdigit():
                continue
            out["championships"].append(
                {"year": int(year_clean), "location": where.strip(), "finish": finish.strip()}
            )
    return out


# ---------------------------------------------------------------------------
# Southwest Conference Championships (year + champion + medalist + Tech finish)
# ---------------------------------------------------------------------------

SWC_LINE_RE = re.compile(
    r"^(\d{4})\s+([A-Z][A-Za-z &]+?)\s{2,}([A-Z].+?)\s*(?:(\d+)(?:st|nd|rd|th))?\s*$"
)


def parse_swc(text: str) -> list[dict]:
    m = re.search(r"SOUTHWEST CONFERENCE CHAMPIONSHIPS([\s\S]+?)(?:^[A-Z][A-Z0-9 ]+$|INDIVIDUAL HONORS|\Z)", text, re.M)
    if not m:
        return []
    out = []
    for line in m.group(1).splitlines():
        s = line.rstrip()
        if not s.strip() or s.lstrip().startswith("Year"):
            continue
        mm = SWC_LINE_RE.match(s)
        if not mm:
            continue
        year, champ, medalist, finish = mm.groups()
        out.append(
            {
                "year": int(year),
                "champion": champ.strip(),
                "medalist": medalist.strip(),
                "tech_finish": int(finish) if finish else None,
            }
        )
    return out


# ---------------------------------------------------------------------------
# Top sections: 54-hole, low round, season scoring avg, tournament winners
# ---------------------------------------------------------------------------

def parse_top_54(text: str) -> list[dict]:
    m = re.search(r"Top 54-Hole Scores \(all-time\)([\s\S]+?)(?:Top 10|Low Round|\Z)", text)
    if not m:
        return []
    out = []
    rank: int | None = None
    for line in m.group(1).splitlines():
        s = line.strip()
        if not s or s.startswith("Rk"):
            continue
        # "1. 197       Hurly Long           2017 Carmel Cup"
        # or "    202       Mark Allen           1989 NMMI Invitational" (no rank)
        mm = re.match(
            r"^(?:(\d+|T\d+)\.)?\s*(\d{3})\s+([A-Z][A-Za-z'’\.\-\s]+?)\s{2,}(.+)$",
            s,
        )
        if not mm:
            continue
        rk_str, score, player, tournament = mm.groups()
        if rk_str:
            rank = int(rk_str.lstrip("T"))
        out.append(
            {
                "rank": rank,
                "score": int(score),
                "player": player.strip(),
                "tournament": tournament.strip(),
            }
        )
    return out


def parse_top_season_avg(text: str) -> list[dict]:
    m = re.search(r"Top 10 Single-Season Stroke Averages \(Min\. 20 rounds\)([\s\S]+?)(?:Low Round|\Z)", text)
    if not m:
        return []
    out = []
    rank: int | None = None
    for line in m.group(1).splitlines():
        s = line.strip()
        if not s or s.startswith("Rk"):
            continue
        mm = re.match(
            r"^(?:(\d+|T\d+)\.)?\s*(\d{2}\.\d)\s+([A-Z][A-Za-z'’\-\s\.]+?)\s+(\d{4}-\d{2,4})$",
            s,
        )
        if not mm:
            continue
        rk_str, avg, player, season = mm.groups()
        if rk_str:
            rank = int(rk_str.lstrip("T"))
        out.append(
            {
                "rank": rank,
                "avg": float(avg),
                "player": player.strip(),
                "season": season,
            }
        )
    return out


def parse_low_rounds(text: str) -> list[dict]:
    m = re.search(r"^Low Round\s*$([\s\S]+?)(?:\Z)", text, re.M)
    if not m:
        return []
    out = []
    rank: int | None = None
    for line in m.group(1).splitlines():
        s = line.strip()
        if not s or s.startswith("Rk"):
            continue
        mm = re.match(
            r"^(?:(\d+|T\d+)\.)?\s*(\d{2})\s+([A-Z][A-Za-z'’\-\.\s]+?)\s{2,}(.+)$",
            s,
        )
        if not mm:
            continue
        rk_str, score, player, tournament = mm.groups()
        if rk_str:
            rank = int(rk_str.lstrip("T"))
        out.append(
            {
                "rank": rank,
                "score": int(score),
                "player": player.strip(),
                "tournament": tournament.strip(),
            }
        )
    return out


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def _sanity_cap(items: list, label: str, ceiling: int = 60) -> list:
    """Drop sections that overflow the credible ceiling — e.g. a 'head coaches'
    extraction with 394 entries is clearly a false positive from a different
    layout. Returns [] in that case so downstream code skips the section."""
    if len(items) > ceiling:
        print(
            f"WARN: dropping '{label}' — {len(items)} entries exceeds sanity ceiling {ceiling}; "
            f"likely a false positive (this PDF has a non-TTU layout). Skip-listing.",
            file=sys.stderr,
        )
        return []
    return items


def main() -> None:
    args = parse_args()
    pdf = Path(args.pdf_path).resolve()
    if not pdf.exists():
        print(f"PDF not found: {pdf}", file=sys.stderr)
        sys.exit(1)
    gender = "m" if args.gender in ("men", "m") else "w"

    print(f"Extracting text from {pdf} ...")
    text = extract_text(pdf)
    raw_text = extract_text_raw(pdf)

    print("Parsing sections ...")
    letterwinners = parse_letterwinners(text)
    head_coaches = _sanity_cap(parse_head_coaches(text), "head_coaches", ceiling=30)
    all_americans = parse_all_americans(text)
    for tier in list(all_americans.keys()):
        all_americans[tier] = _sanity_cap(all_americans[tier], f"all_americans.{tier}", ceiling=80)
    all_big_12 = _sanity_cap(parse_all_big_12(text), "all_big_12", ceiling=200)
    singles = parse_single_line_sections(text)
    for k in list(singles.keys()):
        singles[k] = _sanity_cap(singles[k], k, ceiling=80)
    ncaa = parse_ncaa_appearances(text)
    ncaa["regional"] = _sanity_cap(ncaa["regional"], "ncaa_regional", ceiling=60)
    ncaa["championships"] = _sanity_cap(ncaa["championships"], "ncaa_championships", ceiling=80)
    swc = _sanity_cap(parse_swc(text), "swc", ceiling=60)
    top_54 = parse_top_54(text)
    top_avg = parse_top_season_avg(text)
    low_rounds = parse_low_rounds(text)

    out = {
        "school_slug": args.slug,
        "gender": gender,
        "source_pdf": pdf.name,
        "built_at": datetime.now().isoformat(timespec="seconds"),
        "sections": {
            "all_time_letterwinners": letterwinners,
            "head_coaches": head_coaches,
            "all_americans": all_americans,
            "all_big_12": all_big_12,
            "ncaa_regional_appearances": ncaa["regional"],
            "ncaa_championships_appearances": ncaa["championships"],
            "southwest_conference_championships": swc,
            "top_54_hole_scores": top_54,
            "top_season_scoring_averages": top_avg,
            "low_rounds": low_rounds,
            **singles,
        },
    }

    g = "m" if args.gender in ("m", "men") else "w"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"school-pdf-{args.slug}-{g}.json"
    out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False))
    print(f"\nWrote {out_path}")
    print(f"  letterwinners: {len(letterwinners)}")
    print(f"  head_coaches: {len(head_coaches)}")
    for tier, arr in all_americans.items():
        print(f"  all_americans.{tier}: {len(arr)}")
    print(f"  all_big_12: {len(all_big_12)}")
    print(f"  ncaa_regional: {len(ncaa['regional'])}")
    print(f"  ncaa_championships: {len(ncaa['championships'])}")
    print(f"  swc championships: {len(swc)}")
    print(f"  top_54_hole_scores: {len(top_54)}")
    print(f"  top_season_avg: {len(top_avg)}")
    print(f"  low_rounds: {len(low_rounds)}")
    for k, arr in singles.items():
        print(f"  {k}: {len(arr)}")


if __name__ == "__main__":
    main()
