#!/usr/bin/env python
"""synthesize-insights.py — second-pass LLM phase that asks Claude Opus 4.7
(max effort) to read the reconciled facts + existing record-book sections
for a team and surface non-obvious connections, gaps, anomalies, narrative
threads, and follow-up research leads.

This is the phase that turns "we extracted 800 facts" into "Opus noticed
Player X had three top-10s but no All-American honor — likely a gap to
backfill" or "the 1987 team's rise correlates with Coach Y's hire and the
program's first Walker Cup pick."

Output: data/team-deep-dive/insights-<slug>.json — JSON with sections:
  - cross_source_connections[]: facts confirmed by multiple independent sources
  - patterns[]: era trends, rivalries, transitions
  - anomalies[]: conflicting attributions or unusual finishes
  - gaps[]: likely-but-unattested honors / missing data
  - research_leads[]: specific URLs / queries / archives to chase next
  - narrative[]: 3-5 paragraph readable summary of the program's arc

Reconcile-facts.ts merges the high-confidence connections + research_leads
into the record book under sections.opus_insights.

Usage:
    ~/venv/bin/python scripts/team-deep-dive/synthesize-insights.py texas-tech men
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.claude_cli import ClaudeCLI  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
RECONCILED_FACTS_DIR = REPO_ROOT / "data" / "team-deep-dive"
TEAMS_DIR = REPO_ROOT / "src" / "data" / "teams"
INSIGHTS_DIR = REPO_ROOT / "data" / "team-deep-dive"


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("gender", choices=["men", "women", "m", "w"])
    return ap.parse_args()


def load_reconciled(slug: str) -> list[dict]:
    p = RECONCILED_FACTS_DIR / f"reconciled-facts-{slug}.json"
    if not p.exists():
        return []
    return json.loads(p.read_text())


def load_record_book(slug: str, gender: str) -> dict | None:
    p = TEAMS_DIR / f"{slug}-{gender}-record-book.json"
    if not p.exists():
        return None
    return json.loads(p.read_text())


def slim_record_book(rb: dict) -> dict:
    """Return only the high-signal sections — keep prompt tractable."""
    s = rb.get("sections", {})
    out = {
        "school_slug": rb.get("school_slug"),
        "gender": rb.get("gender"),
        "career_individual_records": s.get("career_individual_records"),
        "single_season_records": s.get("single_season_records"),
        "tournament_records": s.get("tournament_records"),
        "all_americans_from_school_pdf": s.get("all_americans_from_school_pdf", []),
        "all_americans_from_web": s.get("all_americans_from_web", []),
        "ncaa_championships_from_wikipedia": s.get("ncaa_championships_from_wikipedia", []),
        "ncaa_runner_up_from_wikipedia": s.get("ncaa_runner_up_from_wikipedia", []),
        "individual_ncaa_champions": s.get("individual_ncaa_champions", []),
        "conference_titles": s.get("conference_titles"),
        "southwest_conference_championships": s.get("southwest_conference_championships", []),
        "coaching_history": s.get("coaching_history"),
        "all_time_roster_count": len(s.get("all_time_roster", [])),
        "year_by_year_team_results": s.get("year_by_year_team_results", []),
        "walker_cup_from_wikipedia": s.get("walker_cup_from_wikipedia", []),
        "notable_pros": s.get("notable_pros") if isinstance(s.get("notable_pros"), list) else None,
    }
    return out


def build_synthesis_prompt(slug: str, gender: str, rb_slim: dict, facts: list[dict]) -> str:
    fact_summary = []
    for f in facts[:1500]:  # cap so the prompt fits comfortably
        fact_summary.append(
            {
                "fact_id": f.get("fact_id"),
                "fact_type": f.get("fact_type"),
                "player": f.get("player_name"),
                "year": f.get("year"),
                "tournament": f.get("tournament"),
                "position": f.get("position"),
                "tier": f.get("tier"),
                "confidence": f.get("confidence"),
                "sources": f.get("sources"),
                "quote": f.get("supporting_quote"),
            }
        )
    return f"""You are a college-golf historian and investigative analyst with deep familiarity with NCAA Division I golf, Walker Cup history, the PGA Tour pipeline, and the politics of college athletics. You are reviewing the **complete documented record** of one program (slug: `{slug}`, gender: `{gender}`).

You have two inputs:
  1. The current published record book (canonical, as it appears on the team page today).
  2. {len(fact_summary)} reconciled facts extracted by an LLM pass over school news archives, Wayback snapshots, Wikipedia, library digital collections, conference archives, and historical newspapers.

Your job is to think harder than the extraction pass did. Find the non-obvious. Connect threads across decades. Surface what a meticulous researcher with full access to this corpus would notice that a regex parser cannot.

Return STRICT JSON with this exact shape (no markdown, no prose outside the JSON):

{{
  "cross_source_connections": [
    {{
      "summary": "One-sentence claim",
      "fact_ids": ["f-0000123", "f-0000456"],
      "why_interesting": "Why this connection matters",
      "confidence": 0.0-1.0
    }}
  ],
  "patterns": [
    {{
      "pattern_kind": "era_trend|rivalry|coaching_transition|recruiting_pipeline|tour_pipeline|venue_dominance|other",
      "summary": "...",
      "supporting_fact_ids": [],
      "years_covered": [start, end],
      "confidence": 0.0-1.0
    }}
  ],
  "anomalies": [
    {{
      "summary": "Conflicting attribution or unusual finish",
      "fact_ids": [],
      "likely_explanation": "..."
    }}
  ],
  "gaps": [
    {{
      "claim": "What we expect to be true but isn't yet attested",
      "why_likely": "Reasoning from adjacent facts",
      "suggested_source": "Where to verify"
    }}
  ],
  "research_leads": [
    {{
      "lead": "Specific person/event/year to chase",
      "why": "Reason this fills a gap",
      "suggested_query_or_url": "Concrete search term, archive URL, or library reference"
    }}
  ],
  "narrative": [
    "3-5 paragraph readable summary of the program's arc, threading the major eras, coaching changes, signature wins, and pro-tour pipeline. Each paragraph is one string in this array."
  ],
  "notable_alumni_with_context": [
    {{
      "player": "Full name",
      "tour_record_summary": "Tour wins, majors, signature events",
      "college_signature_moments": "What he did at this school"
    }}
  ]
}}

Be specific. Cite fact_ids whenever you can. Prefer making 5 strong claims to 50 vague ones. If you don't have evidence for a section, return an empty array.

=== RECORD BOOK (canonical) ===
{json.dumps(rb_slim, indent=2)[:12000]}

=== RECONCILED FACTS ({len(fact_summary)} of {len(facts)}) ===
{json.dumps(fact_summary, indent=1)[:32000]}

Return ONLY the JSON object now."""


def main() -> None:
    args = parse_args()
    g = "men" if args.gender in ("m", "men") else "women"
    facts = load_reconciled(args.slug)
    rb = load_record_book(args.slug, g)
    if not rb:
        print(f"[synth] no record book for {args.slug}; skipping")
        return
    if not facts:
        print(f"[synth] no reconciled facts for {args.slug}; skipping")
        return
    rb_slim = slim_record_book(rb)
    prompt = build_synthesis_prompt(args.slug, g, rb_slim, facts)
    print(f"[synth] {args.slug}: prompt size {len(prompt):,} chars, calling Opus 4.7 max effort")
    cli = ClaudeCLI(timeout_seconds=1800)  # synthesis can think for a while
    insights = cli.extract_json(prompt)
    if not isinstance(insights, dict):
        print(f"[synth] unexpected response type {type(insights).__name__}; aborting")
        return
    insights["slug"] = args.slug
    insights["gender"] = g
    insights["model"] = "claude-opus-4-7"
    insights["effort"] = "max"
    insights["synthesized_at"] = datetime.now().isoformat(timespec="seconds") + "Z"
    insights["n_facts_considered"] = len(facts)

    out_path = INSIGHTS_DIR / f"insights-{args.slug}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(insights, indent=2))
    print(f"[synth] wrote {out_path}")
    print(f"[synth] connections={len(insights.get('cross_source_connections', []))} "
          f"patterns={len(insights.get('patterns', []))} "
          f"anomalies={len(insights.get('anomalies', []))} "
          f"gaps={len(insights.get('gaps', []))} "
          f"leads={len(insights.get('research_leads', []))}")


if __name__ == "__main__":
    main()
