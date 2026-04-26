#!/usr/bin/env python
"""extract-event-bridges.py — turn leaderboard PDFs (and rich news articles)
into cross-team event bridges.

Each bridge is one event: tournament_name + year + course + every school
present + individual top finishers. Once we have a bridge for an event,
ALL schools in it have ground-truth attendance — even if their own
schedule scrape didn't surface that event.

This is the compounding mechanic Mikkel asked about: school X's recap PDF
gives us the leaderboard, which contains team Y, which retroactively fills
team Y's coverage even before team Y is processed.

Source priority (highest → lowest):
  1. leaderboard_pdf evidence (raw_text from pdftotext is mostly tabular)
  2. school_news evidence with extensive raw_text
  3. wayback evidence

Output: data/team-deep-dive/event-bridges.json — flat array. One entry per
unique (year, normalized_tournament_name) tuple. Re-running merges into
the existing file (deduped by key).

Usage:
    ~/venv/bin/python scripts/team-deep-dive/extract-event-bridges.py texas-tech men
    ~/venv/bin/python scripts/team-deep-dive/extract-event-bridges.py texas-tech men --max-batches 10

Reads evidence from a single team's folder per invocation, but writes to
the global event-bridges.json (so every team's run feeds the shared map).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.claude_cli import ClaudeCLI  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
EVIDENCE_ROOT = REPO_ROOT / "data" / "team-deep-dive" / "evidence"
BRIDGES_PATH = REPO_ROOT / "data" / "team-deep-dive" / "event-bridges.json"


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("gender", choices=["men", "women", "m", "w"])
    ap.add_argument("--batch-size", type=int, default=8, help="Evidence files per LLM call")
    ap.add_argument("--max-batches", type=int, default=None)
    ap.add_argument("--max-chars-per-doc", type=int, default=6000)
    return ap.parse_args()


def load_evidence(slug: str) -> list[dict]:
    folder = EVIDENCE_ROOT / slug
    if not folder.exists():
        return []
    out = []
    for f in sorted(folder.glob("*.json")):
        try:
            d = json.loads(f.read_text())
            d["__file__"] = f.name
            out.append(d)
        except Exception:
            continue
    return out


def select_bridge_candidates(evidence: list[dict]) -> list[dict]:
    """Prioritize leaderboard PDFs + recap-style articles. Skip thin SERP
    snippets and ranking pages."""
    out = []
    for e in evidence:
        src = e.get("source") or ""
        text = e.get("raw_text") or ""
        if src == "leaderboard_pdf":
            out.append(e)
        elif src == "school_news" and len(text) >= 800:
            # School news with substantial body — likely a recap with
            # tournament context.
            out.append(e)
        elif src == "wayback" and len(text) >= 800 and "leaderboard" in text.lower():
            out.append(e)
    return out


def normalize_tournament_key(name: str, year: int) -> str:
    s = (name or "").lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = re.sub(
        r"\b(the|men|men's|invitational|championship|cup|classic|tournament|intercollegiate|collegiate|presented by|hosted by)\b",
        " ",
        s,
    )
    s = re.sub(r"\s+", " ", s).strip()
    return f"{year}|{s}"


def build_bridge_prompt(slug: str, gender: str, batch: list[dict], max_chars: int) -> str:
    parts = [
        f"You are extracting *event bridges* from college golf tournament evidence. The active program is `{slug}` (gender: {gender}), but every event you find may also list OTHER schools — your job is to capture the FULL roster of schools present.",
        "",
        "For each event you can identify, output a JSON object with:",
        "  - tournament_name: official name as given (e.g. 'Carmel Cup', 'Big 12 Championship')",
        "  - year: integer (academic year — fall events use the year that the season ends, e.g. fall 2014 → 2015)",
        "  - course: optional",
        "  - host_school: optional",
        "  - source_url: the URL the evidence came from",
        "  - schools_present: array of every school name that played in this event (full list — not just the active program)",
        "  - team_finishes: optional array of {school, position} when the document gives a team leaderboard",
        "  - individual_top_finishers: optional array of {player, school, position, score} for the top 5+ individuals",
        "  - confidence: 0.0-1.0 — how sure you are this is a real event (not a preview/speculation)",
        "",
        "RULES:",
        "  - Only emit an event if you can identify the tournament name and at least 2 schools present.",
        "  - Skip season-preview puff pieces, recruiting announcements, schedule pages without scores.",
        "  - When a leaderboard PDF lists 14 teams, schools_present must have all 14.",
        "  - Output ONE JSON ARRAY containing every event across the batch. Strict JSON.",
        "",
        f"Below are {len(batch)} evidence documents.",
        "",
    ]
    for i, ev in enumerate(batch, 1):
        url = ev.get("url", "")
        source = ev.get("source", "")
        title = ev.get("title") or ""
        published = ev.get("published_at") or ""
        text = (ev.get("raw_text") or "")[:max_chars]
        parts.append(f"=== DOC {i} ===")
        parts.append(f"source_url: {url}")
        parts.append(f"source_kind: {source}")
        if title:
            parts.append(f"title: {title}")
        if published:
            parts.append(f"published_at: {published}")
        parts.append("text:")
        parts.append(text)
        parts.append("")
    parts.append("=== END BATCH ===")
    parts.append("")
    parts.append("Return ONLY the JSON array now.")
    return "\n".join(parts)


def merge_bridges(new: list[dict]) -> dict:
    """Read-merge-write event-bridges.json under an exclusive fcntl flock.

    The lock makes this safe under N concurrent dispatcher workers — each
    process's per-batch merge waits its turn instead of racing
    read-modify-write. Both load AND write happen inside the lock, so the
    file is always consistent. Returns the merge summary; the caller does
    not write the file itself.
    """
    import fcntl
    lock_path = BRIDGES_PATH.with_suffix(".json.lock")
    BRIDGES_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(lock_path, "w") as lockf:
        fcntl.flock(lockf, fcntl.LOCK_EX)
        existing: list[dict] = []
        if BRIDGES_PATH.exists():
            try:
                existing = json.loads(BRIDGES_PATH.read_text())
            except Exception:
                existing = []
        by_key: dict[str, dict] = {}
        for b in existing:
            key = normalize_tournament_key(b.get("tournament_name", ""), b.get("year", 0))
            by_key[key] = b
        added = 0
        enriched = 0
        for b in new:
            if not b.get("tournament_name") or not b.get("year"):
                continue
            if not isinstance(b.get("year"), int):
                continue
            if not isinstance(b.get("schools_present"), list) or len(b["schools_present"]) < 2:
                continue
            key = normalize_tournament_key(b["tournament_name"], b["year"])
            prior = by_key.get(key)
            if not prior:
                by_key[key] = b
                added += 1
                continue
            # Merge: union schools_present; prefer richer team_finishes /
            # individual_top_finishers.
            merged = dict(prior)
            merged_schools = sorted(set(prior.get("schools_present", []) + b["schools_present"]))
            merged["schools_present"] = merged_schools
            if len(b.get("team_finishes") or []) > len(prior.get("team_finishes") or []):
                merged["team_finishes"] = b["team_finishes"]
            if len(b.get("individual_top_finishers") or []) > len(prior.get("individual_top_finishers") or []):
                merged["individual_top_finishers"] = b["individual_top_finishers"]
            if not prior.get("course") and b.get("course"):
                merged["course"] = b["course"]
            if not prior.get("host_school") and b.get("host_school"):
                merged["host_school"] = b["host_school"]
            merged["sources"] = sorted(set((prior.get("sources") or [prior.get("source_url")]) + [b.get("source_url")]))
            by_key[key] = merged
            enriched += 1
        sorted_out = sorted(by_key.values(), key=lambda x: (x.get("year", 0), x.get("tournament_name", "")))
        # Atomic write: tmp file + rename so a SIGKILL mid-write doesn't
        # corrupt the registry.
        tmp_path = BRIDGES_PATH.with_suffix(".json.tmp")
        tmp_path.write_text(json.dumps(sorted_out, indent=2))
        tmp_path.replace(BRIDGES_PATH)
    return {"all": sorted_out, "added": added, "enriched": enriched}


def main() -> None:
    args = parse_args()
    evidence = load_evidence(args.slug)
    if not evidence:
        print(f"[bridges] no evidence for {args.slug}; skipping")
        return
    candidates = select_bridge_candidates(evidence)
    print(f"[bridges] {args.slug}: {len(candidates)}/{len(evidence)} evidence files are bridge candidates")
    if not candidates:
        return

    # Per-team checkpoint file — tracks which evidence files have been
    # processed already so a SIGKILL'd or timeout-killed run can resume
    # cleanly from the next batch.
    ckpt_path = BRIDGES_PATH.parent / f"bridges-checkpoint-{args.slug}.json"
    processed_urls: set[str] = set()
    if ckpt_path.exists():
        try:
            processed_urls = set(json.loads(ckpt_path.read_text()).get("processed_urls", []))
            print(f"[bridges] resume: {len(processed_urls)} URLs already processed in prior run")
        except Exception:
            processed_urls = set()

    # Filter out already-processed candidates.
    candidates = [c for c in candidates if c.get("url") not in processed_urls]
    print(f"[bridges] {len(candidates)} candidates remain after resume filter")
    if not candidates:
        return

    cli = ClaudeCLI(timeout_seconds=900)
    n_batches = (len(candidates) + args.batch_size - 1) // args.batch_size
    if args.max_batches:
        n_batches = min(n_batches, args.max_batches)

    cumulative = 0
    for batch_i in range(n_batches):
        batch = candidates[batch_i * args.batch_size : (batch_i + 1) * args.batch_size]
        prompt = build_bridge_prompt(args.slug, args.gender, batch, args.max_chars_per_doc)
        print(f"[bridges] batch {batch_i+1}/{n_batches} ({len(batch)} docs, {len(prompt):,} chars)")
        try:
            res = cli.extract_json(prompt)
        except Exception as e:
            print(f"[bridges]   batch failed: {e}", file=sys.stderr)
            # Mark these URLs processed anyway so we don't infinite-loop on a
            # consistently-failing batch.
            for ev in batch:
                if ev.get("url"):
                    processed_urls.add(ev["url"])
            ckpt_path.write_text(json.dumps({"processed_urls": sorted(processed_urls)}, indent=2))
            continue
        if not isinstance(res, list):
            print(f"[bridges]   unexpected response type {type(res).__name__}", file=sys.stderr)
            for ev in batch:
                if ev.get("url"):
                    processed_urls.add(ev["url"])
            ckpt_path.write_text(json.dumps({"processed_urls": sorted(processed_urls)}, indent=2))
            continue
        # Stamp + persist this batch's bridges immediately.
        now = datetime.now().isoformat(timespec="seconds") + "Z"
        for b in res:
            b["extracted_from_team"] = args.slug
            b["extracted_at"] = now
        # merge_bridges does its own locked read-merge-write atomically.
        merge_summary = merge_bridges(res)
        cumulative += len(res)
        for ev in batch:
            if ev.get("url"):
                processed_urls.add(ev["url"])
        ckpt_path.write_text(json.dumps({"processed_urls": sorted(processed_urls)}, indent=2))
        print(
            f"[bridges]   batch yielded {len(res)} bridges (registry now {len(merge_summary['all'])}, "
            f"+{merge_summary['added']} new, +{merge_summary['enriched']} enriched)"
        )

    print(f"\n[bridges] done — extracted {cumulative} new bridge entries this run")


if __name__ == "__main__":
    main()
