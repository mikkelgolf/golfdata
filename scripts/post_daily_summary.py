"""Post the collegegolfdata daily-refresh summary to #ron-collegegolfdata.

Uses Ron's bot token + channel ID via Discord REST API. Does NOT connect
to the Discord gateway (avoids session conflict with Ron's always-on
LaunchAgent). Designed to be short-lived and idempotent — each invocation
posts exactly one message.

Inputs (env or args):
  --champions-report   path to detect_new_champions.py JSON output
  --rankings-changed   optional yes/no marker (set by daily-refresh.sh)
  --commit             optional committed SHA (when deploy happened)
  --deploy-url         optional Vercel production URL
  --diff-stat          optional one-line summary of data-file delta
  --disabled           flag: post the "refresh disabled" variant + exit
  --failed             path to failure message (stdin if omitted)
  --dry-run            print the message to stdout instead of posting

Expected env:
  RON_ENV_PATH (optional) — path to ron .env (default ~/projects/ron/.env)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

RON_ENV_DEFAULT = Path("/Users/mikkelbjerchandresen/projects/ron/.env")
DISCORD_API = "https://discord.com/api/v10"
OSLO = ZoneInfo("Europe/Oslo")


def load_ron_env(path: Path) -> tuple[str, str]:
    token = None
    channel = None
    with path.open() as fh:
        for line in fh:
            line = line.strip()
            if line.startswith("DISCORD_BOT_TOKEN="):
                token = line.split("=", 1)[1].strip().strip('"').strip("'")
            elif line.startswith("DISCORD_CHANNEL_ID="):
                channel = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not token or not channel:
        raise RuntimeError(f"Missing bot token or channel id in {path}")
    return token, channel


def format_timestamp() -> str:
    now = datetime.now(OSLO)
    tz_abbr = now.strftime("%Z")  # CEST / CET depending on season
    return now.strftime(f"%Y-%m-%d %H:%M {tz_abbr}")


def build_disabled_message() -> str:
    return (
        f"**Daily refresh skipped — {format_timestamp()}**\n"
        "Kill switch `.daily-refresh-disabled` is present in the repo. "
        "Delete the file to re-enable."
    )


def build_failure_message(failure_text: str) -> str:
    return (
        f"**Daily refresh FAILED — {format_timestamp()}**\n"
        f"{failure_text.strip()}\n"
        "Run `bash ~/projects/collegegolfdata/scripts/daily-refresh.sh` "
        "manually to diagnose."
    )


def format_champ_line(entry: dict) -> str:
    gender_label = "Women" if entry["gender"] == "women" else "Men"
    url = entry.get("clippdUrl") or ""
    label = f"{entry['conference']} {gender_label}"
    linked = f"[{label}]({url})" if url else f"**{label}** _(no Clippd match — check date in `{entry['tsFile']}`)_"
    return (
        f"  ⚠ {linked} — ended {entry['endDate']}, "
        f"needs manual `winner:` in `{entry['tsFile']}`"
    )


def build_success_message(
    champions_report: dict,
    rankings_changed: bool,
    diff_stat: str | None,
    commit_sha: str | None,
    deploy_url: str | None,
) -> str:
    ts = format_timestamp()
    lines = [f"**Daily refresh — {ts}**"]

    if rankings_changed:
        stat = f" ({diff_stat})" if diff_stat else ""
        lines.append(f"• Rankings: Clippd refreshed{stat}")
    else:
        lines.append("• Rankings: no change")

    auto = champions_report.get("autoConfirmed", [])
    manual = champions_report.get("needsManual", [])
    still_open = champions_report.get("stillOpen", [])

    if not auto and not manual and not still_open:
        lines.append("• Conference champions: no tournaments ended recently")
    else:
        lines.append("• Conference champions:")
        for entry in auto:
            g = "Women" if entry["gender"] == "women" else "Men"
            lines.append(
                f"  ✓ **{entry.get('winner','?')}** won {entry['conference']} {g} "
                f"({entry['endDate']})"
            )
        for entry in manual:
            lines.append(format_champ_line(entry))
        if still_open:
            open_labels = ", ".join(
                f"{e['conference']} {'W' if e['gender'] == 'women' else 'M'}"
                for e in still_open[:6]
            )
            more = f" +{len(still_open) - 6}" if len(still_open) > 6 else ""
            lines.append(f"  · In progress: {open_labels}{more}")

    if deploy_url or commit_sha:
        short = commit_sha[:7] if commit_sha else "?"
        lines.append(f"• Deploy: {deploy_url or '(pending)'} (commit `{short}`)")
    else:
        lines.append("• Deploy: skipped (no diffs)")

    return "\n".join(lines)


def post(token: str, channel: str, content: str) -> None:
    req = urllib.request.Request(
        f"{DISCORD_API}/channels/{channel}/messages",
        data=json.dumps({"content": content}).encode("utf-8"),
        headers={
            "Authorization": f"Bot {token}",
            "Content-Type": "application/json",
            "User-Agent": "CgdDailyRefresh/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        if resp.status != 200:
            body = resp.read().decode("utf-8", errors="replace")[:300]
            raise RuntimeError(f"Discord POST {resp.status}: {body}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--champions-report", type=Path)
    parser.add_argument("--rankings-changed", default="no")
    parser.add_argument("--commit")
    parser.add_argument("--deploy-url")
    parser.add_argument("--diff-stat")
    parser.add_argument("--disabled", action="store_true")
    parser.add_argument("--failed", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.disabled:
        content = build_disabled_message()
    elif args.failed:
        text = sys.stdin.read() or "(no failure details provided)"
        content = build_failure_message(text)
    else:
        report: dict = {}
        if args.champions_report and args.champions_report.exists():
            report = json.loads(args.champions_report.read_text())
        content = build_success_message(
            champions_report=report,
            rankings_changed=args.rankings_changed.lower() in {"yes", "true", "1"},
            diff_stat=args.diff_stat,
            commit_sha=args.commit,
            deploy_url=args.deploy_url,
        )

    if args.dry_run:
        print(content)
        return 0

    env_path = Path(os.environ.get("RON_ENV_PATH", str(RON_ENV_DEFAULT)))
    try:
        token, channel = load_ron_env(env_path)
    except Exception as exc:
        print(f"ERROR loading ron .env: {exc}", file=sys.stderr)
        return 2

    try:
        post(token, channel, content)
    except (urllib.error.HTTPError, urllib.error.URLError, RuntimeError) as exc:
        print(f"ERROR posting to Discord: {exc}", file=sys.stderr)
        return 1

    print("posted.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
