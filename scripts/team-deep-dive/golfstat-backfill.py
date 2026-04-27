#!/usr/bin/env python
"""golfstat-backfill.py — for each gap in coverage-gaps-<slug>.json,
locate the GolfStat tournament_id and queue it into the existing
mikkel-system GolfStat scraper.

GolfStat's archive lives at:
    https://results.golfstat.com/public/leaderboards/archived.cfm
and per-tournament leaderboards at:
    https://results.golfstat.com/public/leaderboards/gs_leaderboard.cfm?tid=<TID>

Strategy:
  1. Read coverage-gaps-<slug>.json — keep only gap_severity=missing or
     partial (i.e. NOT already in granular_master with full coverage).
  2. For each missing event, search GolfStat archive for matching
     tournament name + year. Use Claude CLI to disambiguate when search
     yields multiple results.
  3. For each resolved TID:
       - Add to a queue file: data/team-deep-dive/golfstat-backfill-queue-<slug>.txt
       - Optionally invoke mikkel-system's
         golfstat_scoring.py against that TID directly.
  4. Re-run roster-from-bq + careers-from-bq + build-record-book to pick
     up newly-backfilled granular_master rows.

Output:
  data/team-deep-dive/golfstat-backfill-log-<slug>.json — per gap:
    {year, tournament, resolved_tid?, scraper_invoked: bool, returncode?}

This phase respects the existing rate limits in the GolfStat scraper.

Usage:
    ~/venv/bin/python scripts/team-deep-dive/golfstat-backfill.py texas-tech men
    ~/venv/bin/python scripts/team-deep-dive/golfstat-backfill.py texas-tech men --resolve-only   # find TIDs, don't scrape
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.http_cache import HttpCache  # noqa: E402
from lib.claude_cli import ClaudeCLI  # noqa: E402

OUT_DIR = REPO_ROOT / "data" / "team-deep-dive"
ARCHIVE_BASE = "https://results.golfstat.com/public/leaderboards/archived.cfm"


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("gender", choices=["men", "women", "m", "w"])
    ap.add_argument("--resolve-only", action="store_true", help="Find TIDs, but do NOT invoke the scraper")
    ap.add_argument("--max", type=int, default=None, help="Cap how many gaps we process this run")
    return ap.parse_args()


def fetch_archive_index(http: HttpCache, year: int) -> str | None:
    """GolfStat's archive index per academic year. URL pattern observed:
    https://results.golfstat.com/public/leaderboards/archived.cfm?yr=<YEAR>"""
    url = f"{ARCHIVE_BASE}?yr={year}"
    status, html, _ = http.get(url)
    if status != 200 or not html:
        return None
    return html


def extract_tids(html: str) -> list[dict]:
    """From the archive index HTML, pull every (tid, tournament_name, dates)
    row."""
    out = []
    # Each row typically has a link like
    #   <a href="...?tid=12345">Tournament Name</a>
    for m in re.finditer(r'href="[^"]*tid=(\d+)[^"]*"[^>]*>([^<]+)</a>', html):
        tid = int(m.group(1))
        name = re.sub(r"\s+", " ", m.group(2)).strip()
        if name and len(name) > 3:
            out.append({"tid": tid, "tournament": name})
    return out


def resolve_tid_with_llm(cli: ClaudeCLI, gap: dict, candidates: list[dict]) -> int | None:
    """When archive search returns multiple matches, ask Opus to pick the
    right TID."""
    prompt = f"""Match the gap event to one of the GolfStat tournament records.

GAP EVENT:
  year: {gap['year']}
  tournament_name: {gap['tournament_name']}

CANDIDATES (each has tid + tournament name):
{json.dumps(candidates, indent=2)}

Return ONLY a JSON object:
  {{"tid": <int or null>, "confidence": <0..1>, "reason": "..."}}

If none of the candidates clearly match the gap event (within reasonable
naming variance / typos), return tid=null."""
    try:
        out = cli.extract_json(prompt)
    except Exception as e:
        print(f"[backfill]   llm resolve failed: {e}", file=sys.stderr)
        return None
    if isinstance(out, dict) and out.get("tid"):
        return int(out["tid"])
    return None


def main() -> None:
    args = parse_args()
    gaps_path = OUT_DIR / f"coverage-gaps-{args.slug}.json"
    if not gaps_path.exists():
        # No coverage-gaps file means coverage_validation either skipped
        # (no expected-schedule for this slug) or hasn't run yet. Either
        # way there's nothing to backfill — exit clean.
        print(f"[backfill] no coverage-gaps file for {args.slug}; skipping golfstat_backfill")
        sys.exit(0)
    gaps = json.loads(gaps_path.read_text())
    missing = [g for g in gaps if g["gap_severity"] in ("missing", "partial")]
    if args.max:
        missing = missing[: args.max]
    if not missing:
        print(f"[backfill] no gaps to backfill for {args.slug}")
        (OUT_DIR / f"golfstat-backfill-log-{args.slug}.json").write_text(json.dumps([], indent=2))
        return

    http = HttpCache(rate_limit_seconds=2.5, respect_robots=False)
    cli = ClaudeCLI(timeout_seconds=300)
    archive_cache: dict[int, list[dict]] = {}
    log: list[dict] = []
    queue_lines: list[str] = []

    for i, gap in enumerate(missing, 1):
        year = gap["year"]
        if year not in archive_cache:
            html = fetch_archive_index(http, year)
            archive_cache[year] = extract_tids(html or "")
            print(f"[backfill] {year} archive index: {len(archive_cache[year])} tournaments")
        candidates = archive_cache[year]
        # Token-overlap shortlist
        gap_tokens = set(re.sub(r"[^a-z0-9 ]", " ", gap["tournament_name"].lower()).split())
        scored = []
        for c in candidates:
            c_tokens = set(re.sub(r"[^a-z0-9 ]", " ", c["tournament"].lower()).split())
            if not c_tokens:
                continue
            score = len(gap_tokens & c_tokens) / max(len(gap_tokens), len(c_tokens))
            scored.append((score, c))
        scored.sort(reverse=True)
        top = [c for s, c in scored[:5] if s >= 0.2]
        rec = {
            "year": year,
            "tournament_name": gap["tournament_name"],
            "candidates_considered": len(top),
            "resolved_tid": None,
            "scraper_invoked": False,
            "scraper_returncode": None,
        }
        if top:
            if len(top) == 1 and scored[0][0] >= 0.6:
                rec["resolved_tid"] = top[0]["tid"]
            else:
                rec["resolved_tid"] = resolve_tid_with_llm(cli, gap, top)
        log.append(rec)
        if rec["resolved_tid"]:
            queue_lines.append(f"{rec['resolved_tid']}\t{gap['tournament_name']}\t{year}")
            print(f"[backfill] {i}/{len(missing)} resolved: {gap['tournament_name']} ({year}) → tid={rec['resolved_tid']}")
        else:
            print(f"[backfill] {i}/{len(missing)} unresolved: {gap['tournament_name']} ({year})")

    log_path = OUT_DIR / f"golfstat-backfill-log-{args.slug}.json"
    log_path.write_text(json.dumps(log, indent=2))
    queue_path = OUT_DIR / f"golfstat-backfill-queue-{args.slug}.tsv"
    queue_path.write_text("\n".join(queue_lines))
    print(f"\n[backfill] resolved {sum(1 for l in log if l['resolved_tid'])} of {len(missing)} gaps")
    print(f"[backfill] queue → {queue_path}")
    print(f"[backfill] log → {log_path}")
    if args.resolve_only:
        print("[backfill] --resolve-only set; not invoking the GolfStat scraper.")
        print(
            "[backfill] To run the scraper against the queued TIDs:\n"
            f"  cd ~/projects/mikkel-system/tools/tournament-scraper\n"
            f"  while IFS=$'\\t' read tid name yr; do\n"
            f"    ~/venv/bin/python golfstat_scoring.py --tid \"$tid\"\n"
            f"  done < {queue_path}"
        )


if __name__ == "__main__":
    main()
