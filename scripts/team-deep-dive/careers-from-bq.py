#!/usr/bin/env python
"""
careers-from-bq.py — Phase 1 wedge: pull per-event career rows for every
roster member of a target team from granular_master.

Reads aliases via the same SCHOOL_ALIASES used by roster-from-bq.py.
For each (Name, tournament_id) the row carries:
  - tournament name + course
  - start date (Excel serial → ISO)
  - individual position (indi_pos)
  - team position
  - total_to_par
  - rounds[] (round number + rd_total + round_to_par)
  - source(s)

Writes data/team-deep-dive/careers-<slug>.json — flat array of per-event rows.

Run:
    ~/venv/bin/python scripts/team-deep-dive/careers-from-bq.py texas-tech men
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
sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import BQ_PROJECT, BQ_DATASET, BQ_CREDENTIALS_PATH  # type: ignore

os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", BQ_CREDENTIALS_PATH)

from google.cloud import bigquery  # noqa: E402

# Reuse the same alias map by importing the module.
import importlib.util

_spec = importlib.util.spec_from_file_location(
    "roster_from_bq", Path(__file__).resolve().parent / "roster-from-bq.py"
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)  # type: ignore
SCHOOL_ALIASES = _mod.SCHOOL_ALIASES

OUT_DIR = REPO_ROOT / "data" / "team-deep-dive"


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("gender", choices=["men", "women", "m", "w"])
    return ap.parse_args()


def aliases_for(slug: str) -> list[str]:
    if slug in SCHOOL_ALIASES:
        return SCHOOL_ALIASES[slug]
    return [" ".join(w.capitalize() for w in slug.split("-"))]


def query_careers(client: bigquery.Client, aliases: list[str], gender: str) -> list[dict]:
    g = "men" if gender in ("m", "men") else "women"
    division_like = "%Men%" if g == "men" else "%Women%"

    sql = f"""
    WITH per_round AS (
      SELECT
        Name,
        Team,
        division,
        tournament_id,
        ANY_VALUE(tournament) AS tournament,
        ANY_VALUE(course) AS course,
        round,
        rd_total,
        round_to_par,
        ANY_VALUE(indi_pos) AS indi_pos,
        ANY_VALUE(team_placing) AS team_placing,
        ANY_VALUE(total_to_par) AS total_to_par,
        ANY_VALUE(source) AS source,
        MIN(SAFE_CAST(date AS INT64)) AS first_date_serial
      FROM `{BQ_PROJECT}.{BQ_DATASET}.granular_master`
      WHERE Team IN UNNEST(@aliases)
        AND division LIKE @division_like
        AND Name IS NOT NULL
        AND TRIM(Name) != ''
        AND COALESCE(is_individual, FALSE) = FALSE
        AND SAFE_CAST(date AS INT64) > 0
      GROUP BY Name, Team, division, tournament_id, round, rd_total, round_to_par
    )
    SELECT
      Name,
      Team,
      division,
      tournament_id,
      ANY_VALUE(tournament) AS tournament,
      ANY_VALUE(course) AS course,
      DATE_ADD(DATE '1899-12-30', INTERVAL MIN(first_date_serial) DAY) AS start_date,
      ARRAY_AGG(STRUCT(round, rd_total, round_to_par) ORDER BY round) AS rounds,
      ANY_VALUE(indi_pos) AS individual_position,
      ANY_VALUE(team_placing) AS team_position,
      ANY_VALUE(total_to_par) AS total_to_par,
      STRING_AGG(DISTINCT source) AS sources
    FROM per_round
    GROUP BY Name, Team, division, tournament_id
    ORDER BY Name, start_date
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ArrayQueryParameter("aliases", "STRING", aliases),
            bigquery.ScalarQueryParameter("division_like", "STRING", division_like),
        ],
        maximum_bytes_billed=10 * 1024**3,
    )
    print(f"[bq] Aliases: {aliases}")
    print(f"[bq] Running careers query against {BQ_PROJECT}.{BQ_DATASET}.granular_master ...")
    rows = list(client.query(sql, job_config=job_config).result())
    print(f"[bq] {len(rows)} (player, event) rows returned")
    out = []
    for r in rows:
        out.append(
            {
                "raw_name": r.Name,
                "team": r.Team,
                "division": r.division,
                "tournament_id": r.tournament_id,
                "tournament": r.tournament,
                "course": r.course,
                "start_date": r.start_date.isoformat() if r.start_date else None,
                "rounds": [
                    {"round": x["round"], "rd_total": x["rd_total"], "round_to_par": x["round_to_par"]}
                    for x in r.rounds
                ],
                "individual_position": r.individual_position,
                "team_position": r.team_position,
                "total_to_par": r.total_to_par,
                "sources": r.sources,
            }
        )
    return out


def query_gender_stats(client: bigquery.Client, names: list[str]) -> dict[str, dict]:
    """For each name, return the global men's-vs-women's row split across
    granular_master. Used downstream to tag each player with primary_gender
    and a contamination_score so the team-page roster can filter."""
    if not names:
        return {}
    sql = f"""
    SELECT
      Name,
      SUM(IF(division LIKE '%Men%', 1, 0)) AS men_rows,
      SUM(IF(division LIKE '%Women%', 1, 0)) AS women_rows,
      COUNT(*) AS total_rows
    FROM `{BQ_PROJECT}.{BQ_DATASET}.granular_master`
    WHERE Name IN UNNEST(@names)
      AND COALESCE(is_individual, FALSE) = FALSE
      AND (division LIKE '%Men%' OR division LIKE '%Women%')
    GROUP BY Name
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ArrayQueryParameter("names", "STRING", names)],
        maximum_bytes_billed=10 * 1024**3,
    )
    print(f"[bq] Querying gender stats for {len(names)} distinct names ...")
    out: dict[str, dict] = {}
    for r in client.query(sql, job_config=job_config).result():
        men = int(r.men_rows or 0)
        women = int(r.women_rows or 0)
        total = int(r.total_rows or 0)
        primary = "m" if men >= women else "w"
        # Contamination score: 0 = clean, 1 = total mess.
        contamination = round(min(men, women) / max(total, 1), 3)
        out[r.Name] = {
            "men_rows": men,
            "women_rows": women,
            "total_rows": total,
            "primary_gender": primary,
            "contamination_score": contamination,
        }
    print(f"[bq] Got gender stats for {len(out)} names")
    return out


def main() -> None:
    args = parse_args()
    aliases = aliases_for(args.slug)

    client = bigquery.Client(project=BQ_PROJECT)
    rows = query_careers(client, aliases, args.gender)

    g = "m" if args.gender in ("m", "men") else "w"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"careers-{args.slug}-{g}.json"
    out_path.write_text(json.dumps(rows, indent=2, default=str))
    print(f"\nWrote {out_path}")
    print(f"Distinct players: {len(set(r['raw_name'] for r in rows))}")
    print(f"Distinct tournaments: {len(set(r['tournament_id'] for r in rows))}")

    # Gender stats — one batch query for every name in the roster.
    distinct_names = sorted({r["raw_name"] for r in rows})
    gender_stats = query_gender_stats(client, distinct_names)
    gs_path = OUT_DIR / f"gender-stats-{args.slug}-{g}.json"
    gs_path.write_text(json.dumps(gender_stats, indent=2))
    print(f"Wrote {gs_path}")

    # Top players by event count.
    from collections import Counter

    by_player = Counter(r["raw_name"] for r in rows)
    print("\nTop 10 by events:")
    for name, n in by_player.most_common(10):
        print(f"  {n:>3}  {name}")


if __name__ == "__main__":
    main()
