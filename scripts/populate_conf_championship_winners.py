"""Phase 2: populate winner / runnerUp / finalScore for past-season legs.

Reads ``src/data/conference-championship-history.json`` and fills in the
per-leg ``winner`` field (and, for match-play legs, ``runnerUp`` plus
``finalScore``) by scraping each tournament's Clippd Scoreboard pages with
Playwright.

Order of operations follows David's directive:
  1. Stroke-play legs first (one Playwright nav per tournament).
  2. Match-play legs second (two navs per tournament: /scoring/team for
     winner+runnerUp, /scoring/round for the final dual score).

The script reuses a single Chromium browser context across every
tournament for throughput — Playwright cold-start dominates per-tournament
runtime otherwise. Between requests we sleep ``--delay`` seconds (default
1.0) to be polite to Clippd; bot-detection has not been a problem when
we use a real Chrome UA, but rate-limiting is cheap insurance.

Idempotent: legs that already carry winner data (Phase 1 attached
current-season winners from ``championships-{men,women}-2026.ts``) are
skipped unless ``--force`` is passed. After every N successful legs we
flush the JSON to disk so an interruption doesn't lose progress.

Usage:
  python3 scripts/populate_conf_championship_winners.py            # all 2024+2025
  python3 scripts/populate_conf_championship_winners.py --season 2024
  python3 scripts/populate_conf_championship_winners.py --gender men
  python3 scripts/populate_conf_championship_winners.py --conference SEC
  python3 scripts/populate_conf_championship_winners.py --dry-run   # log only
  python3 scripts/populate_conf_championship_winners.py --force     # re-extract
  python3 scripts/populate_conf_championship_winners.py --limit 5   # smoke test
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any, Optional

# Make sibling extractors importable when running from the repo root.
HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from clippd_match_extractor import extract_match_play_final  # noqa: E402
from clippd_winner_extractor import extract_winner_from_clippd  # noqa: E402

JSON_PATH = HERE.parent / "src" / "data" / "conference-championship-history.json"

# Throughput knob — flush JSON to disk every N legs so a Ctrl-C or 503
# doesn't lose 100 extractions of progress. The actual disk write is cheap
# (~5kB) so this is essentially free.
FLUSH_EVERY = 10

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)


def log(*args: Any) -> None:
    ts = time.strftime("%H:%M:%S")
    print(f"[populate {ts}]", *args, file=sys.stderr, flush=True)


def load() -> dict[str, Any]:
    with JSON_PATH.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def save(data: dict[str, Any]) -> None:
    """Atomic-ish write: dump to a sibling temp file, then rename."""
    tmp = JSON_PATH.with_suffix(".json.tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    tmp.replace(JSON_PATH)


def iter_targets(rows: list[dict[str, Any]], args: argparse.Namespace):
    """Yield (row, leg, fmt) tuples for every leg the caller wants to process.

    ``fmt`` is "stroke" or "match"; rows are filtered by --season/--gender/
    --conference flags. The ordering returned is **stroke-play first across
    all matched rows, then match-play across all matched rows** — that's
    what David asked for.
    """
    def matches(row: dict[str, Any]) -> bool:
        if args.season is not None and row.get("season") != args.season:
            return False
        if args.gender is not None and row.get("gender") != args.gender:
            return False
        if args.conference is not None and row.get("conference") != args.conference:
            return False
        # By default skip 2026 entirely — those came from championships-2026.ts
        # in Phase 1 and don't need re-extraction. Override with --include-2026.
        if not args.include_2026 and row.get("season") == 2026:
            return False
        return True

    matched = [r for r in rows if matches(r)]
    log(f"matched rows: {len(matched)} (after season/gender/conference filters)")

    # Pass 1: stroke-play
    if not args.match_only:
        for row in matched:
            leg = row.get("strokeplay")
            if not leg:
                continue
            if not args.force and leg.get("winner"):
                continue
            yield row, leg, "stroke"

    # Pass 2: match-play
    if not args.stroke_only:
        for row in matched:
            leg = row.get("matchplay")
            if not leg:
                continue
            if not args.force and leg.get("winner") and leg.get("runnerUp") and leg.get("finalScore"):
                continue
            yield row, leg, "match"


def process_stroke(page, leg: dict[str, Any], timeout_ms: int) -> bool:
    """Fill leg['winner'] from the team page. Returns True iff we wrote a value."""
    tid = leg["tournamentId"]
    winner = extract_winner_from_clippd(tid, timeout_ms=timeout_ms, page=page)
    if winner:
        leg["winner"] = winner
        return True
    return False


def process_match(page, leg: dict[str, Any], timeout_ms: int) -> bool:
    """Fill leg['winner'/'runnerUp'/'finalScore']. Returns True iff anything changed."""
    tid = leg["tournamentId"]
    detail = extract_match_play_final(tid, timeout_ms=timeout_ms, page=page)
    changed = False
    if detail.get("winner"):
        leg["winner"] = detail["winner"]
        changed = True
    if detail.get("runnerUp"):
        leg["runnerUp"] = detail["runnerUp"]
        changed = True
    if detail.get("finalScore"):
        leg["finalScore"] = detail["finalScore"]
        changed = True
    return changed


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    p.add_argument("--season", type=int, choices=[2024, 2025, 2026])
    p.add_argument("--gender", choices=["men", "women"])
    p.add_argument("--conference",
                   help="Canonical conference code (e.g. SEC, ACC, B12).")
    p.add_argument("--limit", type=int,
                   help="Process at most N legs (smoke-test mode).")
    p.add_argument("--delay", type=float, default=1.0,
                   help="Seconds to sleep between tournaments (default 1.0).")
    p.add_argument("--timeout", type=int, default=45_000,
                   help="Per-page Playwright timeout in ms (default 45000).")
    p.add_argument("--include-2026", action="store_true",
                   help="Also re-extract 2026 legs (default skips them since "
                        "they were attached from championships-2026.ts).")
    p.add_argument("--force", action="store_true",
                   help="Re-extract even legs that already have winner data.")
    p.add_argument("--match-only", action="store_true",
                   help="Process only match-play legs (skip stroke).")
    p.add_argument("--stroke-only", action="store_true",
                   help="Process only stroke-play legs (skip match).")
    p.add_argument("--dry-run", action="store_true",
                   help="Log targets without launching Playwright.")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    data = load()
    rows = data.get("rows", [])

    targets = list(iter_targets(rows, args))
    if args.limit is not None:
        targets = targets[: args.limit]

    n_stroke = sum(1 for _, _, f in targets if f == "stroke")
    n_match = sum(1 for _, _, f in targets if f == "match")
    log(f"plan: {n_stroke} stroke + {n_match} match = {len(targets)} legs total")
    if not targets:
        log("nothing to do.")
        return 0

    if args.dry_run:
        for row, leg, fmt in targets:
            log(f"  DRY {fmt} {row['gender']} {row['season']} "
                f"{row['conference']} → {leg['tournamentId']} "
                f"({leg['name']!r})")
        return 0

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        log("ERROR: playwright not installed (`pip install playwright && playwright install chromium`)")
        return 2

    n_ok = 0
    n_fail: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(user_agent=USER_AGENT)
        page = ctx.new_page()

        try:
            for i, (row, leg, fmt) in enumerate(targets, start=1):
                tid = leg["tournamentId"]
                tag = f"{fmt} {row['gender']} {row['season']} {row['conference']} #{tid}"
                log(f"[{i}/{len(targets)}] {tag} — fetching...")
                t0 = time.time()
                try:
                    if fmt == "stroke":
                        ok = process_stroke(page, leg, args.timeout)
                    else:
                        ok = process_match(page, leg, args.timeout)
                except Exception as exc:
                    log(f"   ERR {tag}: {exc}")
                    n_fail.append(tag)
                    continue

                dt = time.time() - t0
                if ok:
                    n_ok += 1
                    detail = (
                        f"winner={leg.get('winner')!r}"
                        + (f", runnerUp={leg.get('runnerUp')!r}"
                           if fmt == "match" else "")
                        + (f", finalScore={leg.get('finalScore')!r}"
                           if fmt == "match" else "")
                    )
                    log(f"   OK ({dt:.1f}s) {detail}")
                else:
                    n_fail.append(tag)
                    log(f"   MISS ({dt:.1f}s) — extractor returned no data")

                if i % FLUSH_EVERY == 0:
                    save(data)
                    log(f"   …flushed JSON ({i}/{len(targets)} done)")

                if args.delay > 0 and i < len(targets):
                    time.sleep(args.delay)
        finally:
            browser.close()

    # Final flush regardless of success/failure
    save(data)

    log(f"done: ok={n_ok} miss={len(n_fail)} of {len(targets)} legs")
    if n_fail:
        log("misses:")
        for m in n_fail:
            log(f"  - {m}")
    return 0 if not n_fail else 1


if __name__ == "__main__":
    raise SystemExit(main())
