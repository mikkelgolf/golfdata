/**
 * Clippd tournaments scraper.
 *
 * Companion to scrape-clippd-teams.ts. Pulls tournament metadata from
 * /api/tournaments for both genders and writes a compact JSON of recently
 * completed D1 tournaments — used by the daily-refresh pipeline to
 * auto-detect when conference championships wrap so we can close the
 * `winner` field on src/data/championships-{men,women}-2026.ts.
 *
 * Clippd's public API exposes tournament metadata (id, name, dates, venue,
 * competing schools) + flags `isComplete` and `hasResults`, but it does
 * NOT expose a JSON leaderboard — per-tournament team standings render
 * client-side on the scoreboard SPA. Winner extraction from the HTML
 * therefore requires Playwright, which is out of scope for this first cut;
 * this scraper emits the tournament URL so downstream tooling (or Mikkel)
 * can resolve winners by visiting the page.
 *
 * Usage:
 *   npx tsx scripts/scrape-clippd-tournaments.ts --pull              # write JSON
 *   npx tsx scripts/scrape-clippd-tournaments.ts --pull --days 14    # last 14 days
 *   npx tsx scripts/scrape-clippd-tournaments.ts --print             # stdout JSON
 */

import * as fs from "fs";
import * as path from "path";

const CLIPPD_BASE = "https://scoreboard.clippd.com";
const CLIPPD_API = `${CLIPPD_BASE}/api`;

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: `${CLIPPD_BASE}/rankings`,
};

const DATA_DIR = path.join(__dirname, "..", "data", "clippd");

interface ClippdTournament {
  tournamentId: string;
  tournamentName: string;
  gender: string;
  division: string;
  eventType: string;
  startDate: string;
  endDate: string;
  venue: string | null;
  city: string | null;
  state: string | null;
  hasResults: boolean;
  isComplete: boolean;
  competingSchools: string[];
  hostName: string | null;
  hostConference: string | null;
  season: number;
}

interface CompactTournament {
  tournamentId: string;
  tournamentName: string;
  gender: "men" | "women";
  startDate: string;
  endDate: string;
  venue: string | null;
  city: string | null;
  state: string | null;
  isComplete: boolean;
  hasResults: boolean;
  numCompetingSchools: number;
  hostName: string | null;
  hostConference: string | null;
  clippdUrl: string;
}

interface ScrapeOutput {
  pulledAt: string;
  season: number;
  sinceDate: string;
  men: CompactTournament[];
  women: CompactTournament[];
}

function log(...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 19);
  console.error(`[tournaments ${ts}]`, ...args);
}

async function fetchTournaments(
  gender: "Men" | "Women",
  season: number
): Promise<ClippdTournament[]> {
  const url = `${CLIPPD_API}/tournaments?gender=${gender}&division=${encodeURIComponent(
    "NCAA Division I"
  )}&season=${season}&limit=1000`;
  const resp = await fetch(url, { headers: HEADERS });
  if (!resp.ok) {
    throw new Error(`${gender} tournaments fetch failed: HTTP ${resp.status}`);
  }
  const body = (await resp.json()) as { results?: ClippdTournament[] };
  return body.results ?? [];
}

function compact(
  t: ClippdTournament,
  gender: "men" | "women"
): CompactTournament {
  return {
    tournamentId: t.tournamentId,
    tournamentName: t.tournamentName,
    gender,
    startDate: t.startDate,
    endDate: t.endDate,
    venue: t.venue,
    city: t.city,
    state: t.state,
    isComplete: Boolean(t.isComplete),
    hasResults: Boolean(t.hasResults),
    numCompetingSchools: Array.isArray(t.competingSchools)
      ? t.competingSchools.length
      : 0,
    hostName: t.hostName ?? null,
    hostConference: t.hostConference || null,
    clippdUrl: `${CLIPPD_BASE}/tournaments/${t.tournamentId}`,
  };
}

function filterRecent(
  rows: CompactTournament[],
  sinceDate: string
): CompactTournament[] {
  return rows
    .filter((r) => r.endDate && r.endDate >= sinceDate)
    .filter((r) => r.endDate && r.endDate <= new Date().toISOString().slice(0, 10))
    .sort((a, b) => (b.endDate || "").localeCompare(a.endDate || ""));
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const pull = args.includes("--pull");
  const printOnly = args.includes("--print");
  const daysIdx = args.indexOf("--days");
  const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1] ?? "10", 10) : 10;

  if (!pull && !printOnly) {
    console.error(
      "Usage: npx tsx scripts/scrape-clippd-tournaments.ts --pull [--days N] [--print]"
    );
    return 2;
  }

  const season = 2026;
  const today = new Date();
  const since = new Date(today.getTime() - days * 86400_000);
  const sinceDate = since.toISOString().slice(0, 10);

  log(`fetching ${season} season tournaments since ${sinceDate}`);

  const [menRaw, womenRaw] = await Promise.all([
    fetchTournaments("Men", season),
    fetchTournaments("Women", season),
  ]);

  log(`raw men=${menRaw.length} women=${womenRaw.length}`);

  const men = filterRecent(menRaw.map((t) => compact(t, "men")), sinceDate);
  const women = filterRecent(
    womenRaw.map((t) => compact(t, "women")),
    sinceDate
  );

  const output: ScrapeOutput = {
    pulledAt: new Date().toISOString(),
    season,
    sinceDate,
    men,
    women,
  };

  if (pull) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const dateStr = today.toISOString().slice(0, 10);
    const outPath = path.join(DATA_DIR, `tournaments-${dateStr}.json`);
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n");
    log(`wrote ${outPath}: ${men.length} men + ${women.length} women`);
  }

  if (printOnly) {
    process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  }

  log(
    `recent completed: men=${men.filter((t) => t.isComplete).length} women=${women.filter((t) => t.isComplete).length}`
  );

  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error("[tournaments ERROR]", err);
    process.exit(1);
  }
);
