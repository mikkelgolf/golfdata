"""Extract match-play championship-final detail from a Clippd tournament page.

For match-play conference championships we want three values:
  - winner:    team that won the tournament (row 1 on /scoring/team)
  - runnerUp:  team that lost the final (row 2 on /scoring/team)
  - finalScore: the dual score from the final, formatted "W-L" with the
                winning side first. Half-point matches render as "3.5-1.5".

Implementation notes:
  - Clippd's /scoring/round page defaults to the LAST round, which is
    always the championship final. The body text rendered by the React
    app contains the dual matchup as
        "{LeftTeam}\nSingles\n\n{X} - {Y}\n\n{RightTeam}"
    where X and Y are the dual scores. The team names match the
    /scoring/team labels (e.g. "Texas A&M", not URL-encoded variants).
  - The order of LEFT vs RIGHT is NOT consistent across tournaments —
    SEC men 2024 has the winner on the right ("Vanderbilt 2 - 3 Auburn"),
    while ACC men 2024 has the winner on the left ("North Carolina 3.5
    - 1.5 Florida State"). We disambiguate by cross-referencing row 1
    on the team page.
"""

from __future__ import annotations

import re
import sys
from typing import Optional, Tuple, TypedDict


class MatchPlayDetail(TypedDict, total=False):
    winner: Optional[str]
    runnerUp: Optional[str]
    finalScore: Optional[str]


def extract_match_play_final(
    tournament_id: str,
    timeout_ms: int = 45_000,
    page=None,
) -> MatchPlayDetail:
    """Return winner/runnerUp/finalScore for a Clippd match-play tournament.

    Returns whatever fields we can extract; missing fields are absent.
    Pass an existing Playwright `page` to reuse a single browser session
    across many tournaments (the runner script does this for throughput).
    """
    if page is None:
        # One-shot mode for ad-hoc CLI testing.
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            print("ERROR: playwright not installed", file=sys.stderr)
            return {}
        ua = (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        )
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            ctx = browser.new_context(user_agent=ua)
            pg = ctx.new_page()
            try:
                return _extract_with_page(pg, tournament_id, timeout_ms)
            finally:
                browser.close()
    return _extract_with_page(page, tournament_id, timeout_ms)


def _extract_with_page(page, tournament_id: str, timeout_ms: int) -> MatchPlayDetail:
    out: MatchPlayDetail = {}

    # Step 1: team standings → winner (row 1) + a *candidate* runner-up
    # (row 2). Row 2 usually equals the team that lost the final, but not
    # always: tournaments where a semifinal was tied (e.g. 2025 BSOUTH
    # women) sort the un-defeated semi-tied team into row 2 instead of
    # the actual final-match loser. Treat row 2 as a fallback only.
    team_url = f"https://scoreboard.clippd.com/tournaments/{tournament_id}/scoring/team"
    try:
        page.goto(team_url, wait_until="networkidle", timeout=timeout_ms)
        page.wait_for_timeout(1500)
        winner, row2 = _read_top_two_from_team_table(page)
    except Exception as exc:
        print(f"WARN: team-page render failed for {tournament_id}: {exc}",
              file=sys.stderr)
        return out

    if winner:
        out["winner"] = winner
    if not winner:
        # Can't anchor the final-match lookup without the winner's name.
        if row2:
            out["runnerUp"] = row2
        return out

    # Step 2: round page (defaults to the LAST round = the final). Find
    # the dual matchup that includes the winner; the OTHER team is the
    # actual final-match opponent. Trust this over team-page row 2.
    round_url = f"https://scoreboard.clippd.com/tournaments/{tournament_id}/scoring/round"
    try:
        page.goto(round_url, wait_until="networkidle", timeout=timeout_ms)
        page.wait_for_timeout(1500)
        opponent, score = _find_final_for_winner(page, winner)
    except Exception as exc:
        print(f"WARN: round-page render failed for {tournament_id}: {exc}",
              file=sys.stderr)
        if row2:
            out["runnerUp"] = row2
        return out

    runner_up = opponent or row2
    if runner_up:
        out["runnerUp"] = runner_up
    if score:
        out["finalScore"] = score
    return out


def _read_top_two_from_team_table(page) -> Tuple[Optional[str], Optional[str]]:
    """Read row 1 (winner) + row 2 (runner-up) from the team table.

    Layout (header row): ['', 'POS', 'TEAM', 'TEAM RANK', 'WIN', 'LOSS', 'TIE']
    The TEAM column index is dynamic — we look it up by header text.
    """
    tables = page.locator("table")
    if tables.count() == 0:
        return None, None

    table = tables.nth(0)
    rows = table.locator("tr")
    if rows.count() < 3:
        return None, None

    header = rows.nth(0).locator("th,td")
    team_col = None
    for i in range(header.count()):
        if header.nth(i).inner_text().strip().upper() == "TEAM":
            team_col = i
            break
    if team_col is None:
        return None, None

    def cell(row_idx, col_idx) -> Optional[str]:
        cells = rows.nth(row_idx).locator("th,td")
        if col_idx >= cells.count():
            return None
        v = cells.nth(col_idx).inner_text().strip()
        return v or None

    return cell(1, team_col), cell(2, team_col)


def _find_final_for_winner(
    page, winner: str
) -> Tuple[Optional[str], Optional[str]]:
    """Find the championship-final dual on the rendered round page.

    The /scoring/round page defaults to the LAST round, which for a
    standard bracket is the final. On that page, find the (only) dual
    matchup that includes ``winner`` and return ``(opponent, score)``.

    The rendered text from /scoring/round contains, for each dual:
        "{LeftTeam}\\nSingles\\n\\n{X} - {Y}\\n\\n{RightTeam}"
    plus a long tail of per-match holes/result data. We scan with a
    tolerant regex.

    Score is formatted "W-L" (winner score first, halves preserved
    as "3.5-1.5"). Returns ``(None, None)`` if no winner-involving
    matchup parses cleanly — caller is expected to fall back to
    team-page row 2 for runner-up in that case.
    """
    body = page.locator("body").inner_text()

    # Team names allow letters, digits, &, ., -, spaces, apostrophes,
    # parentheses (e.g. "Texas A&M", "St. John's", "UConn").
    team_chars = r"[A-Za-z][A-Za-z0-9 .&'\-()]+"
    pattern = re.compile(
        rf"({team_chars})\s*\n\s*Singles\s*\n\s*([\d.]+)\s*-\s*([\d.]+)\s*\n\s*({team_chars})"
    )

    winner_lc = winner.lower()
    for m in pattern.finditer(body):
        left, left_score, right_score, right = (
            m.group(1).strip(),
            m.group(2),
            m.group(3),
            m.group(4).strip(),
        )
        if winner_lc not in (left.lower(), right.lower()):
            continue
        try:
            ls = float(left_score)
            rs = float(right_score)
        except ValueError:
            continue
        if winner_lc == left.lower():
            opponent = right
            w, l = ls, rs
        else:
            opponent = left
            w, l = rs, ls
        return opponent, f"{_fmt_score(w)}-{_fmt_score(l)}"

    return None, None


def _fmt_score(x: float) -> str:
    """Render integer scores without decimal, halves as ".5"."""
    if x == int(x):
        return str(int(x))
    return f"{x:g}"  # "3.5" not "3.500000"


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: clippd_match_extractor.py <tournamentId>", file=sys.stderr)
        sys.exit(2)
    detail = extract_match_play_final(sys.argv[1])
    if not detail:
        print("NO_DATA", file=sys.stderr)
        sys.exit(1)
    import json as _json
    print(_json.dumps(detail, indent=2))
    sys.exit(0)
