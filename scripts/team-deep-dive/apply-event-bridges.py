#!/usr/bin/env python
"""apply-event-bridges.py — for each entry in event-bridges.json, apply
the bridge to every school it implies:

  (a) For schools already seeded (have a manifest in jobs/), append the
      event to data/team-deep-dive/expected-schedule-<slug>.json with
      source='bridge:<original_team>'. This means when validate-coverage.py
      next runs for that school, it'll see the additional event.

  (b) For schools NOT seeded yet but seen in N+ bridge events
      (--auto-seed-threshold, default 3), auto-create a stub job manifest
      in data/team-deep-dive/jobs/ — the dispatcher picks them up next
      cycle.

This is the compounding mechanic: every leaderboard we ingest expands
the universe of teams we have ground truth on.

Usage:
    ~/venv/bin/python scripts/team-deep-dive/apply-event-bridges.py
    ~/venv/bin/python scripts/team-deep-dive/apply-event-bridges.py --auto-seed-threshold 5 --dry-run
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
TEAM_DD_DIR = REPO_ROOT / "data" / "team-deep-dive"
BRIDGES_PATH = TEAM_DD_DIR / "event-bridges.json"
JOBS_DIR = TEAM_DD_DIR / "jobs"

# Reuse the alias map for school-name → slug resolution.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import importlib.util

_spec = importlib.util.spec_from_file_location(
    "roster_from_bq", Path(__file__).resolve().parent / "roster-from-bq.py"
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)  # type: ignore
SCHOOL_ALIASES = _mod.SCHOOL_ALIASES  # slug → list[str] aliases


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("--auto-seed-threshold", type=int, default=3, help="Auto-queue unknown schools seen in this many bridges")
    ap.add_argument("--dry-run", action="store_true")
    return ap.parse_args()


# Build a reverse lookup: lowercase school name → slug.
def build_alias_lookup() -> dict[str, str]:
    out: dict[str, str] = {}
    for slug, aliases in SCHOOL_ALIASES.items():
        for a in aliases:
            out[a.strip().lower()] = slug
        # Also add the slug itself (kebab → space) as an alias.
        out[slug.replace("-", " ").lower()] = slug
    return out


def normalize(s: str) -> str:
    s = (s or "").lower()
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def school_to_slug(school_name: str, lookup: dict[str, str]) -> str | None:
    norm = normalize(school_name)
    if not norm:
        return None
    if norm in lookup:
        return lookup[norm]
    # Try without common prefixes.
    norm2 = re.sub(r"^(university of|the )\b\s*", "", norm)
    if norm2 in lookup:
        return lookup[norm2]
    return None


def existing_jobs() -> set[str]:
    return {f.name.split("-men-")[0].split("-women-")[0] for f in JOBS_DIR.glob("*.json") if "-men-" in f.name or "-women-" in f.name}


def load_existing_schedule(slug: str) -> list[dict]:
    p = TEAM_DD_DIR / f"expected-schedule-{slug}.json"
    if not p.exists():
        return []
    try:
        return json.loads(p.read_text())
    except Exception:
        return []


def write_schedule(slug: str, events: list[dict]) -> None:
    p = TEAM_DD_DIR / f"expected-schedule-{slug}.json"
    p.write_text(json.dumps(events, indent=2))


def already_in_schedule(events: list[dict], year: int, name: str) -> bool:
    n_norm = normalize(name)
    for e in events:
        if e.get("academic_year") == year:
            if normalize(e.get("tournament_name", "")) == n_norm:
                return True
            # Loose token-overlap (catches name variations).
            tokens_a = set(n_norm.split())
            tokens_b = set(normalize(e.get("tournament_name", "")).split())
            if tokens_a and tokens_b and len(tokens_a & tokens_b) / max(len(tokens_a), len(tokens_b)) >= 0.7:
                return True
    return False


def main() -> None:
    args = parse_args()
    if not BRIDGES_PATH.exists():
        print("[apply] no event-bridges.json yet — run extract-event-bridges.py first")
        sys.exit(0)
    bridges = json.loads(BRIDGES_PATH.read_text())
    if not bridges:
        print("[apply] event-bridges.json is empty")
        return

    alias_lookup = build_alias_lookup()
    seeded_slugs = existing_jobs()
    unseeded_school_counter: dict[str, int] = {}
    schedule_appends: dict[str, list[dict]] = {}  # slug → list of events to append
    bridges_resolving = 0

    for b in bridges:
        year = b.get("year")
        name = b.get("tournament_name") or ""
        schools = b.get("schools_present") or []
        if not year or not name or not schools:
            continue
        bridges_resolving += 1
        for sch in schools:
            slug = school_to_slug(sch, alias_lookup)
            if slug:
                if slug in seeded_slugs:
                    schedule_appends.setdefault(slug, []).append({
                        "academic_year": year,
                        "tournament_name": name,
                        "date_text": None,
                        "location": b.get("course") or b.get("host_school"),
                        "finish_text": None,
                        "recap_url": None,
                        "raw_card_text": "",
                        "source_url": "bridge",
                        "source_kind": "event_bridge",
                        "bridge_origin_team": b.get("extracted_from_team"),
                        "bridge_origin_url": b.get("source_url"),
                    })
                else:
                    unseeded_school_counter[slug] = unseeded_school_counter.get(slug, 0) + 1
            else:
                # Unmappable school name — still count it for visibility.
                key = f"__unknown__/{normalize(sch)}"
                unseeded_school_counter[key] = unseeded_school_counter.get(key, 0) + 1

    print(f"[apply] bridges processed: {bridges_resolving}")
    print(f"[apply] schedule appends queued: {sum(len(v) for v in schedule_appends.values())} events across {len(schedule_appends)} seeded teams")
    print(f"[apply] unseeded-school appearances: {len(unseeded_school_counter)} distinct (top 15):")
    for slug, n in sorted(unseeded_school_counter.items(), key=lambda x: -x[1])[:15]:
        print(f"  {n:>3}  {slug}")

    if args.dry_run:
        print("[apply] --dry-run set; no writes")
        return

    # (a) Append to expected-schedule for seeded teams.
    appended_total = 0
    for slug, new_events in schedule_appends.items():
        existing = load_existing_schedule(slug)
        before = len(existing)
        for ev in new_events:
            if already_in_schedule(existing, ev["academic_year"], ev["tournament_name"]):
                continue
            existing.append(ev)
            appended_total += 1
        if len(existing) != before:
            write_schedule(slug, existing)
            print(f"[apply] {slug}: +{len(existing)-before} bridge events to expected-schedule")
    print(f"[apply] appended {appended_total} bridge events into seeded schedules")

    # (b) Auto-queue unseeded schools that crossed the threshold.
    auto_queued = 0
    for slug, n in unseeded_school_counter.items():
        if slug.startswith("__unknown__/"):
            continue  # name didn't resolve — log but don't queue
        if n < args.auto_seed_threshold:
            continue
        manifest_path = JOBS_DIR / f"{slug}-men-bridge-{datetime.now().strftime('%Y-%m-%d')}.json"
        if manifest_path.exists():
            continue
        manifest_path.write_text(json.dumps(
            {
                "job_id": manifest_path.stem,
                "school_slug": slug,
                "gender": "men",
                "status": "pending",
                "phases_complete": [],
                "current_phase": None,
                "started_at": None,
                "updated_at": datetime.now().isoformat(timespec="seconds") + "Z",
                "auto_seeded_via_bridges": True,
                "bridge_count": n,
            },
            indent=2,
        ))
        auto_queued += 1
        print(f"[apply] auto-seeded {slug} (saw in {n} bridges) → {manifest_path.name}")
    print(f"\n[apply] auto-seeded {auto_queued} new teams from bridges")


if __name__ == "__main__":
    main()
