#!/usr/bin/env python
"""validate-coverage.py — diff expected schedule (from school athletics site)
against actual rows in granular_master + the leaderboard PDFs we've ingested.

Inputs:
  data/team-deep-dive/expected-schedule-<slug>.json
  granular-scoring.granular_scoring_dataset.granular_master (BQ)
  data/team-deep-dive/evidence/<slug>/*.json — leaderboard PDFs already pulled

Output:
  data/team-deep-dive/coverage-gaps-<slug>.json — per gap event:
    {
      year, tournament_name, expected_source, in_granular_master: bool,
      granular_master_tournament_id?, leaderboard_pdf_evidence: bool,
      leaderboard_pdf_url?, gap_severity: 'covered'|'partial'|'missing'
    }

Discord-pings the gap count + breakdown by year.

Usage:
    ~/venv/bin/python scripts/team-deep-dive/validate-coverage.py texas-tech men
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

OUT_DIR = REPO_ROOT / "data" / "team-deep-dive"
EVIDENCE_ROOT = OUT_DIR / "evidence"


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("gender", choices=["men", "women", "m", "w"])
    return ap.parse_args()


# Reuse alias map from roster-from-bq.py.
import importlib.util

_spec = importlib.util.spec_from_file_location(
    "roster_from_bq", Path(__file__).resolve().parent / "roster-from-bq.py"
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)  # type: ignore
SCHOOL_ALIASES = _mod.SCHOOL_ALIASES


def fetch_granular_events(client: bigquery.Client, aliases: list[str], gender: str) -> list[dict]:
    g = "men" if gender in ("m", "men") else "women"
    division_like = "%Men%" if g == "men" else "%Women%"
    sql = f"""
    SELECT
      tournament_id,
      ANY_VALUE(tournament) AS tournament,
      EXTRACT(YEAR FROM DATE_ADD(DATE '1899-12-30', INTERVAL MIN(SAFE_CAST(date AS INT64)) DAY)) AS year,
      MIN(DATE_ADD(DATE '1899-12-30', INTERVAL SAFE_CAST(date AS INT64) DAY)) AS first_date,
      ANY_VALUE(course) AS course,
      ANY_VALUE(source) AS source
    FROM `{BQ_PROJECT}.{BQ_DATASET}.granular_master`
    WHERE Team IN UNNEST(@aliases)
      AND division LIKE @division_like
      AND COALESCE(is_individual, FALSE) = FALSE
      AND SAFE_CAST(date AS INT64) > 0
    GROUP BY tournament_id
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ArrayQueryParameter("aliases", "STRING", aliases),
            bigquery.ScalarQueryParameter("division_like", "STRING", division_like),
        ],
        maximum_bytes_billed=5 * 1024**3,
    )
    rows = list(client.query(sql, job_config=job_config).result())
    return [
        {
            "tournament_id": r.tournament_id,
            "tournament": r.tournament,
            "year": r.year,
            "first_date": r.first_date.isoformat() if r.first_date else None,
            "course": r.course,
            "source": r.source,
        }
        for r in rows
    ]


def normalize_tournament(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    # Drop common boilerplate that varies between source labels.
    s = re.sub(r"\b(the|men|men's|invitational|championship|cup|classic|tournament|intercollegiate|collegiate|presented by|hosted by)\b", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def find_match(expected_event: dict, bq_events: list[dict]) -> dict | None:
    """Best-effort match: same year + normalized tournament name overlap."""
    expected_norm = normalize_tournament(expected_event["tournament_name"])
    expected_year = expected_event["academic_year"]
    candidates = [
        e
        for e in bq_events
        if e["year"] in (expected_year, expected_year + 1)  # fall events fall under prior calendar year
    ]
    best: tuple[float, dict | None] = (0.0, None)
    for c in candidates:
        c_norm = normalize_tournament(c["tournament"] or "")
        if not c_norm:
            continue
        # Token-overlap heuristic.
        ex_tokens = set(expected_norm.split())
        cn_tokens = set(c_norm.split())
        if not ex_tokens or not cn_tokens:
            continue
        score = len(ex_tokens & cn_tokens) / max(len(ex_tokens), len(cn_tokens))
        if score > best[0]:
            best = (score, c)
    return best[1] if best[0] >= 0.4 else None


def has_leaderboard_pdf(slug: str, expected_event: dict) -> tuple[bool, str | None]:
    """Check whether a PDF leaderboard for this event exists in our evidence
    corpus."""
    folder = EVIDENCE_ROOT / slug
    if not folder.exists():
        return False, None
    expected_norm = normalize_tournament(expected_event["tournament_name"])
    expected_year = expected_event["academic_year"]
    for f in folder.glob("*.json"):
        try:
            d = json.loads(f.read_text())
        except Exception:
            continue
        if d.get("source") != "leaderboard_pdf":
            continue
        # Heuristic match on filename + URL.
        url = d.get("url", "")
        title_norm = normalize_tournament(Path(url).stem)
        ex_tokens = set(expected_norm.split())
        title_tokens = set(title_norm.split())
        if ex_tokens and title_tokens and len(ex_tokens & title_tokens) / max(len(ex_tokens), len(title_tokens)) >= 0.3:
            # Year filter
            yr_in_url = re.search(r"(20\d{2})", url)
            if yr_in_url and abs(int(yr_in_url.group(1)) - expected_year) <= 1:
                return True, url
            if not yr_in_url:
                return True, url
    return False, None


def main() -> None:
    args = parse_args()
    aliases = SCHOOL_ALIASES.get(args.slug)
    if not aliases:
        aliases = [" ".join(w.capitalize() for w in args.slug.split("-"))]

    expected_path = OUT_DIR / f"expected-schedule-{args.slug}.json"
    if not expected_path.exists():
        print(f"[coverage] no expected-schedule for {args.slug}; run scrape-school-schedule.py first")
        sys.exit(1)
    expected = json.loads(expected_path.read_text())

    print(f"[coverage] {args.slug}: {len(expected)} expected events; querying granular_master ...")
    client = bigquery.Client(project=BQ_PROJECT)
    bq_events = fetch_granular_events(client, aliases, args.gender)
    print(f"[coverage] granular_master has {len(bq_events)} distinct events for this team")

    gaps: list[dict] = []
    by_year_status: dict[int, dict[str, int]] = {}
    for ev in expected:
        match = find_match(ev, bq_events)
        pdf_ok, pdf_url = has_leaderboard_pdf(args.slug, ev)
        if match:
            severity = "covered"
        elif pdf_ok:
            severity = "partial"
        else:
            severity = "missing"
        rec = {
            "year": ev["academic_year"],
            "tournament_name": ev["tournament_name"],
            "expected_source": ev.get("source_url"),
            "in_granular_master": bool(match),
            "granular_master_tournament_id": match["tournament_id"] if match else None,
            "leaderboard_pdf_evidence": pdf_ok,
            "leaderboard_pdf_url": pdf_url,
            "gap_severity": severity,
        }
        gaps.append(rec)
        by_year_status.setdefault(ev["academic_year"], {"covered": 0, "partial": 0, "missing": 0})
        by_year_status[ev["academic_year"]][severity] += 1

    out_path = OUT_DIR / f"coverage-gaps-{args.slug}.json"
    out_path.write_text(json.dumps(gaps, indent=2))
    total = len(gaps)
    covered = sum(1 for g in gaps if g["gap_severity"] == "covered")
    partial = sum(1 for g in gaps if g["gap_severity"] == "partial")
    missing = sum(1 for g in gaps if g["gap_severity"] == "missing")
    print(f"\n[coverage] {args.slug}: {covered}/{total} covered ({100*covered//max(total,1)}%), {partial} partial via PDF, {missing} fully missing")
    print("by year:")
    for yr in sorted(by_year_status):
        b = by_year_status[yr]
        print(f"  {yr}: covered={b['covered']:>2}  partial={b['partial']:>2}  missing={b['missing']:>2}")
    print(f"\nWrote {out_path}")


if __name__ == "__main__":
    main()
