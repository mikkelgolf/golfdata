/**
 * Clippd Data Pipeline
 *
 * Pulls ranking data from the Clippd REST API (leaderboard endpoint) and
 * either stores raw JSON for analysis or generates the TypeScript data files
 * that power the Next.js app. Replaces the manual flow of exporting from
 * Google Sheets and running update-rankings.ts.
 *
 * API findings (2026-04-12):
 *   - /api/rankings/leaderboard — WORKS. Returns rich data: Broadie points,
 *     SoF, SoF rank, adjusted scores, W/L/T, event stats, logos, schoolId.
 *     311 D1 teams across all genders.
 *   - /api/tournaments — WORKS. Tournament metadata (no team results).
 *   - /api/teams, /api/schools — 404. No team-level API.
 *   - /teams/{schoolId} — HTML only. Needs Selenium for team-level data.
 *
 * For head-to-head data, team pages must be scraped via Selenium (or wait
 * for David's scripts). The leaderboard API gives us everything needed for
 * rankings and S-curve predictions.
 *
 * Usage:
 *   npx tsx scripts/scrape-clippd-teams.ts --pull              # Pull latest rankings (JSON)
 *   npx tsx scripts/scrape-clippd-teams.ts --generate           # Pull + generate TS data files
 *   npx tsx scripts/scrape-clippd-teams.ts --benchmark <label>  # Capture full benchmark
 *   npx tsx scripts/scrape-clippd-teams.ts --discover           # Probe API endpoints
 *
 * David's 3 benchmark moments:
 *   post-conferences | post-regionals | post-nationals
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

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

const DELAY_MS = 350;
const DATA_DIR = path.join(__dirname, "..", "data", "clippd");
const SRC_DATA_DIR = path.join(__dirname, "..", "src", "data");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClippdTeamRanking {
  gender: string;
  division: string;
  schoolId: string;
  schoolName: string;
  schoolLogo: string;
  schoolLogoThumbnail: string;
  conference: string;
  region: string;
  boardName: string;
  rank: number;
  rankingDate: string;
  averagePoints: number;
  totalPoints: number;
  totalWeight: number;
  regionalRank: number;
  divisionalRank: number;
  strokePlayEvents: number;
  strokePlayRounds: number;
  matchPlayEvents: number;
  matchPlayRounds: number;
  eventsWon: number;
  eventsTop3: number;
  strengthOfSchedule: number;
  strengthOfScheduleRank: number;
  averageScore: number;
  adjustedScore: number;
  winLossTie: string;
  startDate: string | null;
  endDate: string | null;
}

interface PullResult {
  pulledAt: string;
  season: number;
  men: ClippdTeamRanking[];
  women: ClippdTeamRanking[];
}

// Conference name mapping (Clippd full name -> our abbreviation)
const CONF_MAP: Record<string, string> = {
  "Southeastern Conference": "SEC",
  "Atlantic Coast Conference": "ACC",
  "Big 12 Conference": "B12",
  "Big Ten Conference": "B10",
  "West Coast Conference": "WCC",
  "Mountain West Conference": "MWC",
  "American Athletic Conference": "AAC",
  "Colonial Athletic Association": "CAA",
  "Big West Conference": "BWEST",
  "Big East Conference": "BEAST",
  "Sun Belt Conference": "SUNBELT",
  "Atlantic Sun Conference": "ASUN",
  "Southern Conference": "SOCON",
  "Conference USA": "CUSA",
  "Ohio Valley Conference": "OVC",
  "Pac-12 Conference": "PAC12",
  "Patriot League": "PATRIOT",
  "Ivy League": "IVY",
  "Metro Atlantic Athletic Conference": "MAAC",
  "Mid-Eastern Athletic Conference": "MEAC",
  "Southwestern Athletic Conference": "SWAC",
  "Northeast Conference": "NEC",
  "Horizon League": "HORIZON",
  "Southland Conference": "SOUTHLAND",
  "Western Athletic Conference": "WAC",
  "Summit League": "SUMMIT",
  "Big Sky Conference": "BIG SKY",
  "Missouri Valley Conference": "MVC",
  "Mid-American Conference": "MAC",
  "America East Conference": "AMER",
  "Atlantic 10 Conference": "A10",
};

// School coordinate lookup (campus lat/lng)
const SCHOOL_COORDS: Record<string, { lat: number; lng: number }> = {
  "Auburn": { lat: 32.6034, lng: -85.4808 },
  "Virginia": { lat: 38.0336, lng: -78.5080 },
  "Florida": { lat: 29.6436, lng: -82.3549 },
  "Texas": { lat: 30.2849, lng: -97.7341 },
  "Arkansas": { lat: 36.0686, lng: -94.1748 },
  "Oklahoma State": { lat: 36.1256, lng: -97.0665 },
  "LSU": { lat: 30.4133, lng: -91.1800 },
  "Texas Tech": { lat: 33.5843, lng: -101.8453 },
  "Arizona State": { lat: 33.4242, lng: -111.9281 },
  "Vanderbilt": { lat: 36.1447, lng: -86.8027 },
  "North Carolina": { lat: 35.9049, lng: -79.0469 },
  "Illinois": { lat: 40.1020, lng: -88.2272 },
  "Pepperdine": { lat: 34.0395, lng: -118.7095 },
  "Tennessee": { lat: 35.9544, lng: -83.9295 },
  "Ole Miss": { lat: 34.3655, lng: -89.5386 },
  "Oklahoma": { lat: 35.2058, lng: -97.4457 },
  "Alabama": { lat: 33.2140, lng: -87.5391 },
  "Stanford": { lat: 37.4275, lng: -122.1697 },
  "Georgia Tech": { lat: 33.7756, lng: -84.3963 },
  "New Mexico": { lat: 35.0844, lng: -106.6504 },
  "Charlotte": { lat: 35.3076, lng: -80.7334 },
  "Arizona": { lat: 32.2319, lng: -110.9501 },
  "Georgia": { lat: 33.9480, lng: -83.3773 },
  "BYU": { lat: 40.2519, lng: -111.6493 },
  "Florida State": { lat: 30.4418, lng: -84.2985 },
  "Notre Dame": { lat: 41.7056, lng: -86.2353 },
  "Duke": { lat: 36.0014, lng: -78.9382 },
  "Long Beach State": { lat: 33.7838, lng: -118.1141 },
  "Texas A&M": { lat: 30.6187, lng: -96.3365 },
  "Southern California": { lat: 34.0224, lng: -118.2851 },
  "UCLA": { lat: 34.0689, lng: -118.4452 },
  "Utah": { lat: 40.7649, lng: -111.8421 },
  "Wake Forest": { lat: 36.1335, lng: -80.2768 },
  "Louisville": { lat: 38.2116, lng: -85.7585 },
  "San Diego State": { lat: 32.7757, lng: -117.0719 },
  "Clemson": { lat: 34.6834, lng: -82.8374 },
  "South Carolina": { lat: 33.9940, lng: -81.0301 },
  "TCU": { lat: 32.7098, lng: -97.3628 },
  "Washington": { lat: 47.6553, lng: -122.3035 },
  "Kansas": { lat: 38.9543, lng: -95.2558 },
  "Purdue": { lat: 40.4237, lng: -86.9212 },
  "UNCW": { lat: 34.2274, lng: -77.8729 },
  "Northwestern": { lat: 42.0565, lng: -87.6753 },
  "Colorado": { lat: 40.0076, lng: -105.2659 },
  "Ohio State": { lat: 40.0067, lng: -83.0305 },
  "Oregon": { lat: 44.0448, lng: -123.0726 },
  "Oregon State": { lat: 44.5646, lng: -123.2620 },
  "Michigan": { lat: 42.2780, lng: -83.7382 },
  "Michigan State": { lat: 42.7249, lng: -84.4806 },
  "Baylor": { lat: 31.5497, lng: -97.1143 },
  "San Jose State": { lat: 37.3382, lng: -121.8863 },
  "UNLV": { lat: 36.1083, lng: -115.1390 },
  "Minnesota": { lat: 44.9740, lng: -93.2277 },
  "Iowa": { lat: 41.6611, lng: -91.5302 },
  "SMU": { lat: 32.8428, lng: -96.7835 },
  "UCF": { lat: 28.6024, lng: -81.2001 },
  "Memphis": { lat: 35.1175, lng: -89.9372 },
  "NC State": { lat: 35.7872, lng: -78.6706 },
  "East Tennessee State": { lat: 36.3032, lng: -82.3678 },
  "Mississippi State": { lat: 33.4557, lng: -88.7890 },
  // ---- Canonical coords for teams that have been hand-fixed before -------
  // Sourced from prior fix commits: edca021, bceadd0, 4791fae, plus
  // already-correct values in MANUAL_OVERRIDES (build-all-teams.mjs) and
  // the campus locations of the current 14-seeds. Adding these here stops
  // the daily refresh from writing 0,0 for these teams.
  "West Georgia": { lat: 33.5729, lng: -85.0978 },           // Carrollton, GA
  "Utah Tech": { lat: 37.1041, lng: -113.5659 },             // St. George, UT
  "Idaho": { lat: 46.7269, lng: -116.9989 },                 // Moscow, ID
  "SIU Edwardsville": { lat: 38.7942, lng: -89.9947 },       // Edwardsville, IL
  "Georgetown": { lat: 38.9076, lng: -77.0723 },             // Washington, DC
  "Merrimack": { lat: 42.6681, lng: -71.1211 },              // North Andover, MA
  "Monmouth": { lat: 40.2779, lng: -74.0038 },               // West Long Branch, NJ
  "Rider": { lat: 40.2817, lng: -74.7317 },                  // Lawrenceville, NJ
  "Saint Francis": { lat: 40.5101, lng: -78.6250 },          // Loretto, PA
  "Richmond": { lat: 37.5790, lng: -77.5385 },               // Richmond, VA
  "North Florida": { lat: 30.2694, lng: -81.5065 },          // Jacksonville, FL
  "Queens-Charlotte": { lat: 35.2029, lng: -80.8358 },       // Charlotte, NC
  "Manhattan": { lat: 40.8904, lng: -73.9041 },              // Bronx, NY
  "UAlbany": { lat: 42.6866, lng: -73.8230 },                // Albany, NY
  "Montana": { lat: 46.8597, lng: -113.9852 },               // Missoula, MT
  "UIC": { lat: 41.8715, lng: -87.6502 },                    // Chicago, IL
  "Florida A&M": { lat: 30.4239, lng: -84.2876 },            // Tallahassee, FL
  "Fairfield": { lat: 41.1412, lng: -73.2637 },              // Fairfield, CT
  "New Haven": { lat: 41.2707, lng: -72.9470 },              // West Haven, CT
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const resp = await fetch(url, { headers: HEADERS });
    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function timestamp(): string {
  return new Date().toISOString().split("T")[0];
}

function parseWLT(wlt: string): { wins: number; losses: number; ties: number } {
  const parts = wlt.split("-").map(Number);
  return { wins: parts[0] ?? 0, losses: parts[1] ?? 0, ties: parts[2] ?? 0 };
}

function abbreviateConf(fullName: string): string {
  return CONF_MAP[fullName] ?? fullName;
}

function lookupCoords(boardName: string): { lat: number; lng: number } | null {
  return SCHOOL_COORDS[boardName] ?? null;
}

/**
 * Read the existing src/data/rankings-{gender}.ts and extract any non-zero
 * lat/lng already present. This is the "preserve existing" guardrail: if a
 * team isn't in SCHOOL_COORDS but already has good coords in the destination
 * file (e.g. a past hand-fix), we carry those values forward instead of
 * silently writing 0,0 and reverting the fix.
 */
function loadExistingCoords(
  gender: "men" | "women"
): Map<string, { lat: number; lng: number }> {
  const map = new Map<string, { lat: number; lng: number }>();
  const existingPath = path.join(SRC_DATA_DIR, `rankings-${gender}.ts`);
  if (!fs.existsSync(existingPath)) return map;
  const content = fs.readFileSync(existingPath, "utf-8");
  // Match: team: "<name>", ... lat: <num>, lng: <num>
  const re = /team:\s*"([^"]+)"[^}]*?lat:\s*(-?[\d.]+),\s*lng:\s*(-?[\d.]+)/g;
  for (const m of content.matchAll(re)) {
    const lat = Number(m[2]);
    const lng = Number(m[3]);
    if (lat !== 0 || lng !== 0) {
      map.set(m[1], { lat, lng });
    }
  }
  return map;
}

/**
 * Read src/data/all-teams-{gender}-2026.ts and extract any non-zero
 * lat/lng. The all-teams file is built by `scripts/build-all-teams.mjs`,
 * which has CAMPUS_COORDS + MANUAL_OVERRIDES + a Photon geocoder
 * fallback — so it's a much richer coord source than just
 * `SCHOOL_COORDS` here. Used as the third-priority fallback after the
 * canonical map and the existing rankings file. Without this lookup,
 * any team Clippd returns that isn't hardcoded ends up at 0,0 even
 * though the same team's coords are sitting in the all-teams file
 * already (this caused ~150 eligible/AQ teams to be at 0,0 prior to
 * the 2026-04-25 backfill).
 */
function loadAllTeamsCoords(
  gender: "men" | "women"
): Map<string, { lat: number; lng: number }> {
  const map = new Map<string, { lat: number; lng: number }>();
  const p = path.join(SRC_DATA_DIR, `all-teams-${gender}-2026.ts`);
  if (!fs.existsSync(p)) return map;
  const content = fs.readFileSync(p, "utf-8");
  const re = /team:\s*"([^"]+)"[^}]*?lat:\s*(-?[\d.]+),\s*lng:\s*(-?[\d.]+)/g;
  for (const m of content.matchAll(re)) {
    const lat = Number(m[2]);
    const lng = Number(m[3]);
    if (lat !== 0 || lng !== 0) {
      map.set(m[1], { lat, lng });
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Pull rankings from leaderboard API
// ---------------------------------------------------------------------------

async function pullRankings(
  gender: "Men" | "Women",
  division: string = "NCAA Division I",
  season: number = 2026
): Promise<ClippdTeamRanking[]> {
  const all: ClippdTeamRanking[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const url =
      `${CLIPPD_API}/rankings/leaderboard` +
      `?rankingType=Team&gender=${gender}` +
      `&division=${encodeURIComponent(division)}` +
      `&season=${season}&limit=${limit}&offset=${offset}`;

    const data = await fetchJson<{ results: ClippdTeamRanking[]; size: number }>(url);
    if (!data?.results?.length) break;

    all.push(...data.results);
    offset += data.results.length;

    if (offset >= data.size) break;
    await sleep(DELAY_MS);
  }

  return all;
}

async function pullAll(): Promise<PullResult> {
  console.log("=== Pulling Clippd rankings ===\n");

  console.log("  D1 Men...");
  const men = await pullRankings("Men");
  console.log(`    ${men.length} teams`);

  console.log("  D1 Women...");
  const women = await pullRankings("Women");
  console.log(`    ${women.length} teams`);

  const result: PullResult = {
    pulledAt: new Date().toISOString(),
    season: 2026,
    men,
    women,
  };

  ensureDir(DATA_DIR);
  const outPath = path.join(DATA_DIR, `rankings-${timestamp()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`\n  Saved to ${outPath}`);

  // Print summary
  for (const [label, teams] of [
    ["Men", men],
    ["Women", women],
  ] as const) {
    console.log(`\n  ${label} Top 10:`);
    for (const t of teams.slice(0, 10)) {
      console.log(
        `    #${t.rank} ${t.boardName} (${abbreviateConf(t.conference)}) — ` +
          `${t.averagePoints.toFixed(1)} pts, SoS: ${t.strengthOfSchedule.toFixed(3)} (#${t.strengthOfScheduleRank}), ` +
          `${t.winLossTie}`
      );
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Generate TypeScript data files from pulled rankings
// ---------------------------------------------------------------------------

function generateTsFile(
  teams: ClippdTeamRanking[],
  gender: "men" | "women",
  autoQualifiers: Map<string, string>,
  existingCoords: Map<string, { lat: number; lng: number }> = new Map(),
  allTeamsCoords: Map<string, { lat: number; lng: number }> = new Map()
): string {
  const lines: string[] = [];
  const importLine =
    gender === "men"
      ? `export interface TeamData {\n  rank: number;\n  team: string;\n  conference: string;\n  events: number;\n  wins: number;\n  losses: number;\n  ties: number;\n  eligible: boolean;\n  isAutoQualifier: boolean;\n  aqConference: string | null;\n  lat: number;\n  lng: number;\n  avgPoints?: number;\n  strengthOfSchedule?: number;\n  strengthOfScheduleRank?: number;\n  adjustedScore?: number;\n  eventsWon?: number;\n  eventsTop3?: number;\n}\n`
      : `import type { TeamData } from "./rankings-men";\n`;

  lines.push(importLine);
  lines.push(
    `/**\n * NCAA D1 ${gender === "men" ? "Men's" : "Women's"} golf rankings - 2025-26 season.\n *\n * Auto-generated from Clippd leaderboard API on ${timestamp()}.\n * Source: scoreboard.clippd.com/rankings\n */`
  );
  lines.push(
    `export const rankings${gender === "men" ? "Men" : "Women"}: TeamData[] = [`
  );

  for (const t of teams) {
    const { wins, losses, ties } = parseWLT(t.winLossTie);
    const conf = abbreviateConf(t.conference);
    // Coordinate lookup priority:
    //   1. SCHOOL_COORDS (canonical hardcoded map in this file)
    //   2. Existing non-zero coords already in src/data/rankings-{gender}.ts
    //      (preserves past hand-fixes that haven't been added to SCHOOL_COORDS yet)
    //   3. Coords in src/data/all-teams-{gender}-2026.ts (CAMPUS_COORDS +
    //      MANUAL_OVERRIDES + Photon geocoder via build-all-teams.mjs)
    //   4. (0, 0) — last resort; will be flagged by verify-team-coords.ts
    const coords =
      lookupCoords(t.boardName) ??
      existingCoords.get(t.boardName) ??
      allTeamsCoords.get(t.boardName) ??
      null;
    const eligible = wins + ties * 0.5 >= (wins + losses + ties) * 0.5;
    const isAQ = autoQualifiers.has(t.boardName);
    const aqConf = autoQualifiers.get(t.boardName) ?? null;

    lines.push(
      `  { rank: ${t.rank}, team: "${t.boardName}", conference: "${conf}", ` +
        `events: ${t.strokePlayEvents}, wins: ${wins}, losses: ${losses}, ties: ${ties}, ` +
        `eligible: ${eligible}, isAutoQualifier: ${isAQ}, ` +
        `aqConference: ${aqConf ? `"${aqConf}"` : "null"}, ` +
        `lat: ${coords?.lat ?? 0}, lng: ${coords?.lng ?? 0}, ` +
        `avgPoints: ${t.averagePoints.toFixed(2)}, ` +
        `strengthOfSchedule: ${t.strengthOfSchedule.toFixed(4)}, ` +
        `strengthOfScheduleRank: ${t.strengthOfScheduleRank}, ` +
        `adjustedScore: ${t.adjustedScore.toFixed(2)}, ` +
        `eventsWon: ${t.eventsWon}, eventsTop3: ${t.eventsTop3} },`
    );
  }

  lines.push("];");
  return lines.join("\n");
}

async function generateTsFiles(result: PullResult): Promise<void> {
  console.log("\n=== Generating TypeScript data files ===\n");

  // Auto-qualifiers need to be manually maintained (conference champions)
  // For now, read existing AQ data from current files
  const existingMenPath = path.join(SRC_DATA_DIR, "rankings-men.ts");
  const existingWomenPath = path.join(SRC_DATA_DIR, "rankings-women.ts");

  const menAQs = new Map<string, string>();
  const womenAQs = new Map<string, string>();

  if (fs.existsSync(existingMenPath)) {
    const content = fs.readFileSync(existingMenPath, "utf-8");
    const aqMatches = content.matchAll(
      /team:\s*"([^"]+)".*isAutoQualifier:\s*true.*aqConference:\s*"([^"]+)"/g
    );
    for (const m of aqMatches) {
      menAQs.set(m[1], m[2]);
    }
  }

  if (fs.existsSync(existingWomenPath)) {
    const content = fs.readFileSync(existingWomenPath, "utf-8");
    const aqMatches = content.matchAll(
      /team:\s*"([^"]+)".*isAutoQualifier:\s*true.*aqConference:\s*"([^"]+)"/g
    );
    for (const m of aqMatches) {
      womenAQs.set(m[1], m[2]);
    }
  }

  console.log(`  Existing AQs: Men ${menAQs.size}, Women ${womenAQs.size}`);

  // Filter to D1 only and sort by rank
  const menD1 = result.men
    .filter((t) => t.division === "NCAA Division I")
    .sort((a, b) => a.rank - b.rank);
  const womenD1 = result.women
    .filter((t) => t.division === "NCAA Division I")
    .sort((a, b) => a.rank - b.rank);

  // Load existing coords from src/data so the preserve-existing fallback
  // can carry forward any hand-fix that isn't yet in SCHOOL_COORDS.
  const existingMenCoords = loadExistingCoords("men");
  const existingWomenCoords = loadExistingCoords("women");
  // Also load coords from all-teams-{gender}-2026.ts (built by
  // build-all-teams.mjs) as a third-priority fallback.
  const allTeamsMenCoords = loadAllTeamsCoords("men");
  const allTeamsWomenCoords = loadAllTeamsCoords("women");
  console.log(
    `  Existing coords cached: men ${existingMenCoords.size}, women ${existingWomenCoords.size}`
  );
  console.log(
    `  All-teams coords cached: men ${allTeamsMenCoords.size}, women ${allTeamsWomenCoords.size}`
  );

  // Check for missing coordinates (after SCHOOL_COORDS, preserve-existing,
  // and all-teams fallbacks have all had a chance to resolve).
  const missingCoords: string[] = [];
  for (const t of menD1) {
    if (
      !lookupCoords(t.boardName) &&
      !existingMenCoords.has(t.boardName) &&
      !allTeamsMenCoords.has(t.boardName)
    ) {
      missingCoords.push(t.boardName);
    }
  }
  for (const t of womenD1) {
    if (
      !lookupCoords(t.boardName) &&
      !existingWomenCoords.has(t.boardName) &&
      !allTeamsWomenCoords.has(t.boardName)
    ) {
      missingCoords.push(t.boardName);
    }
  }
  if (missingCoords.length > 0) {
    console.log(`\n  ⚠ Missing coordinates for ${missingCoords.length} schools:`);
    const unique = [...new Set(missingCoords)];
    for (const name of unique.slice(0, 20)) {
      console.log(`    - ${name}`);
    }
    if (unique.length > 20) console.log(`    ... and ${unique.length - 20} more`);
    console.log(
      "\n  Add these to SCHOOL_COORDS in this script, then re-run with --generate."
    );
  }

  // Write files (passes both existing-coords and all-teams-coords maps so
  // previous hand-fixes AND the broader Photon-geocoded set survive).
  const menTs = generateTsFile(
    menD1,
    "men",
    menAQs,
    existingMenCoords,
    allTeamsMenCoords
  );
  const womenTs = generateTsFile(
    womenD1,
    "women",
    womenAQs,
    existingWomenCoords,
    allTeamsWomenCoords
  );

  const menOutPath = path.join(DATA_DIR, `rankings-men-${timestamp()}.ts`);
  const womenOutPath = path.join(DATA_DIR, `rankings-women-${timestamp()}.ts`);

  fs.writeFileSync(menOutPath, menTs);
  fs.writeFileSync(womenOutPath, womenTs);

  console.log(`\n  Generated:`);
  console.log(`    ${menOutPath} (${menD1.length} teams)`);
  console.log(`    ${womenOutPath} (${womenD1.length} teams)`);
  console.log(
    `\n  Review these files, then copy to src/data/ to update the app:`
  );
  console.log(`    cp ${menOutPath} ${path.join(SRC_DATA_DIR, "rankings-men.ts")}`);
  console.log(`    cp ${womenOutPath} ${path.join(SRC_DATA_DIR, "rankings-women.ts")}`);
}

// ---------------------------------------------------------------------------
// Benchmark snapshot
// ---------------------------------------------------------------------------

async function captureBenchmark(label: string): Promise<void> {
  console.log(`=== Capturing benchmark: ${label} ===\n`);

  const result = await pullAll();

  // Also pull tournament data
  console.log("\n  Pulling tournament metadata...");
  const allTournaments: Record<string, unknown>[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const url =
      `${CLIPPD_API}/tournaments?season=2026&limit=${limit}&offset=${offset}` +
      `&sort[0][attribute]=endDate&sort[0][order]=desc`;
    const data = await fetchJson<{ results: Record<string, unknown>[]; size: number }>(url);
    if (!data?.results?.length) break;
    allTournaments.push(...data.results);
    offset += data.results.length;
    if (offset >= data.size) break;
    await sleep(DELAY_MS);
  }
  console.log(`    ${allTournaments.length} tournaments`);

  const snapshot = {
    label,
    capturedAt: new Date().toISOString(),
    season: 2026,
    rankings: result,
    tournaments: {
      total: allTournaments.length,
      completed: allTournaments.filter((t) => t.isComplete).length,
      data: allTournaments,
    },
  };

  ensureDir(DATA_DIR);
  const outPath = path.join(DATA_DIR, `benchmark-${label}-${timestamp()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(`\n  Benchmark saved to ${outPath}`);
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

async function discover(): Promise<void> {
  console.log("=== Clippd API Discovery ===\n");

  const endpoints = [
    { path: "/rankings/leaderboard?rankingType=Team&gender=Men&division=NCAA+Division+I&season=2026&limit=2", desc: "Leaderboard (D1 Men)" },
    { path: "/rankings/leaderboard?rankingType=Team&gender=Women&division=NCAA+Division+I&season=2026&limit=2", desc: "Leaderboard (D1 Women)" },
    { path: "/rankings/leaderboard?rankingType=Individual&gender=Men&division=NCAA+Division+I&season=2026&limit=2", desc: "Individual rankings" },
    { path: "/tournaments?season=2026&limit=2", desc: "Tournaments" },
    { path: "/teams", desc: "Teams directory" },
    { path: "/schools", desc: "Schools directory" },
  ];

  for (const ep of endpoints) {
    const url = `${CLIPPD_API}${ep.path}`;
    try {
      const resp = await fetch(url, { headers: HEADERS });
      const ct = resp.headers.get("content-type") ?? "";
      if (resp.ok && ct.includes("json")) {
        const data = (await resp.json()) as Record<string, unknown>;
        const keys = Object.keys(data);
        const size = (data.size as number) ?? (data.results as unknown[])?.length ?? "?";
        console.log(`  ✓ ${ep.desc}: ${resp.status} — keys: [${keys.join(", ")}], size: ${size}`);
      } else {
        console.log(`  ✗ ${ep.desc}: ${resp.status}`);
      }
    } catch (e) {
      console.log(`  ✗ ${ep.desc}: ERROR`);
    }
    await sleep(DELAY_MS);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = args[0];

  switch (mode) {
    case "--pull":
      await pullAll();
      break;

    case "--generate": {
      const result = await pullAll();
      await generateTsFiles(result);
      break;
    }

    case "--benchmark": {
      const label = args[1] ?? "manual";
      await captureBenchmark(label);
      break;
    }

    case "--discover":
      await discover();
      break;

    default:
      console.log("Clippd Data Pipeline");
      console.log("Pulls ranking data from Clippd's REST API.\n");
      console.log("Commands:");
      console.log("  --pull              Pull latest D1 rankings (JSON)");
      console.log("  --generate          Pull + generate TypeScript data files");
      console.log("  --benchmark <label> Pull + full tournament snapshot");
      console.log("  --discover          Probe API for available endpoints\n");
      console.log("Labels: post-conferences, post-regionals, post-nationals");
      break;
  }
}

main().catch(console.error);
