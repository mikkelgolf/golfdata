#!/usr/bin/env python
"""scrape-leaderboard-pdfs.py — find + ingest leaderboard PDFs linked from
school news articles.

Walks existing evidence files in data/team-deep-dive/evidence/<slug>/ for
links_extracted that look like tournament PDFs (typical: GolfStat-emitted
results PDFs, BirdiePro Scoring PDFs, GolfChannel Pro AmTour PDFs, school
recap pages that link a leaderboard PDF). For each PDF:

  1. Download via http_cache (1 req/3s)
  2. pdftotext to extract leaderboard text
  3. Emit a new evidence file with source='leaderboard_pdf'

This dramatically extends per-event coverage — full leaderboards for any
event the school recapped, even if granular_master is missing the row.

Usage:
    ~/venv/bin/python scripts/team-deep-dive/scrape-leaderboard-pdfs.py texas-tech men
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.http_cache import HttpCache  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
EVIDENCE_ROOT = REPO_ROOT / "data" / "team-deep-dive" / "evidence"

# PDF link patterns we trust as leaderboards. We're permissive on first pass —
# the LLM extract phase filters noise.
PDF_HOST_HINTS = [
    "results.golfstat.com",
    "golfstat.com",
    "scoreboard.clippd.com",
    "clippd.com",
    "birdiebrain",
    "birdiepro",
    "tournament",
    "leaderboard",
    "results",
    "bluegolf.com",
    "golfgenius.com",
    "amateurgolf.com",
]


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("gender", choices=["men", "women", "m", "w"])
    ap.add_argument("--max", type=int, default=None, help="Cap total PDFs fetched")
    return ap.parse_args()


def looks_like_pdf_link(url: str) -> bool:
    if not url.lower().endswith(".pdf"):
        return False
    low = url.lower()
    return any(h in low for h in PDF_HOST_HINTS) or "leaderboard" in low or "tournament" in low or "results" in low or "stats" in low


def collect_pdf_urls(slug: str) -> list[str]:
    folder = EVIDENCE_ROOT / slug
    if not folder.exists():
        return []
    out: set[str] = set()
    for f in folder.glob("*.json"):
        try:
            d = json.loads(f.read_text())
        except Exception:
            continue
        for link in d.get("links_extracted") or []:
            if looks_like_pdf_link(link):
                out.add(link)
    return sorted(out)


def pdftotext(blob: bytes) -> str | None:
    """Run pdftotext on raw bytes. Returns text or None on failure."""
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(blob)
        tmp = f.name
    try:
        proc = subprocess.run(
            ["pdftotext", "-layout", tmp, "-"],
            capture_output=True,
            timeout=120,
        )
        if proc.returncode != 0:
            return None
        return proc.stdout.decode("utf-8", errors="ignore")
    finally:
        Path(tmp).unlink(missing_ok=True)


def write_evidence(slug: str, url: str, source: str, parsed: dict) -> Path:
    out_dir = EVIDENCE_ROOT / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    h = hashlib.sha1(url.encode()).hexdigest()
    p = out_dir / f"{h}.json"
    record = {
        "url": url,
        "source": source,
        "fetched_at": datetime.now().isoformat(timespec="seconds") + "Z",
        **parsed,
    }
    p.write_text(json.dumps(record, indent=2))
    return p


def main() -> None:
    args = parse_args()
    pdf_urls = collect_pdf_urls(args.slug)
    if args.max:
        pdf_urls = pdf_urls[: args.max]
    print(f"[pdfs] {args.slug}: {len(pdf_urls)} candidate leaderboard-PDF URLs")
    if not pdf_urls:
        return

    http = HttpCache(rate_limit_seconds=3.0)
    written = 0
    skipped = 0
    for i, url in enumerate(pdf_urls, 1):
        # Use http_cache.get but as bytes — ours returns text. Use raw fetch.
        try:
            import requests

            r = http._session.get(url, timeout=60)
            if r.status_code != 200 or not r.content or len(r.content) < 1024:
                skipped += 1
                continue
            text = pdftotext(r.content)
            if not text or len(text) < 200:
                skipped += 1
                continue
            parsed = {
                "title": Path(url).name,
                "published_at": None,
                "raw_text": text[:12000],  # leaderboards can be long; allow more
                "headings": [],
                "links_extracted": [],
                "is_leaderboard_pdf": True,
            }
            write_evidence(args.slug, url, "leaderboard_pdf", parsed)
            written += 1
            if i % 20 == 0:
                print(f"[pdfs]   {i}/{len(pdf_urls)} processed ({written} ingested, {skipped} skipped)")
        except Exception as e:
            print(f"[pdfs]   {url}: {e}", file=sys.stderr)
            skipped += 1
            continue

    print(f"\n[pdfs] done — {written} new leaderboard-PDF evidence files, {skipped} skipped")


if __name__ == "__main__":
    main()
