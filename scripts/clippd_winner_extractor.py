"""Extract the row-1 team name from a Clippd tournament's team-leaderboard page.

Clippd's scoreboard is a React app with no public team-standings endpoint
(probed /api/tournaments/{id}/teams, /scoring, /leaderboard etc. — all 404).
The rendered page at ``/tournaments/<id>/scoring/team`` contains a standings
table whose first data row is the overall winner for both stroke-play and
match-play events. Playwright renders the page; we parse the first <table>.

Used by ``detect_new_champions.py --apply-winners`` via ``resolve_winner()``.

Tournament overrides
--------------------
``TOURNAMENT_WINNER_OVERRIDES`` short-circuits the scrape for known cases
where Clippd's row-1 isn't actually the winner. Most common cause: a
playoff between teams tied at T1, where Clippd lists the alphabetically/
positionally first team in row 1 but a banner above the table notes the
playoff result. Add an entry here when you spot one — keyed by the
Clippd tournament ID (string).
"""

from __future__ import annotations

import sys
from typing import Optional


# Manual overrides for tournaments whose Clippd row-1 isn't the real winner.
# Keyed by Clippd tournament ID (the string in the URL). When present, the
# extractor returns this value instead of scraping the page.
#
# Known entries:
#   - "244037": 2026 Horizon League Men's Golf Championship — Oakland and
#               Wright State both finished T1; Wright State won the playoff
#               (per the note above the leaderboard on Clippd). Clippd's
#               row-1 is Oakland (alphabetical), so we override to
#               Wright State. (David, 2026-04-28)
TOURNAMENT_WINNER_OVERRIDES: dict[str, str] = {
    "244037": "Wright State",
}


def extract_winner_from_clippd(
    tournament_id: str,
    timeout_ms: int = 45_000,
    page=None,
) -> Optional[str]:
    """Return the first-row TEAM name for a Clippd tournament, or None.

    Handles both stroke-play (columns: #, +/-, TEAM, RANK, TOTAL, ...)
    and match-play (columns: POS, TEAM, TEAM RANK, WIN, LOSS, TIE) layouts
    by finding the header cell whose text is "TEAM" and using that column
    index for the first data row.

    Pass an existing Playwright `page` to reuse one browser context across
    many tournaments (the conference-history populator does this for
    throughput). Returns None on any failure so callers can fall back
    to needs-manual.

    Honours ``TOURNAMENT_WINNER_OVERRIDES`` first — if the tournament ID
    has an override, return it without launching Playwright at all.
    """
    if tournament_id in TOURNAMENT_WINNER_OVERRIDES:
        return TOURNAMENT_WINNER_OVERRIDES[tournament_id]

    if page is None:
        # One-shot mode for ad-hoc CLI testing.
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            print("ERROR: playwright not installed", file=sys.stderr)
            return None
        ua = (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        )
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                ctx = browser.new_context(user_agent=ua)
                pg = ctx.new_page()
                try:
                    return _extract_with_page(pg, tournament_id, timeout_ms)
                finally:
                    browser.close()
        except Exception as exc:
            print(f"WARN: Playwright render failed for {tournament_id}: {exc}",
                  file=sys.stderr)
            return None
    return _extract_with_page(page, tournament_id, timeout_ms)


def _extract_with_page(page, tournament_id: str, timeout_ms: int) -> Optional[str]:
    url = f"https://scoreboard.clippd.com/tournaments/{tournament_id}/scoring/team"
    try:
        page.goto(url, wait_until="networkidle", timeout=timeout_ms)
        page.wait_for_timeout(2000)
        return _read_winner_from_first_table(page)
    except Exception as exc:
        print(f"WARN: Playwright render failed for {tournament_id}: {exc}",
              file=sys.stderr)
        return None


def _read_winner_from_first_table(page) -> Optional[str]:
    tables = page.locator("table")
    if tables.count() == 0:
        return None
    table = tables.nth(0)
    rows = table.locator("tr")
    if rows.count() < 2:
        return None

    header_cells = rows.nth(0).locator("th,td")
    team_col = None
    for i in range(header_cells.count()):
        if header_cells.nth(i).inner_text().strip().upper() == "TEAM":
            team_col = i
            break
    if team_col is None:
        return None

    data_cells = rows.nth(1).locator("th,td")
    if team_col >= data_cells.count():
        return None
    winner = data_cells.nth(team_col).inner_text().strip()
    return winner or None


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: clippd_winner_extractor.py <tournamentId>", file=sys.stderr)
        sys.exit(2)
    winner = extract_winner_from_clippd(sys.argv[1])
    if winner:
        print(winner)
        sys.exit(0)
    print("NO_WINNER", file=sys.stderr)
    sys.exit(1)
