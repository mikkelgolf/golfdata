#!/usr/bin/env python
"""dispatcher.py — the LaunchAgent worker for /team-deep-dive M2.

Runs continuously. Reads job manifests from
data/team-deep-dive/jobs/<job_id>.json. For each pending job, runs the 12
phases in order. Checkpoints to manifest after each phase + after each
significant batch within a phase. LaunchAgent restart resumes from the
last checkpoint.

Discord milestones via mikkel-system/scripts/discord_notify.py.

Job manifest schema:
{
  "job_id": "texas-tech-men-2026-04-26",
  "school_slug": "texas-tech",
  "gender": "men",
  "phases_complete": ["news_archive", "wayback"],
  "current_phase": "loc_newspapers",
  "started_at": "2026-04-26T...",
  "updated_at": "2026-04-26T...",
  "status": "pending|running|completed|failed",
  "error": "..."
}

Usage:
    ~/venv/bin/python scripts/team-deep-dive/dispatcher.py
    ~/venv/bin/python scripts/team-deep-dive/dispatcher.py --once   # run one job, then exit
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

# Serialize git ops across worker threads — only one commit_and_push at a
# time. The git index is per-process; concurrent writes would race.
_GIT_LOCK = threading.Lock()
# Per-job claim set so two workers don't grab the same manifest.
_CLAIMED_JOBS: set[str] = set()
_CLAIM_LOCK = threading.Lock()

REPO_ROOT = Path(__file__).resolve().parents[2]
JOBS_DIR = REPO_ROOT / "data" / "team-deep-dive" / "jobs"
LOGS_DIR = REPO_ROOT / "logs" / "deep-dive"
DISCORD_NOTIFY = Path.home() / "projects" / "mikkel-system" / "scripts" / "discord_notify.py"
PYTHON_BIN = str(Path.home() / "venv" / "bin" / "python")
NPX_BIN = "/opt/homebrew/bin/npx"
CLAUDE_BIN = "/opt/homebrew/bin/claude"

# All M2 commits land on this branch. Mikkel reviews before merging
# dev-mikkel → dev → main.
COMMIT_BRANCH = "dev-mikkel"

PHASES = [
    # 1. Schedule discovery — establish ground-truth list of expected events.
    {"name": "schedule_discovery", "kind": "py_script_per_team", "script": "scrape-school-schedule.py"},
    # 2. School news archive — articles + writeups + outbound PDF links.
    {"name": "news_archive", "kind": "py_script_per_team", "script": "scrape-school-news.py", "timeout_seconds": 14400},
    # 3. PDF leaderboards linked from articles → pdftotext → evidence files.
    {"name": "leaderboard_pdfs", "kind": "py_script_per_team", "script": "scrape-leaderboard-pdfs.py"},
    # 4-7. Other source crawls.
    {"name": "wayback", "kind": "py_script_per_team", "script": "scrape-wayback.py"},
    {"name": "loc_newspapers", "kind": "py_script_per_team", "script": "scrape-loc-newspapers.py"},
    {"name": "school_archive", "kind": "py_script_per_team", "script": "scrape-school-archive.py"},
    {"name": "search_aggregator", "kind": "py_script_per_team", "script": "scrape-search-aggregator.py"},
    # 8-10. Cross-team / global once.
    {"name": "rankings_history", "kind": "py_script_global_once", "script": "scrape-rankings-history.py"},
    {"name": "conference_archives", "kind": "py_script_global_once", "script": "scrape-conference-archives.py"},
    {"name": "usga_amateur", "kind": "py_script_global_once", "script": "scrape-usga-amateur.py"},
    # 10b. Event-bridge extraction — leaderboard PDFs + recaps → cross-team
    #      event roster. Writes the global event-bridges.json so every team
    #      we process expands the universe of teams we have ground truth on.
    # extract-event-bridges.py auto-resumes from bridges-checkpoint-<slug>.json
    # if it exists, so kill+restart is safe — picks up at the next batch.
    {"name": "extract_event_bridges", "kind": "py_script_per_team", "script": "extract-event-bridges.py", "timeout_seconds": 10800},
    # 10c. Apply bridges — fill expected-schedule for seeded teams from
    #      bridges; auto-queue unseeded teams seen in 3+ bridge events.
    {"name": "apply_event_bridges", "kind": "py_script_global_once", "script": "apply-event-bridges.py"},
    # 11. Coverage validation — diff expected schedule vs granular_master + PDFs.
    {"name": "coverage_validation", "kind": "py_script_per_team", "script": "validate-coverage.py"},
    # 12. GolfStat backfill — resolve TIDs for gaps; logs queue (does NOT
    #     invoke the upstream scraper unless --no-resolve-only is passed).
    {"name": "golfstat_backfill", "kind": "py_script_per_team", "script": "golfstat-backfill.py", "extra_args": ["--resolve-only"]},
    # 13-16. LLM extract → record-book rebuild → reconcile (merges facts
    #         INTO the record book, so it must run AFTER the rebuild) →
    #         synthesis (reads merged record book).
    {"name": "llm_extract", "kind": "py_script_per_team", "script": "extract-facts.py", "extra_args": ["--resume"]},
    {"name": "record_book_rebuild", "kind": "ts_script_per_team", "script": "build-record-book.ts"},
    {"name": "reconcile", "kind": "ts_script_per_team", "script": "reconcile-facts.ts"},
    {"name": "synthesize_insights", "kind": "py_script_per_team", "script": "synthesize-insights.py", "timeout_seconds": 1800},
    {"name": "validate", "kind": "noop", "script": None},
]


def discord_ping(message: str, urgent: bool = False) -> None:
    if not DISCORD_NOTIFY.exists():
        return
    try:
        args = [PYTHON_BIN, str(DISCORD_NOTIFY)]
        if urgent:
            args.append("--urgent")
        args.append(message)
        subprocess.run(args, check=False, timeout=15)
    except Exception:
        pass


def commit_and_push_team(slug: str, gender: str) -> dict:
    """Commit the M2 changes for a team to the dev branch and push to origin.

    Stages only the per-team record-book JSON (the file M2 actually
    touches). Returns a dict with status + commit_sha + push_ok for the
    Discord milestone. Never raises — failures are reported, not fatal.

    Serialized via _GIT_LOCK because git operations on a shared worktree
    are not thread-safe (the index would race).
    """
    with _GIT_LOCK:
        return _commit_and_push_team_locked(slug, gender)


def _commit_and_push_team_locked(slug: str, gender: str) -> dict:
    g = "men" if gender in ("m", "men") else "women"
    record_book_rel = f"src/data/teams/{slug}-{g}-record-book.json"
    record_book_abs = REPO_ROOT / record_book_rel
    result = {"committed": False, "pushed": False, "sha": None, "error": None, "skipped": False}

    if not record_book_abs.exists():
        result["error"] = f"record book missing: {record_book_rel}"
        return result

    # Safety: ensure we're on COMMIT_BRANCH (dev-mikkel). Auto-switch if a
    # different working branch is checked out — but never if there are
    # unrelated uncommitted changes (we'd rather error than risk losing work).
    branch_p = subprocess.run(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        cwd=REPO_ROOT, capture_output=True, text=True, timeout=10,
    )
    branch = (branch_p.stdout or "").strip()
    if branch != COMMIT_BRANCH:
        # Try to switch. `git checkout COMMIT_BRANCH` carries uncommitted
        # changes with us, which is what we want for record-book updates.
        # If the branch doesn't exist locally, create from origin/dev-mikkel
        # if available, else from dev.
        sw = subprocess.run(
            ["git", "checkout", COMMIT_BRANCH],
            cwd=REPO_ROOT, capture_output=True, text=True, timeout=15,
        )
        if sw.returncode != 0:
            # Branch doesn't exist locally — create from origin or from dev.
            for base in [f"origin/{COMMIT_BRANCH}", "origin/dev", "dev"]:
                cb = subprocess.run(
                    ["git", "checkout", "-b", COMMIT_BRANCH, base],
                    cwd=REPO_ROOT, capture_output=True, text=True, timeout=15,
                )
                if cb.returncode == 0:
                    break
            else:
                result["error"] = (
                    f"could not switch or create branch {COMMIT_BRANCH} "
                    f"(currently on {branch}): {sw.stderr[:200]}"
                )
                return result

    # Anything to commit?
    diff_p = subprocess.run(
        ["git", "diff", "--quiet", "--", record_book_rel],
        cwd=REPO_ROOT, capture_output=True, text=True, timeout=10,
    )
    diff_cached_p = subprocess.run(
        ["git", "diff", "--cached", "--quiet", "--", record_book_rel],
        cwd=REPO_ROOT, capture_output=True, text=True, timeout=10,
    )
    if diff_p.returncode == 0 and diff_cached_p.returncode == 0:
        result["skipped"] = True
        return result

    # Stage just the record book; don't sweep up other concurrent changes.
    add_p = subprocess.run(
        ["git", "add", record_book_rel],
        cwd=REPO_ROOT, capture_output=True, text=True, timeout=15,
    )
    if add_p.returncode != 0:
        result["error"] = f"git add failed: {add_p.stderr[:200]}"
        return result

    msg = (
        f"team-deep-dive M2: {slug} {g}\n\n"
        f"Auto-committed by dispatcher.py after M2 phases completed.\n"
        f"Source: data/team-deep-dive/reconciled-facts-{slug}.json\n"
    )
    commit_p = subprocess.run(
        ["git", "commit", "-m", msg, "--", record_book_rel],
        cwd=REPO_ROOT, capture_output=True, text=True, timeout=30,
    )
    if commit_p.returncode != 0:
        # Could be "nothing to commit" if a parallel writer beat us.
        if "nothing to commit" in (commit_p.stdout + commit_p.stderr).lower():
            result["skipped"] = True
            return result
        result["error"] = f"git commit failed: {commit_p.stderr[:200] or commit_p.stdout[:200]}"
        return result
    result["committed"] = True

    sha_p = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        cwd=REPO_ROOT, capture_output=True, text=True, timeout=10,
    )
    result["sha"] = (sha_p.stdout or "").strip() if sha_p.returncode == 0 else None

    # Push to origin/<COMMIT_BRANCH>. Fetch first; -u sets upstream so
    # the next push doesn't need explicit refspec.
    subprocess.run(
        ["git", "fetch", "origin", COMMIT_BRANCH],
        cwd=REPO_ROOT, capture_output=True, text=True, timeout=30,
    )
    push_p = subprocess.run(
        ["git", "push", "-u", "origin", COMMIT_BRANCH],
        cwd=REPO_ROOT, capture_output=True, text=True, timeout=60,
    )
    if push_p.returncode != 0:
        # Try one rebase + push as a recovery.
        rebase_p = subprocess.run(
            ["git", "pull", "--rebase", "origin", COMMIT_BRANCH],
            cwd=REPO_ROOT, capture_output=True, text=True, timeout=60,
        )
        if rebase_p.returncode == 0:
            push_p = subprocess.run(
                ["git", "push", "-u", "origin", COMMIT_BRANCH],
                cwd=REPO_ROOT, capture_output=True, text=True, timeout=60,
            )
    if push_p.returncode != 0:
        result["error"] = f"push failed (commit landed locally): {push_p.stderr[:200]}"
        return result
    result["pushed"] = True
    return result


def list_pending_jobs() -> list[Path]:
    if not JOBS_DIR.exists():
        return []
    out = []
    for f in sorted(JOBS_DIR.glob("*.json")):
        try:
            j = json.loads(f.read_text())
        except Exception:
            continue
        if j.get("status") in (None, "pending", "running"):
            out.append(f)
    return out


def update_manifest(path: Path, patch: dict) -> dict:
    j = json.loads(path.read_text())
    j.update(patch)
    j["updated_at"] = datetime.now().isoformat(timespec="seconds") + "Z"
    path.write_text(json.dumps(j, indent=2))
    return j


def run_phase_for_job(manifest_path: Path, manifest: dict, phase: dict) -> bool:
    slug = manifest["school_slug"]
    gender = manifest.get("gender", "men")
    name = phase["name"]
    log_path = LOGS_DIR / f"{manifest['job_id']}.ndjson"
    log_path.parent.mkdir(parents=True, exist_ok=True)

    if phase["kind"] == "noop":
        return True

    if phase["kind"] == "py_script_global_once":
        # Global phases run once, regardless of which team triggered them.
        # Use a sentinel file to track first-completion.
        sentinel = REPO_ROOT / "data" / "team-deep-dive" / f".{name}-complete"
        if sentinel.exists():
            return True
        cmd = [PYTHON_BIN, f"scripts/team-deep-dive/{phase['script']}"]
    elif phase["kind"] == "py_script_per_team":
        cmd = [PYTHON_BIN, f"scripts/team-deep-dive/{phase['script']}", slug, gender]
        cmd.extend(phase.get("extra_args", []))
    elif phase["kind"] == "ts_script_per_team":
        cmd = [NPX_BIN, "tsx", f"scripts/team-deep-dive/{phase['script']}", slug, gender]
    else:
        raise ValueError(f"Unknown phase kind: {phase['kind']}")

    print(f"[dispatch] {manifest['job_id']} phase={name} cmd={cmd[0]} ...")
    started = datetime.now()
    with open(log_path, "a") as logf:
        logf.write(
            json.dumps(
                {
                    "ts": started.isoformat() + "Z",
                    "job_id": manifest["job_id"],
                    "phase": name,
                    "event": "phase_start",
                }
            )
            + "\n"
        )
        proc = subprocess.run(
            cmd,
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=phase.get("timeout_seconds", 7200),  # 2h default
        )
        finished = datetime.now()
        # Append stdout tail to log.
        tail = (proc.stdout or "")[-2000:]
        logf.write(
            json.dumps(
                {
                    "ts": finished.isoformat() + "Z",
                    "job_id": manifest["job_id"],
                    "phase": name,
                    "event": "phase_end",
                    "returncode": proc.returncode,
                    "duration_seconds": (finished - started).total_seconds(),
                    "stdout_tail": tail,
                    "stderr_tail": (proc.stderr or "")[-1000:],
                }
            )
            + "\n"
        )
    if proc.returncode != 0:
        discord_ping(
            f"⚠️ /team-deep-dive {manifest['job_id']} phase `{name}` failed (rc={proc.returncode}). "
            f"Check {log_path}.",
            urgent=True,
        )
        return False
    if phase["kind"] == "py_script_global_once":
        sentinel = REPO_ROOT / "data" / "team-deep-dive" / f".{name}-complete"
        sentinel.write_text(finished.isoformat() + "Z")
    return True


def run_job(manifest_path: Path) -> None:
    manifest = json.loads(manifest_path.read_text())
    job_id = manifest["job_id"]
    slug = manifest["school_slug"]
    print(f"\n[dispatch] starting job {job_id} ({slug})")
    discord_ping(
        f"🏌️ /team-deep-dive M2 starting: **{slug}** ({manifest.get('gender', 'men')})\n"
        f"job_id: `{job_id}`"
    )
    update_manifest(manifest_path, {"status": "running"})
    phases_complete = list(manifest.get("phases_complete") or [])
    for phase in PHASES:
        if phase["name"] in phases_complete:
            continue
        update_manifest(manifest_path, {"current_phase": phase["name"]})
        ok = run_phase_for_job(manifest_path, manifest, phase)
        if not ok:
            update_manifest(manifest_path, {"status": "failed", "error": f"phase {phase['name']} failed"})
            return
        phases_complete.append(phase["name"])
        update_manifest(manifest_path, {"phases_complete": phases_complete})
        discord_ping(f"✅ {slug}: phase `{phase['name']}` complete")
    update_manifest(
        manifest_path,
        {"status": "completed", "current_phase": None, "phases_complete": phases_complete, "completed_at": datetime.now().isoformat(timespec="seconds") + "Z"},
    )

    # Auto-commit + push to dev so Vercel picks up the new record book.
    commit_result = commit_and_push_team(slug, manifest.get("gender", "men"))
    update_manifest(manifest_path, {"commit_result": commit_result})

    if commit_result.get("pushed"):
        discord_ping(
            f"🏆 /team-deep-dive M2 **{slug}** done — record book updated, "
            f"commit `{commit_result.get('sha')}` pushed to `{COMMIT_BRANCH}`.\n"
            f"https://github.com/mikkelgolf/golfdata/commit/{commit_result.get('sha')}\n"
            f"Preview will deploy on Vercel; merge `{COMMIT_BRANCH}` → `dev` → `main` when ready for prod."
        )
    elif commit_result.get("skipped"):
        discord_ping(f"🏆 /team-deep-dive M2 **{slug}** done — no record-book diff; nothing to commit.")
    elif commit_result.get("committed") and not commit_result.get("pushed"):
        discord_ping(
            f"🏆 /team-deep-dive M2 **{slug}** done — committed `{commit_result.get('sha')}` "
            f"but push failed: {commit_result.get('error')}",
            urgent=True,
        )
    else:
        discord_ping(
            f"🏆 /team-deep-dive M2 **{slug}** done — auto-commit failed: {commit_result.get('error')}",
            urgent=True,
        )


def _run_job_safe(j: Path) -> None:
    """Wrap run_job with try/except + claim release. Designed to run in
    a ThreadPoolExecutor worker.
    """
    try:
        run_job(j)
    except Exception:
        tb = traceback.format_exc()
        print(f"[dispatch] FATAL on {j}:\n{tb}", file=sys.stderr)
        discord_ping(f"💥 /team-deep-dive dispatcher crashed on {j.name}\n```\n{tb[-800:]}\n```", urgent=True)
        update_manifest(j, {"status": "failed", "error": tb[-1000:]})
    finally:
        with _CLAIM_LOCK:
            _CLAIMED_JOBS.discard(j.name)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--idle-seconds", type=int, default=600)
    ap.add_argument(
        "--max-concurrent",
        type=int,
        default=int(os.environ.get("CGD_M2_MAX_CONCURRENT", "1")),
        help="How many job manifests to run in parallel. Bottleneck is "
             "Claude Max rate limits; safe default 1, try 2 to start.",
    )
    args = ap.parse_args()

    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    JOBS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"[dispatch] starting with max_concurrent={args.max_concurrent}")

    if args.max_concurrent <= 1:
        # Sequential path — kept simple.
        while True:
            jobs = list_pending_jobs()
            if not jobs:
                if args.once:
                    print("[dispatch] no pending jobs; exiting (--once)")
                    return
                print(f"[dispatch] no pending jobs, sleeping {args.idle_seconds}s")
                time.sleep(args.idle_seconds)
                continue
            for j in jobs:
                _run_job_safe(j)
                if args.once:
                    return
        return

    # Parallel path: long-lived ThreadPoolExecutor that pulls jobs as
    # workers free up. Claim set prevents two workers from grabbing the
    # same manifest. Workers re-poll for new manifests when their slot
    # frees.
    with ThreadPoolExecutor(max_workers=args.max_concurrent) as ex:
        in_flight: dict = {}
        while True:
            # Submit new jobs up to capacity.
            jobs = list_pending_jobs()
            for j in jobs:
                if len(in_flight) >= args.max_concurrent:
                    break
                with _CLAIM_LOCK:
                    if j.name in _CLAIMED_JOBS:
                        continue
                    _CLAIMED_JOBS.add(j.name)
                fut = ex.submit(_run_job_safe, j)
                in_flight[fut] = j
            if not in_flight:
                if args.once:
                    print("[dispatch] no pending jobs; exiting (--once)")
                    return
                print(f"[dispatch] queue idle, sleeping {args.idle_seconds}s")
                time.sleep(args.idle_seconds)
                continue
            # Wait for at least one to finish, then loop and refill.
            done = next(as_completed(in_flight))
            j = in_flight.pop(done)
            print(f"[dispatch] worker free after {j.name}")
            if args.once and not in_flight:
                return


if __name__ == "__main__":
    main()
