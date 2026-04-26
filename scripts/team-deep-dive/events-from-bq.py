#!/usr/bin/env python
"""
events-from-bq.py — pull full tournament leaderboards from granular_master
for every tournament_id referenced by any committed player JSON.

The "leaderboard once, attribute many" mechanic in static-JSON form: by
materializing whole leaderboards at the event level, every player on every
team that played in that event becomes linkable from /events/<year>/<slug>.

Usage:
    ~/venv/bin/python scripts/team-deep-dive/events-from-bq.py
    ~/venv/bin/python scripts/team-deep-dive/events-from-bq.py --tournament-id 12345
    ~/venv/bin/python scripts/team-deep-dive/events-from-bq.py --max 50

Outputs:
    src/data/events/<year>-<slug>.json   (one per tournament)
    src/data/events/index.json           (lookup table)
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

from config import BQ_PROJECT, BQ_DATASET, BQ_CREDENTIALS_PATH  # type: ignore

os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", BQ_CREDENTIALS_PATH)

from google.cloud import bigquery  # noqa: E402

PLAYERS_DIR = REPO_ROOT / "src" / "data" / "players"
EVENTS_DIR = REPO_ROOT / "src" / "data" / "events"


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tournament-id", help="Only fetch this single tournament_id")
    ap.add_argument("--max", type=int, default=None, help="Cap number of events fetched")
    ap.add_argument("--gender", choices=["men", "women"], default=None,
                    help="If set, only emit events from this gender (filters per-row)")
    return ap.parse_args()


def slugify(s: str) -> str:
    s = (s or "").lower().replace("&", "and")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "event"


def collect_tournament_ids(single: str | None) -> list[str]:
    if single:
        return [single]
    ids: set[str] = set()
    if not PLAYERS_DIR.exists():
        return []
    for p in PLAYERS_DIR.glob("*.json"):
        if p.name == "index.json":
            continue
        try:
            d = json.loads(p.read_text())
        except Exception:
            continue
        for ev in d.get("career", {}).get("events", []) or []:
            tid = ev.get("tournament_id")
            if tid:
                ids.add(str(tid))
    return sorted(ids)


def query_events_batch(client: bigquery.Client, tids: list[int]) -> dict[str, dict]:
    """Single full-scan for all tournament_ids; partition in Python.

    granular_master is partitioned by date, not tournament_id, so per-event
    queries each pay a full-scan. Batching pulls every requested event in
    one job — pay the scan once.
    """
    sql = f"""
    WITH per_round AS (
      SELECT
        tournament_id,
        Name,
        Team,
        division,
        round,
        rd_total,
        round_to_par,
        ANY_VALUE(tournament) AS tournament,
        ANY_VALUE(course) AS course,
        ANY_VALUE(indi_pos) AS indi_pos,
        ANY_VALUE(team_placing) AS team_placing,
        ANY_VALUE(total_to_par) AS total_to_par,
        ANY_VALUE(source) AS source,
        ANY_VALUE(SAFE_CAST(date AS INT64)) AS date_serial
      FROM `{BQ_PROJECT}.{BQ_DATASET}.granular_master`
      WHERE tournament_id IN UNNEST(@tids)
        AND Name IS NOT NULL
        AND TRIM(Name) != ''
        AND COALESCE(is_individual, FALSE) = FALSE
      GROUP BY tournament_id, Name, Team, division, round, rd_total, round_to_par
    )
    SELECT
      tournament_id,
      Name,
      Team,
      division,
      ANY_VALUE(tournament) AS tournament,
      ANY_VALUE(course) AS course,
      DATE_ADD(DATE '1899-12-30', INTERVAL MIN(date_serial) DAY) AS start_date,
      ARRAY_AGG(STRUCT(round, rd_total, round_to_par) ORDER BY round) AS rounds,
      ANY_VALUE(indi_pos) AS individual_position,
      ANY_VALUE(team_placing) AS team_position,
      ANY_VALUE(total_to_par) AS total_to_par,
      STRING_AGG(DISTINCT source) AS sources
    FROM per_round
    GROUP BY tournament_id, Name, Team, division
    ORDER BY tournament_id, Team, total_to_par
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ArrayQueryParameter("tids", "INT64", tids)],
        maximum_bytes_billed=8 * 1024**3,
    )
    print(f"[bq] Batch query for {len(tids)} tournaments ...")
    rows = list(client.query(sql, job_config=job_config).result())
    print(f"[bq] {len(rows)} (player, tournament) rows returned")

    by_tid: dict[str, dict] = {}
    for r in rows:
        tid = str(r.tournament_id)
        evt = by_tid.get(tid)
        if not evt:
            start_date = r.start_date.isoformat() if r.start_date else None
            year = int(start_date[:4]) if start_date else None
            division = r.division
            gender = (
                "m" if division and "Men" in division
                else "w" if division and "Women" in division
                else None
            )
            evt = {
                "tournament_id": tid,
                "tournament": r.tournament or f"Tournament {tid}",
                "course": r.course,
                "start_date": start_date,
                "season_year": year,
                "gender": gender,
                "division": division,
                "competitors": [],
                "built_at": datetime.utcnow().isoformat() + "Z",
            }
            by_tid[tid] = evt
        evt["competitors"].append(
            {
                "raw_name": r.Name,
                "team": r.Team,
                "division": r.division,
                "rounds": [
                    {"round": x["round"], "rd_total": x["rd_total"], "round_to_par": x["round_to_par"]}
                    for x in r.rounds
                ],
                "individual_position": r.individual_position,
                "team_position": r.team_position,
                "total_to_par": r.total_to_par,
                "sources": (r.sources or "").split(",") if r.sources else [],
            }
        )

    for evt in by_tid.values():
        evt["competitor_count"] = len(evt["competitors"])
        evt["team_count"] = len({c["team"] for c in evt["competitors"] if c["team"]})
    return by_tid


def main() -> None:
    args = parse_args()
    tids = collect_tournament_ids(args.tournament_id)
    if not tids:
        print("No tournament_ids found in src/data/players/. Run build-player-exports first.")
        return

    if args.max:
        tids = tids[: args.max]

    print(f"Fetching {len(tids)} tournaments from granular_master ...")
    client = bigquery.Client(project=BQ_PROJECT)
    EVENTS_DIR.mkdir(parents=True, exist_ok=True)

    int_tids = sorted({int(t) for t in tids})
    events_by_tid = query_events_batch(client, int_tids)

    written = 0
    skipped = 0
    index: list[dict] = []

    for tid in tids:
        evt = events_by_tid.get(str(tid))
        if not evt:
            skipped += 1
            continue
        if args.gender and evt.get("gender") != ("m" if args.gender == "men" else "w"):
            skipped += 1
            continue

        year = evt["season_year"] or "unknown"
        slug = slugify(evt["tournament"])
        out_name = f"{year}-{slug}.json"
        out_path = EVENTS_DIR / out_name
        if out_path.exists():
            existing = json.loads(out_path.read_text())
            if str(existing.get("tournament_id")) != str(tid):
                out_name = f"{year}-{slug}-{tid}.json"
                out_path = EVENTS_DIR / out_name
        out_path.write_text(json.dumps(evt, indent=2, default=str))
        written += 1
        index.append(
            {
                "file": out_name,
                "tournament_id": evt["tournament_id"],
                "tournament": evt["tournament"],
                "course": evt["course"],
                "start_date": evt["start_date"],
                "season_year": evt["season_year"],
                "gender": evt["gender"],
                "competitor_count": evt["competitor_count"],
                "team_count": evt["team_count"],
            }
        )

    # Merge with any existing index — keep entries from prior runs.
    index_path = EVENTS_DIR / "index.json"
    existing_index: list[dict] = []
    if index_path.exists():
        try:
            existing_index = json.loads(index_path.read_text())
        except Exception:
            existing_index = []
    by_id = {e["tournament_id"]: e for e in existing_index}
    for e in index:
        by_id[e["tournament_id"]] = e
    merged = sorted(by_id.values(), key=lambda e: (e.get("start_date") or "", e["tournament"]))
    index_path.write_text(json.dumps(merged, indent=2, default=str))

    print(f"Wrote {written} event JSON files into {EVENTS_DIR}")
    print(f"Skipped {skipped} (no rows or gender filter mismatch)")
    print(f"Index now has {len(merged)} total events")


if __name__ == "__main__":
    main()
