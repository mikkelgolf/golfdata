#!/usr/bin/env python
"""extract-facts.py — Claude-Code-CLI fact extractor for the M2 evidence
corpus.

Reads every evidence file under data/team-deep-dive/evidence/<slug>/, batches
articles into prompts (~50 articles per call to fit within Claude's context
window comfortably), shells out to `claude --print --output-format json`, and
appends extracted facts to data/team-deep-dive/extracted-facts/<slug>.json.

Runs locally on the Mac Mini under Mikkel's Max plan = $0 additional cost.

Usage:
    ~/venv/bin/python scripts/team-deep-dive/extract-facts.py texas-tech men
    ~/venv/bin/python scripts/team-deep-dive/extract-facts.py texas-tech men --max-batches 5
    ~/venv/bin/python scripts/team-deep-dive/extract-facts.py texas-tech men --resume
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.claude_cli import ClaudeCLI  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
EVIDENCE_ROOT = REPO_ROOT / "data" / "team-deep-dive" / "evidence"
FACTS_ROOT = REPO_ROOT / "data" / "team-deep-dive" / "extracted-facts"

SCHOOL_DISPLAY: dict[str, str] = {
    "texas-tech": "Texas Tech Red Raiders men's golf",
    "oklahoma-state": "Oklahoma State Cowboys men's golf",
    "stanford": "Stanford Cardinal men's golf",
    "vanderbilt": "Vanderbilt Commodores men's golf",
    "auburn": "Auburn Tigers men's golf",
    "alabama": "Alabama Crimson Tide men's golf",
    "arkansas": "Arkansas Razorbacks men's golf",
    "georgia": "Georgia Bulldogs men's golf",
    "lsu": "LSU Tigers men's golf",
    "florida": "Florida Gators men's golf",
    "tennessee": "Tennessee Volunteers men's golf",
    "arizona-state": "Arizona State Sun Devils men's golf",
    "north-carolina": "North Carolina Tar Heels men's golf",
    "nc-state": "NC State Wolfpack men's golf",
    "duke": "Duke Blue Devils men's golf",
    "wake-forest": "Wake Forest Demon Deacons men's golf",
    "virginia": "Virginia Cavaliers men's golf",
    "clemson": "Clemson Tigers men's golf",
    "florida-state": "Florida State Seminoles men's golf",
    "ohio-state": "Ohio State Buckeyes men's golf",
    "michigan": "Michigan Wolverines men's golf",
    "purdue": "Purdue Boilermakers men's golf",
    "illinois": "Illinois Fighting Illini men's golf",
    "northwestern": "Northwestern Wildcats men's golf",
    "oklahoma": "Oklahoma Sooners men's golf",
    "tcu": "TCU Horned Frogs men's golf",
    "smu": "SMU Mustangs men's golf",
    "houston": "Houston Cougars men's golf",
    "baylor": "Baylor Bears men's golf",
    "texas": "Texas Longhorns men's golf",
    "brigham-young": "BYU Cougars men's golf",
    "pepperdine": "Pepperdine Waves men's golf",
}

FACT_TYPES = [
    "all_american",
    "conference_title",
    "ncaa_team_finish",
    "ncaa_individual_finish",
    "individual_tournament_win",
    "team_tournament_win",
    "coach_hire",
    "coach_fire",
    "hall_of_fame",
    "tour_win",
    "major_appearance",
    "individual_ranking",
    "team_ranking",
    "letterwinner_year",
    "walker_cup",
    "palmer_cup",
    "masters_appearance",
    "us_amateur_appearance",
    "transfer_in",
    "transfer_out",
    "signing",
]


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("gender", choices=["men", "women", "m", "w"])
    ap.add_argument("--batch-size", type=int, default=8, help="Articles per LLM call")
    ap.add_argument("--max-batches", type=int, default=None, help="Cap total batches")
    ap.add_argument("--resume", action="store_true", help="Skip articles already in extracted-facts")
    ap.add_argument("--max-chars-per-article", type=int, default=3000)
    return ap.parse_args()


def load_evidence(slug: str) -> list[dict]:
    """Load every evidence record for the slug."""
    folder = EVIDENCE_ROOT / slug
    if not folder.exists():
        return []
    out = []
    for f in sorted(folder.glob("*.json")):
        try:
            d = json.loads(f.read_text())
            d["__file__"] = str(f.name)
            out.append(d)
        except Exception:
            continue
    return out


def already_processed_urls(slug: str) -> set[str]:
    p = FACTS_ROOT / f"{slug}.json"
    if not p.exists():
        return set()
    try:
        existing = json.loads(p.read_text())
    except Exception:
        return set()
    return {f.get("source_url") for f in existing if f.get("source_url")}


def append_facts(slug: str, new_facts: list[dict]) -> None:
    FACTS_ROOT.mkdir(parents=True, exist_ok=True)
    p = FACTS_ROOT / f"{slug}.json"
    existing: list[dict] = []
    if p.exists():
        try:
            existing = json.loads(p.read_text())
        except Exception:
            existing = []
    existing.extend(new_facts)
    p.write_text(json.dumps(existing, indent=2))


def build_batch_prompt(slug: str, school_display: str, batch: list[dict], max_chars: int) -> str:
    """Build a single prompt for one batch of articles."""
    fact_types_str = ", ".join(FACT_TYPES)
    parts = [
        f"You are extracting structured facts from college golf articles for the program: **{school_display}** (slug: {slug}).",
        "",
        f"For each article in this batch, extract every verifiable fact about the program. Return ONE JSON array containing every fact across all articles. Each fact has:",
        "  - source_url: the article URL exactly as given",
        f"  - fact_type: one of [{fact_types_str}]",
        "  - player_name: optional, the player the fact concerns",
        "  - school: optional, usually the program in question",
        "  - year: optional, integer",
        "  - tournament: optional",
        "  - position: optional, e.g. '1', 'T5', 'cut'",
        "  - score: optional, integer (total strokes)",
        "  - tier: optional, e.g. 'first_team' for All-Americans",
        "  - supporting_quote: ≤ 80 chars from the article that backs the fact",
        "",
        "RULES:",
        "  - Only extract facts you can verify from the article text.",
        "  - Skip puff pieces / opinion / future-tense speculation.",
        "  - Player names: full name as it appears, no abbreviations.",
        "  - Output STRICT JSON. No prose. No markdown fences. Start with `[` end with `]`.",
        "  - If an article has no extractable facts, just skip it.",
        "",
        f"Below are {len(batch)} articles. Each delimited by a header line.",
        "",
    ]
    for i, ev in enumerate(batch, 1):
        url = ev.get("url", "")
        source = ev.get("source", "")
        title = ev.get("title") or ""
        published = ev.get("published_at") or ""
        text = (ev.get("raw_text") or "")[:max_chars]
        parts.append(f"=== ARTICLE {i} ===")
        parts.append(f"source_url: {url}")
        parts.append(f"source: {source}")
        if title:
            parts.append(f"title: {title}")
        if published:
            parts.append(f"published_at: {published}")
        parts.append("text:")
        parts.append(text)
        parts.append("")
    parts.append("=== END OF BATCH ===")
    parts.append("")
    parts.append("Return ONLY the JSON array now.")
    return "\n".join(parts)


def main() -> None:
    args = parse_args()
    if args.slug not in SCHOOL_DISPLAY:
        # Bridge-seeded jobs may target unregistered slugs; skip clean
        # so downstream phases (record_book_rebuild) still run.
        print(f"WARN: no display name for {args.slug}; skipping llm_extract", file=sys.stderr)
        sys.exit(0)
    school_display = SCHOOL_DISPLAY[args.slug]

    evidence = load_evidence(args.slug)
    if not evidence:
        print(f"[extract] no evidence files under {EVIDENCE_ROOT/args.slug}; nothing to extract", file=sys.stderr)
        return

    if args.resume:
        seen_urls = already_processed_urls(args.slug)
        evidence = [e for e in evidence if e.get("url") not in seen_urls]
        print(f"[extract] resume: skipping {len(seen_urls)} already-processed URLs; {len(evidence)} remaining")

    cli = ClaudeCLI(timeout_seconds=1200, retries=3)
    total_facts = 0
    n_batches = (len(evidence) + args.batch_size - 1) // args.batch_size
    if args.max_batches:
        n_batches = min(n_batches, args.max_batches)

    for batch_i in range(n_batches):
        batch = evidence[batch_i * args.batch_size : (batch_i + 1) * args.batch_size]
        if not batch:
            break
        prompt = build_batch_prompt(args.slug, school_display, batch, args.max_chars_per_article)
        print(f"[extract] batch {batch_i+1}/{n_batches} ({len(batch)} articles, ~{len(prompt)} chars)")
        try:
            facts = cli.extract_json(prompt)
        except RuntimeError as e:
            print(f"[extract] FATAL: {e}", file=sys.stderr)
            return
        except Exception as e:
            print(f"[extract] batch failed: {e}", file=sys.stderr)
            continue
        if not isinstance(facts, list):
            print(f"[extract] batch {batch_i+1}: unexpected response type {type(facts).__name__}, skipping", file=sys.stderr)
            continue
        # Stamp facts with extraction metadata.
        now = datetime.now().isoformat(timespec="seconds") + "Z"
        for f in facts:
            f["extracted_at"] = now
            f["batch_id"] = batch_i + 1
        append_facts(args.slug, facts)
        total_facts += len(facts)
        print(f"[extract]   batch yielded {len(facts)} facts (cumulative {total_facts})")
        # Light pacing — avoid hammering Claude rate limits.
        time.sleep(1.0)

    print(f"\n[extract] done — {total_facts} new facts in data/team-deep-dive/extracted-facts/{args.slug}.json")


if __name__ == "__main__":
    main()
