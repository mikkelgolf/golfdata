/**
 * Snapshot rankings into the archive at
 * `src/data/rankings-archive/{men,women}/YYYY-MM-DD.ts`, then regenerate
 * the per-gender `index.ts` so the helper at
 * `src/lib/rankings-archive.ts` can statically import the entries.
 *
 * Modes
 * -----
 *   --from-live
 *       Snapshot today's live rankings (`src/data/rankings-{men,women}.ts`)
 *       into the archive, dated YYYY-MM-DD (today, UTC). This is the mode
 *       wired into `daily-refresh.sh` after a successful Clippd pull.
 *
 *   --from-clippd-json <path>
 *       Read a raw Clippd leaderboard JSON (the kind written to
 *       `data/clippd/rankings-YYYY-MM-DD.json`) and write archive
 *       entries for both genders, dated by the JSON's `pulledAt` (UTC
 *       date). Used for backfilling historical snapshots from JSONs we
 *       already have on disk.
 *
 *   --regen-index
 *       Just rebuild the per-gender `index.ts` files. Useful after
 *       hand-editing or moving snapshot TS files around.
 *
 * Notes on AQ flags + coords
 * --------------------------
 * Backfilled-from-raw-JSON entries copy `isAutoQualifier` / `aqConference`
 * / `lat` / `lng` from the CURRENT live `rankings-{gender}.ts` file
 * (best-effort: AQ flags change as conference championships are decided,
 * so historical entries may misattribute AQ status. The `source` field
 * tags backfilled entries so consumers know to take AQ with a grain of
 * salt).
 */

import * as fs from "fs";
import * as path from "path";
import { rankingsMen as liveMen, type TeamData } from "../src/data/rankings-men";
import { rankingsWomen as liveWomen } from "../src/data/rankings-women";
import { normalizeConference } from "../src/data/conference-codes";

type Gender = "men" | "women";

// Mirror of CONFERENCE_OVERRIDES from scripts/scrape-clippd-teams.ts. Keep in
// sync — these patch known-bad Clippd conference assignments at backfill
// time so historical archive entries match the live rankings file.
const CONFERENCE_OVERRIDES: Record<string, string> = {
  "women:Dayton": "A10",
  "women:Duquesne": "A10",
  "women:Saint Josephs": "A10",
};

// Repo paths
const REPO_ROOT = path.join(__dirname, "..");
const ARCHIVE_ROOT = path.join(REPO_ROOT, "src", "data", "rankings-archive");

interface RawClippdRow {
  schoolName: string;
  boardName: string;
  conference: string;
  rank: number;
  averagePoints: number;
  totalPoints?: number;
  totalWeight?: number;
  regionalRank?: number;
  divisionalRank?: number;
  strokePlayEvents: number;
  strokePlayRounds?: number;
  matchPlayEvents?: number;
  matchPlayRounds?: number;
  eventsWon: number;
  eventsTop3: number;
  strengthOfSchedule: number;
  strengthOfScheduleRank: number;
  averageScore?: number;
  adjustedScore: number;
  winLossTie: string;
  division: string;
  gender: string;
  rankingDate?: string;
}

interface RawClippdPull {
  pulledAt: string;
  season: number;
  men: RawClippdRow[];
  women: RawClippdRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseWLT(s: string): { wins: number; losses: number; ties: number } {
  // "145-21-2" → { wins: 145, losses: 21, ties: 2 }. Defensive: missing
  // segments default to 0 so a malformed row doesn't crash the seed.
  const [w = "0", l = "0", t = "0"] = s.split("-");
  return {
    wins: parseInt(w, 10) || 0,
    losses: parseInt(l, 10) || 0,
    ties: parseInt(t, 10) || 0,
  };
}

function deriveEligible(wins: number, losses: number, ties: number): boolean {
  const total = wins + losses + ties;
  if (total === 0) return false;
  return wins + ties * 0.5 >= total * 0.5;
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function pulledAtToDate(pulledAt: string): string {
  // ISO timestamp → YYYY-MM-DD (UTC).
  return pulledAt.slice(0, 10);
}

interface TeamLookup {
  isAQ: Map<string, string>; // boardName → aqConference
  coords: Map<string, { lat: number; lng: number }>;
}

function buildLookupFromLive(gender: Gender): TeamLookup {
  const live = gender === "men" ? liveMen : liveWomen;
  const isAQ = new Map<string, string>();
  const coords = new Map<string, { lat: number; lng: number }>();
  for (const t of live) {
    if (t.isAutoQualifier && t.aqConference) {
      isAQ.set(t.team, t.aqConference);
    }
    if (t.lat || t.lng) {
      coords.set(t.team, { lat: t.lat, lng: t.lng });
    }
  }
  return { isAQ, coords };
}

function rowToTeamData(
  row: RawClippdRow,
  gender: Gender,
  lookup: TeamLookup
): TeamData {
  const { wins, losses, ties } = parseWLT(row.winLossTie);
  const overrideKey = `${gender}:${row.boardName}`;
  const conf =
    CONFERENCE_OVERRIDES[overrideKey] ??
    normalizeConference(row.conference, gender) ??
    row.conference;
  const aqConf = lookup.isAQ.get(row.boardName) ?? null;
  const c = lookup.coords.get(row.boardName);
  return {
    rank: row.rank,
    team: row.boardName,
    conference: conf,
    events: row.strokePlayEvents,
    wins,
    losses,
    ties,
    eligible: deriveEligible(wins, losses, ties),
    isAutoQualifier: aqConf !== null,
    aqConference: aqConf,
    lat: c?.lat ?? 0,
    lng: c?.lng ?? 0,
    avgPoints: roundTo(row.averagePoints, 2),
    strengthOfSchedule: roundTo(row.strengthOfSchedule, 4),
    strengthOfScheduleRank: row.strengthOfScheduleRank,
    adjustedScore: roundTo(row.adjustedScore, 2),
    eventsWon: row.eventsWon,
    eventsTop3: row.eventsTop3,
  };
}

function roundTo(n: number, places: number): number {
  const factor = Math.pow(10, places);
  return Math.round(n * factor) / factor;
}

// ---------------------------------------------------------------------------
// Snapshot file writer
// ---------------------------------------------------------------------------

function snapshotFilePath(gender: Gender, date: string): string {
  return path.join(ARCHIVE_ROOT, gender, `${date}.ts`);
}

function snapshotVarName(date: string): string {
  // 2026-04-29 → snap_2026_04_29 (valid TS identifier, sortable).
  return `snap_${date.replace(/-/g, "_")}`;
}

function writeSnapshotFile(
  gender: Gender,
  date: string,
  pulledAt: string,
  label: string | null,
  source: string,
  teams: TeamData[]
): void {
  ensureDir(path.join(ARCHIVE_ROOT, gender));
  const lines: string[] = [];
  lines.push(
    `// AUTO-GENERATED — do not edit by hand.`,
    `// Written by: scripts/snapshot-rankings.ts`,
    `// Source: ${source}`,
    ``,
    `import type { RankingsSnapshot } from "@/lib/rankings-archive";`,
    ``,
    `const snapshot: RankingsSnapshot = {`,
    `  date: ${JSON.stringify(date)},`,
    `  gender: ${JSON.stringify(gender)},`,
    `  pulledAt: ${JSON.stringify(pulledAt)},`,
    `  label: ${label === null ? "null" : JSON.stringify(label)},`,
    `  source: ${JSON.stringify(source)},`,
    `  teams: [`
  );
  for (const t of teams) {
    lines.push(`    ${JSON.stringify(t)},`);
  }
  lines.push(`  ],`, `};`, ``, `export default snapshot;`, ``);
  fs.writeFileSync(snapshotFilePath(gender, date), lines.join("\n"));
}

// ---------------------------------------------------------------------------
// Index regen
// ---------------------------------------------------------------------------

function listSnapshotDates(gender: Gender): string[] {
  const dir = path.join(ARCHIVE_ROOT, gender);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.ts$/.test(f))
    .map((f) => f.replace(/\.ts$/, ""))
    .sort();
}

function regenIndex(gender: Gender): void {
  const dates = listSnapshotDates(gender);
  const archiveVar = gender === "men" ? "archiveMen" : "archiveWomen";
  const latestVar = gender === "men" ? "latestDateMen" : "latestDateWomen";
  const lines: string[] = [];
  lines.push(
    `// AUTO-GENERATED — do not edit by hand.`,
    `// Regenerate with: npx tsx scripts/snapshot-rankings.ts --regen-index`,
    `//`,
    `// Maps date (YYYY-MM-DD) → snapshot for the ${gender}'s rankings archive.`,
    `// \`${latestVar}\` is the most recent date present (lexicographic sort`,
    `// works because all keys are ISO YYYY-MM-DD).`,
    ``,
    `import type { RankingsSnapshot } from "@/lib/rankings-archive";`
  );
  for (const d of dates) {
    lines.push(`import ${snapshotVarName(d)} from "./${d}";`);
  }
  lines.push(
    ``,
    `export const ${archiveVar}: Record<string, RankingsSnapshot> = {`
  );
  for (const d of dates) {
    lines.push(`  ${JSON.stringify(d)}: ${snapshotVarName(d)},`);
  }
  lines.push(`};`, ``);
  if (dates.length === 0) {
    lines.push(`export const ${latestVar}: string | null = null;`);
  } else {
    const latest = dates[dates.length - 1];
    lines.push(`export const ${latestVar}: string = ${JSON.stringify(latest)};`);
  }
  lines.push(``);
  fs.writeFileSync(path.join(ARCHIVE_ROOT, gender, "index.ts"), lines.join("\n"));
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

function snapshotFromLive(label: string | null): void {
  const date = todayUtcDate();
  const pulledAt = new Date().toISOString();
  for (const gender of ["men", "women"] as const) {
    const teams = gender === "men" ? liveMen : liveWomen;
    writeSnapshotFile(
      gender,
      date,
      pulledAt,
      label,
      "live-rankings-ts",
      teams
    );
    console.log(
      `  ✓ wrote ${snapshotFilePath(gender, date)} (${teams.length} teams)`
    );
  }
  for (const gender of ["men", "women"] as const) {
    regenIndex(gender);
    console.log(`  ✓ regen index ${gender}`);
  }
}

function snapshotFromClippdJson(jsonPath: string, label: string | null): void {
  const abs = path.isAbsolute(jsonPath)
    ? jsonPath
    : path.join(process.cwd(), jsonPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`clippd JSON not found: ${abs}`);
  }
  const raw = JSON.parse(fs.readFileSync(abs, "utf-8")) as RawClippdPull;
  const date = pulledAtToDate(raw.pulledAt);
  const lookups: Record<Gender, TeamLookup> = {
    men: buildLookupFromLive("men"),
    women: buildLookupFromLive("women"),
  };
  for (const gender of ["men", "women"] as const) {
    const rows = (gender === "men" ? raw.men : raw.women).filter(
      (r) => r.division === "NCAA Division I"
    );
    rows.sort((a, b) => a.rank - b.rank);
    const teams = rows.map((r) => rowToTeamData(r, gender, lookups[gender]));
    writeSnapshotFile(
      gender,
      date,
      raw.pulledAt,
      label,
      "clippd-leaderboard-api-historical-json",
      teams
    );
    console.log(
      `  ✓ wrote ${snapshotFilePath(gender, date)} (${teams.length} teams, from ${path.basename(abs)})`
    );
  }
  for (const gender of ["men", "women"] as const) {
    regenIndex(gender);
    console.log(`  ✓ regen index ${gender}`);
  }
}

function regenIndexOnly(): void {
  for (const gender of ["men", "women"] as const) {
    regenIndex(gender);
    console.log(`  ✓ regen index ${gender}`);
  }
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseLabel(args: string[]): string | null {
  const idx = args.indexOf("--label");
  if (idx === -1) return null;
  const v = args[idx + 1];
  return v && !v.startsWith("--") ? v : null;
}

function main(): void {
  const args = process.argv.slice(2);
  const mode = args[0];
  const label = parseLabel(args);
  switch (mode) {
    case "--from-live":
      console.log("=== snapshot-rankings: --from-live ===");
      snapshotFromLive(label);
      break;
    case "--from-clippd-json": {
      const p = args[1];
      if (!p) {
        console.error("error: --from-clippd-json requires a path argument");
        process.exit(1);
      }
      console.log(`=== snapshot-rankings: --from-clippd-json ${p} ===`);
      snapshotFromClippdJson(p, label);
      break;
    }
    case "--regen-index":
      console.log("=== snapshot-rankings: --regen-index ===");
      regenIndexOnly();
      break;
    default:
      console.error(
        "usage:\n" +
          "  npx tsx scripts/snapshot-rankings.ts --from-live [--label <name>]\n" +
          "  npx tsx scripts/snapshot-rankings.ts --from-clippd-json <path> [--label <name>]\n" +
          "  npx tsx scripts/snapshot-rankings.ts --regen-index"
      );
      process.exit(1);
  }
}

main();
