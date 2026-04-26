#!/usr/bin/env python
"""
datagolf-tracker.py — scaffold for post-college pro-tour tracking via the
DataGolf API.

Status: SCAFFOLDED, NOT WIRED. Requires a DataGolf "Scratch Plus"
subscription and an API key in the env var DATAGOLF_API_KEY.

What this will do once the key is set:
  1. Read player names from src/data/players/index.json (filtered by school + gender)
  2. For each name, query DataGolf for matching pro-player ID
  3. Pull career stats: PGA/KFT/LIV/DPWT starts, wins, FedExCup positions, majors record
  4. Emit data/team-deep-dive/datagolf-<slug>.json with
     {player_id, raw_name, datagolf_id?, pga_starts, pga_wins, kft_starts, ...}
  5. build-record-book.ts merges these into the notable_pros section

Until the key is set: prints a no-op message and writes an empty file.

API reference (Scratch+): https://datagolf.com/api-access

Usage (post-key):
    export DATAGOLF_API_KEY=...
    ~/venv/bin/python scripts/team-deep-dive/datagolf-tracker.py texas-tech men
    ~/venv/bin/python scripts/team-deep-dive/datagolf-tracker.py --all
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parents[2]
PLAYERS_INDEX = REPO_ROOT / "src" / "data" / "players" / "index.json"
OUT_DIR = REPO_ROOT / "data" / "team-deep-dive"

API_BASE = "https://feeds.datagolf.com"
RATE_LIMIT_SECONDS = 1.0


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug", nargs="?")
    ap.add_argument("gender", nargs="?", choices=["men", "women", "m", "w"])
    ap.add_argument("--all", action="store_true")
    return ap.parse_args()


def get_api_key() -> str | None:
    return os.environ.get("DATAGOLF_API_KEY")


def fetch_player_list(api_key: str) -> dict[str, dict]:
    """Return name → DataGolf player record. Cached on disk for reuse."""
    cache = OUT_DIR / "datagolf-players-cache.json"
    if cache.exists():
        return json.loads(cache.read_text())
    url = f"{API_BASE}/get-player-list?file_format=json&key={api_key}"
    print(f"[datagolf] GET player list ...", file=sys.stderr)
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    rows = r.json()
    by_name: dict[str, dict] = {}
    for p in rows:
        nm = p.get("player_name", "").strip()
        if nm:
            by_name[nm.lower()] = p
    cache.write_text(json.dumps(by_name, indent=2))
    time.sleep(RATE_LIMIT_SECONDS)
    return by_name


def fetch_player_stats(dg_id: int, api_key: str) -> dict:
    """Pull career stats for one DataGolf player_id. Schema varies by API
    plan; this is a stub returning an empty record."""
    # Real implementation: GET /preds/player/<id>/stats?key=...
    # Stub returns empty; downstream will treat as "no data".
    time.sleep(RATE_LIMIT_SECONDS)
    return {"datagolf_id": dg_id}


def schools_to_run(args: argparse.Namespace) -> list[tuple[str, str]]:
    if args.slug and args.gender:
        return [(args.slug, "m" if args.gender in ("men", "m") else "w")]
    if args.all and PLAYERS_INDEX.exists():
        idx = json.loads(PLAYERS_INDEX.read_text())
        return sorted({(e["school_slug"], e["gender"]) for e in idx})
    return []


def main() -> None:
    args = parse_args()
    api_key = get_api_key()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if not api_key:
        print(
            "DATAGOLF_API_KEY not set — writing empty stub files and exiting.\n"
            "Set the env var and re-run to populate notable_pros.",
            file=sys.stderr,
        )
        # Write a stub for each requested team so build-record-book.ts has
        # a known-empty shape rather than missing files.
        for slug, gender in schools_to_run(args):
            stub = {
                "school_slug": slug,
                "gender": gender,
                "scraped_at": datetime.now().isoformat(timespec="seconds") + "Z",
                "datagolf_status": "no_api_key",
                "players": [],
            }
            (OUT_DIR / f"datagolf-{slug}-{gender}.json").write_text(json.dumps(stub, indent=2))
        return

    by_name = fetch_player_list(api_key)
    print(f"[datagolf] loaded {len(by_name)} pro players from DataGolf")

    if not PLAYERS_INDEX.exists():
        print("No players index — run pipeline first")
        sys.exit(1)
    idx = json.loads(PLAYERS_INDEX.read_text())

    for slug, gender in schools_to_run(args):
        team_players = [e for e in idx if e["school_slug"] == slug and e["gender"] == gender]
        out_players = []
        matched = 0
        for p in team_players:
            dg = by_name.get(p["raw_name"].lower())
            if not dg:
                continue
            stats = fetch_player_stats(dg.get("dg_id"), api_key)
            out_players.append(
                {
                    "player_id": p["player_id"],
                    "raw_name": p["raw_name"],
                    "datagolf_record": dg,
                    "datagolf_stats": stats,
                }
            )
            matched += 1
        out = {
            "school_slug": slug,
            "gender": gender,
            "scraped_at": datetime.now().isoformat(timespec="seconds") + "Z",
            "datagolf_status": "ok",
            "players": out_players,
        }
        (OUT_DIR / f"datagolf-{slug}-{gender}.json").write_text(json.dumps(out, indent=2))
        print(f"[datagolf] {slug} {gender}: {matched}/{len(team_players)} matched on DataGolf")


if __name__ == "__main__":
    main()
