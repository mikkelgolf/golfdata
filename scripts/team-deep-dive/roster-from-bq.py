#!/usr/bin/env python
"""
roster-from-bq.py — Phase 0b roster expander for /team-deep-dive.

Queries `granular-scoring.granular_scoring_dataset.granular_master` for every
distinct (Name, Team) pair where Team matches the target school's aliases.
Read-only. Outputs candidate rows merged into the existing roster preview at
data/team-deep-dive/roster-preview-<slug>.json.

This is the single biggest roster expansion lever — granular_master has
hole-level results from GolfStat + Clippd going back ~15 years.

Run:
    ~/venv/bin/python scripts/team-deep-dive/roster-from-bq.py texas-tech men
    ~/venv/bin/python scripts/team-deep-dive/roster-from-bq.py oklahoma-state men --dry-run

Aliases are managed in scripts/team-deep-dive/lib/school_aliases.py — extend as
new edge cases surface.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT.parent / "mikkel-system" / "tools" / "tournament-scraper"))

# Reuse existing config so we share BQ_CREDENTIALS_PATH + project/dataset.
from config import BQ_PROJECT, BQ_DATASET, BQ_CREDENTIALS_PATH  # type: ignore

os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", BQ_CREDENTIALS_PATH)

from google.cloud import bigquery  # noqa: E402


OUT_DIR = REPO_ROOT / "data" / "team-deep-dive"


# Minimal alias map — extend as we add teams. Keep in sync with the TS
# version in roster-discovery.ts:schoolAliasesForSlug.
SCHOOL_ALIASES: dict[str, list[str]] = {
    "texas-tech": ["Texas Tech", "Texas Tech University", "Texas Tech Univ.", "TTU"],
    "oklahoma-state": ["Oklahoma State", "Oklahoma St.", "Oklahoma St", "OK State"],
    "north-carolina": ["North Carolina", "UNC", "North Carolina-Chapel Hill"],
    "nc-state": ["NC State", "North Carolina State", "N.C. State"],
    "ucla": ["UCLA", "California-Los Angeles", "California Los Angeles"],
    "brigham-young": ["BYU", "Brigham Young", "Brigham Young University"],
    "ole-miss": ["Ole Miss", "Mississippi"],
    "lsu": ["LSU", "Louisiana State"],
    "auburn": ["Auburn"],
    "vanderbilt": ["Vanderbilt", "Vandy"],
    "stanford": ["Stanford"],
    "texas": ["Texas"],
    "alabama": ["Alabama"],
    "arkansas": ["Arkansas"],
    "arizona-state": ["Arizona State", "Arizona St.", "ASU"],
    "georgia": ["Georgia"],
    "illinois": ["Illinois"],
    "florida": ["Florida"],
    "tennessee": ["Tennessee"],
    "kentucky": ["Kentucky"],
    "south-carolina": ["South Carolina"],
    "missouri": ["Missouri"],
    "mississippi-state": ["Mississippi State", "Miss. State", "Miss State"],
    "ohio-state": ["Ohio State", "Ohio St.", "Ohio St"],
    "michigan": ["Michigan"],
    "michigan-state": ["Michigan State", "Mich. State"],
    "purdue": ["Purdue"],
    "indiana": ["Indiana"],
    "wisconsin": ["Wisconsin"],
    "iowa": ["Iowa"],
    "iowa-state": ["Iowa State", "Iowa St."],
    "kansas": ["Kansas"],
    "kansas-state": ["Kansas State", "Kansas St."],
    "minnesota": ["Minnesota"],
    "northwestern": ["Northwestern"],
    "duke": ["Duke"],
    "clemson": ["Clemson"],
    "wake-forest": ["Wake Forest", "Wake"],
    "virginia": ["Virginia"],
    "virginia-tech": ["Virginia Tech"],
    "florida-state": ["Florida State", "Florida St."],
    "miami-fl": ["Miami (FL)", "Miami", "Miami Florida"],
    "louisville": ["Louisville"],
    "notre-dame": ["Notre Dame"],
    "tcu": ["TCU", "Texas Christian"],
    "smu": ["SMU", "Southern Methodist"],
    "houston": ["Houston"],
    "baylor": ["Baylor"],
    "west-virginia": ["West Virginia"],
    "cincinnati": ["Cincinnati"],
    "central-florida": ["Central Florida", "UCF"],
    "south-florida": ["South Florida", "USF"],
    "oklahoma": ["Oklahoma"],
    "arizona": ["Arizona"],
    "usc": ["USC", "Southern California"],
    "california": ["California", "Cal"],
    "washington": ["Washington"],
    "oregon": ["Oregon"],
    "oregon-state": ["Oregon State", "Oregon St."],
    "colorado": ["Colorado"],
    "utah": ["Utah"],
    "san-diego-state": ["San Diego State", "San Diego St."],
    "fresno-state": ["Fresno State"],
    "pepperdine": ["Pepperdine"],
    "georgia-tech": ["Georgia Tech", "Georgia Tech Yellow Jackets"],
    "texas-aandm": ["Texas A&M", "Texas A&M University", "Texas A and M"],
    "southern-california": ["Southern California", "USC"],
    "ucf": ["UCF", "Central Florida"],
}


def slugify(name: str) -> str:
    s = name.lower().replace("&", "and")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Expand roster preview from BigQuery granular_master")
    ap.add_argument("slug", help="team slug (e.g. texas-tech)")
    ap.add_argument("gender", choices=["men", "women", "m", "w"])
    ap.add_argument("--dry-run", action="store_true", help="print summary, don't write output")
    ap.add_argument("--max-rows", type=int, default=10000, help="LIMIT clause on the BQ query")
    return ap.parse_args()


def aliases_for(slug: str) -> list[str]:
    if slug not in SCHOOL_ALIASES:
        print(
            f"WARN: no alias list for slug '{slug}'. Add it to SCHOOL_ALIASES in this file.",
            file=sys.stderr,
        )
        # Fallback: title-case the slug as a single literal alias.
        return [" ".join(w.capitalize() for w in slug.split("-"))]
    return SCHOOL_ALIASES[slug]


def query_roster(
    client: bigquery.Client,
    aliases: list[str],
    gender: str,
    max_rows: int,
) -> list[dict]:
    """Query granular_master for every (Name, Team) pair matching aliases.

    Returns one row per (Name, Team, division), with date range + event count.
    """
    g = "men" if gender in ("m", "men") else "women"
    # Division strings on Clippd look like 'Men's Division I' / 'Women's Division I'
    # but GolfStat-sourced rows may differ. Use a broad LIKE pattern.
    division_like = "%Men%" if g == "men" else "%Women%"

    # Note: cross-gender contamination filter lives in build-player-exports.ts
    # where we compute primary_gender per player from their global division
    # split (more flexible than a SQL hard-cutoff that mis-handles legit
    # men's players whose data has ~30% women's-tagged noise).
    sql = f"""
    SELECT
      Name,
      Team,
      division,
      COUNT(DISTINCT tournament_id) AS events,
      COUNT(*) AS rows_total,
      MIN(DATE_ADD(DATE '1899-12-30', INTERVAL SAFE_CAST(date AS INT64) DAY)) AS first_event_date,
      MAX(DATE_ADD(DATE '1899-12-30', INTERVAL SAFE_CAST(date AS INT64) DAY)) AS last_event_date,
      STRING_AGG(DISTINCT source LIMIT 5) AS sources
    FROM `{BQ_PROJECT}.{BQ_DATASET}.granular_master`
    WHERE Team IN UNNEST(@aliases)
      AND division LIKE @division_like
      AND Name IS NOT NULL
      AND TRIM(Name) != ''
      AND COALESCE(is_individual, FALSE) = FALSE
      AND SAFE_CAST(date AS INT64) > 0
    GROUP BY Name, Team, division
    ORDER BY events DESC, last_event_date DESC
    LIMIT {max_rows}
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ArrayQueryParameter("aliases", "STRING", aliases),
            bigquery.ScalarQueryParameter("division_like", "STRING", division_like),
        ],
        # Soft cap: 5 GB. granular_master is only a few GB total, so this is plenty.
        maximum_bytes_billed=5 * 1024**3,
    )
    print(f"[bq] Aliases: {aliases}")
    print(f"[bq] Division pattern: {division_like}")
    print(f"[bq] Running query against {BQ_PROJECT}.{BQ_DATASET}.granular_master ...")
    rows = list(client.query(sql, job_config=job_config).result())
    print(f"[bq] {len(rows)} distinct (Name, Team, division) rows returned")
    return [
        {
            "raw_name": r.Name,
            "team": r.Team,
            "division": r.division,
            "events": int(r.events),
            "rows_total": int(r.rows_total),
            "first_event_date": r.first_event_date.isoformat() if r.first_event_date else None,
            "last_event_date": r.last_event_date.isoformat() if r.last_event_date else None,
            "sources": r.sources,
        }
        for r in rows
    ]


_CAMEL_LL_UU = re.compile(r"([a-z])([A-Z])")
_CAMEL_UU_ULL = re.compile(r"([A-Z])([A-Z][a-z])")
_NICKNAMES = {
    # Mirror lib/identity.ts NICKNAME_GROUPS roots. Map every variant to
    # its canonical token (the shorter form usually wins). Keep in sync.
    "jonathan": "jon", "jonny": "jon",
    "william": "will", "bill": "will", "billy": "will",
    "robert": "bob", "bobby": "bob", "rob": "bob", "robbie": "bob",
    "michael": "mike", "mickey": "mike",
    "matthew": "matt", "matty": "matt",
    "daniel": "dan", "danny": "dan",
    "christopher": "chris", "topher": "chris",
    "alexander": "alex", "alec": "alex",
    "nicholas": "nick", "nicky": "nick",
    "anthony": "tony",
    "thomas": "tom", "tommy": "tom",
    "james": "jim", "jimmy": "jim", "jamie": "jim",
    "patrick": "pat", "paddy": "pat",
    "samuel": "sam", "sammy": "sam",
    "joshua": "josh",
    "benjamin": "ben", "benny": "ben",
    "andrew": "andy", "drew": "andy",
    "zachary": "zach", "zac": "zach",
    "nathan": "nate", "nat": "nate",
    "lucas": "luke",
    "theodore": "theo",
    "edward": "ed", "ted": "ed", "eddie": "ed",
    "frederick": "fred", "freddie": "fred",
    "gregory": "greg",
}


def normalize_name(raw: str) -> str:
    if not raw:
        return ""
    # Fold diacritics.
    import unicodedata
    s = unicodedata.normalize("NFD", raw)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    # Split CamelCase before lowercasing — fixes the "LudvigAberg" PDF artifact.
    s = _CAMEL_LL_UU.sub(r"\1 \2", s)
    s = _CAMEL_UU_ULL.sub(r"\1 \2", s)
    s = s.lower().strip()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[,.\s]+(jr|sr|ii|iii|iv)$", "", s)
    s = re.sub(r"[.\-']", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return " ".join(_NICKNAMES.get(t, t) for t in s.split(" "))


def merge_into_preview(slug: str, gender: str, bq_rows: list[dict]) -> dict:
    g = "m" if gender in ("m", "men") else "w"
    preview_path = OUT_DIR / f"roster-preview-{slug}-{g}.json"
    if not preview_path.exists():
        print(f"WARN: {preview_path} does not exist; creating a fresh preview from BQ rows only.")
        preview = {
            "team_slug": slug,
            "team_name": slug,
            "gender": "m" if gender in ("m", "men") else "w",
            "built_at": datetime.utcnow().isoformat() + "Z",
            "candidate_count": 0,
            "candidates": [],
            "sources_consulted": [],
            "notes": [],
            "program_appearances": {
                "regional_years": [],
                "championship_years": [],
                "regionals_rich_years": [],
            },
        }
    else:
        preview = json.loads(preview_path.read_text())

    # Index existing candidates by normalized name.
    by_norm: dict[str, dict] = {}
    for c in preview["candidates"]:
        by_norm[c["normalized_name"]] = c

    added = 0
    enriched = 0
    for r in bq_rows:
        norm = normalize_name(r["raw_name"])
        mention = {
            "source": "golfstat" if r["sources"] and "golfstat" in r["sources"] else "clippd",
            "context": f"granular_master:{r['team']}/{r['division']}",
            "year": int(r["first_event_date"][:4]) if r.get("first_event_date") else None,
            "detail": (
                f"{r['events']} events, "
                f"{r['first_event_date']}..{r['last_event_date']}, "
                f"sources={r['sources']}"
            ),
        }
        if norm in by_norm:
            by_norm[norm]["mentions"].append(mention)
            # Prefer the BQ raw_name when it has whitespace and the
            # existing one doesn't — fixes display-name artifacts like
            # "LudvigAberg" coming from a PDF parser glitch in the NCAA
            # Record Book.
            existing_raw = by_norm[norm]["raw_name"]
            new_raw = r["raw_name"].strip()
            if " " in new_raw and " " not in existing_raw:
                by_norm[norm]["raw_name"] = new_raw
            enriched += 1
        else:
            by_norm[norm] = {
                "raw_name": r["raw_name"].strip(),
                "normalized_name": norm,
                "mentions": [mention],
                "confidence": 0.0,
            }
            added += 1

    # Recompute confidence: now we can weight by event count too.
    for c in by_norm.values():
        sources = {m["source"] for m in c["mentions"]}
        bq_event_count = 0
        for m in c["mentions"]:
            d = m.get("detail") or ""
            mm = re.match(r"(\d+) events", d)
            if mm:
                bq_event_count = max(bq_event_count, int(mm.group(1)))
        score = 0.5 + (len(sources) - 1) * 0.2 + min(0.4, bq_event_count * 0.04)
        score = min(0.99, score)
        c["confidence"] = round(score, 2)

    # Re-sort.
    candidates = sorted(
        by_norm.values(),
        key=lambda c: (-c["confidence"], c["normalized_name"]),
    )
    preview["candidates"] = candidates
    preview["candidate_count"] = len(candidates)
    sources_consulted = set(preview.get("sources_consulted", []))
    sources_consulted.add("golfstat")
    sources_consulted.add("clippd")
    preview["sources_consulted"] = sorted(sources_consulted)
    preview["notes"].append(
        f"granular_master: +{added} new candidates, enriched {enriched} existing"
    )
    preview["built_at"] = datetime.utcnow().isoformat() + "Z"
    return preview


def main() -> None:
    args = parse_args()
    aliases = aliases_for(args.slug)

    client = bigquery.Client(project=BQ_PROJECT)
    bq_rows = query_roster(client, aliases, args.gender, args.max_rows)

    print()
    print(f"Top 15 by events in BQ:")
    for r in bq_rows[:15]:
        print(
            f"  {r['events']:>3} events  {r['raw_name']:<28} "
            f"{r['first_event_date']}..{r['last_event_date']}  [{r['team']}, {r['division']}]"
        )

    if args.dry_run:
        print("\n--dry-run set; not writing preview.")
        return

    preview = merge_into_preview(args.slug, args.gender, bq_rows)
    g = "m" if args.gender in ("m", "men") else "w"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"roster-preview-{args.slug}-{g}.json"
    out_path.write_text(json.dumps(preview, indent=2, default=str))
    print(f"\nWrote {out_path}")
    print(f"Total candidates now: {preview['candidate_count']}")


if __name__ == "__main__":
    main()
