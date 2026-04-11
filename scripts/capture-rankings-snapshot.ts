/**
 * Rankings Snapshot Capture Script
 *
 * Captures a timestamped snapshot of the current Broadie/Clippd rankings
 * and saves it locally. Designed to run at David's 3 benchmark moments:
 *
 *   1. Post-conference championships (before regionals)
 *   2. Post-regionals (before nationals)
 *   3. Post-nationals
 *
 * These snapshots let us analyze how rankings changed across the postseason
 * without the noise of later events. Critical for the Schedule Analyzer
 * and Team Season Reports.
 *
 * Usage:
 *   npx tsx scripts/capture-rankings-snapshot.ts --label "post-conference"
 *   npx tsx scripts/capture-rankings-snapshot.ts --label "post-regionals"
 *   npx tsx scripts/capture-rankings-snapshot.ts --label "post-nationals"
 *
 * Output: saves to snapshots/YYYY-MM-DD-{label}.json
 *
 * Data source: Currently reads from the app's own data files (rankings-men.ts).
 * When we have a live scraper for scoreboard.clippd.com/rankings, this script
 * will pull directly from there instead.
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SNAPSHOTS_DIR = path.join(__dirname, "..", "snapshots");

const VALID_LABELS = [
  "weekly",
  "pre-conference",
  "post-conference",
  "pre-regionals",
  "post-regionals",
  "pre-nationals",
  "post-nationals",
  "custom",
];

// ---------------------------------------------------------------------------
// Capture current rankings from the app's data files
// ---------------------------------------------------------------------------

interface SnapshotTeam {
  rank: number;
  team: string;
  conference: string;
  events: number;
  wins: number;
  losses: number;
  ties: number;
  eligible: boolean;
  isAutoQualifier: boolean;
  aqConference: string | null;
}

async function captureFromDataFiles(gender: "men" | "women"): Promise<SnapshotTeam[]> {
  const dataFile =
    gender === "men"
      ? path.join(__dirname, "..", "src", "data", "rankings-men.ts")
      : path.join(__dirname, "..", "src", "data", "rankings-women.ts");

  if (!fs.existsSync(dataFile)) {
    console.error(`Data file not found: ${dataFile}`);
    return [];
  }

  const content = fs.readFileSync(dataFile, "utf-8");

  // Extract team objects from the TypeScript array
  const teams: SnapshotTeam[] = [];
  const teamRegex =
    /\{\s*rank:\s*(\d+),\s*team:\s*"([^"]+)",\s*conference:\s*"([^"]*)",\s*events:\s*(\d+),\s*wins:\s*(\d+),\s*losses:\s*(\d+),\s*ties:\s*(\d+),\s*eligible:\s*(true|false),\s*isAutoQualifier:\s*(true|false),\s*aqConference:\s*("([^"]*)"|\bnull\b)/g;

  let match;
  while ((match = teamRegex.exec(content)) !== null) {
    teams.push({
      rank: parseInt(match[1], 10),
      team: match[2],
      conference: match[3],
      events: parseInt(match[4], 10),
      wins: parseInt(match[5], 10),
      losses: parseInt(match[6], 10),
      ties: parseInt(match[7], 10),
      eligible: match[8] === "true",
      isAutoQualifier: match[9] === "true",
      aqConference: match[11] || null,
    });
  }

  return teams;
}

// ---------------------------------------------------------------------------
// Save snapshot
// ---------------------------------------------------------------------------

interface Snapshot {
  label: string;
  capturedAt: string;
  gender: string;
  teamCount: number;
  source: string;
  teams: SnapshotTeam[];
}

function saveSnapshot(snapshot: Snapshot): string {
  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  }

  const date = new Date().toISOString().split("T")[0];
  const filename = `${date}-${snapshot.gender}-${snapshot.label}.json`;
  const filepath = path.join(SNAPSHOTS_DIR, filename);

  fs.writeFileSync(filepath, JSON.stringify(snapshot, null, 2), "utf-8");
  return filepath;
}

// ---------------------------------------------------------------------------
// Compare snapshots
// ---------------------------------------------------------------------------

function compareSnapshots(current: SnapshotTeam[], previousPath: string): void {
  if (!fs.existsSync(previousPath)) {
    console.log("No previous snapshot to compare against.");
    return;
  }

  const previous: Snapshot = JSON.parse(fs.readFileSync(previousPath, "utf-8"));
  const prevMap = new Map(previous.teams.map((t) => [t.team, t]));

  const movers: { team: string; from: number; to: number; delta: number }[] = [];
  const newTeams: string[] = [];
  const droppedTeams: string[] = [];

  for (const team of current) {
    const prev = prevMap.get(team.team);
    if (!prev) {
      newTeams.push(team.team);
    } else if (prev.rank !== team.rank) {
      movers.push({
        team: team.team,
        from: prev.rank,
        to: team.rank,
        delta: prev.rank - team.rank,
      });
    }
  }

  const currentNames = new Set(current.map((t) => t.team));
  for (const prev of previous.teams) {
    if (!currentNames.has(prev.team)) {
      droppedTeams.push(prev.team);
    }
  }

  movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  console.log(`\n--- Comparison with ${path.basename(previousPath)} ---`);

  if (movers.length > 0) {
    console.log(`\nBiggest movers (top 10):`);
    movers.slice(0, 10).forEach((m) => {
      const dir = m.delta > 0 ? "up" : "down";
      console.log(`  ${m.team}: #${m.from} -> #${m.to} (${dir} ${Math.abs(m.delta)})`);
    });
  }

  if (newTeams.length > 0) {
    console.log(`\nNew in field: ${newTeams.join(", ")}`);
  }

  if (droppedTeams.length > 0) {
    console.log(`\nDropped from field: ${droppedTeams.join(", ")}`);
  }

  if (movers.length === 0 && newTeams.length === 0 && droppedTeams.length === 0) {
    console.log("No changes from previous snapshot.");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const labelIdx = args.indexOf("--label");
  const genderIdx = args.indexOf("--gender");
  const compareIdx = args.indexOf("--compare");

  if (labelIdx === -1) {
    console.log(`
Rankings Snapshot Capture

Saves a timestamped copy of the current rankings for later analysis.
David's 3-benchmark plan: post-conference, post-regionals, post-nationals.

Usage:
  npx tsx scripts/capture-rankings-snapshot.ts --label <label> [--gender men|women] [--compare <path>]

Labels: ${VALID_LABELS.join(", ")}

Options:
  --label     Snapshot label (required)
  --gender    men or women (default: men)
  --compare   Path to a previous snapshot to show ranking changes

Examples:
  npx tsx scripts/capture-rankings-snapshot.ts --label weekly
  npx tsx scripts/capture-rankings-snapshot.ts --label post-conference --gender men
  npx tsx scripts/capture-rankings-snapshot.ts --label post-regionals --compare snapshots/2026-04-28-men-post-conference.json
`);
    process.exit(1);
  }

  const label = args[labelIdx + 1];
  const gender = (genderIdx !== -1 ? args[genderIdx + 1] : "men") as "men" | "women";
  const comparePath = compareIdx !== -1 ? args[compareIdx + 1] : null;

  if (!VALID_LABELS.includes(label)) {
    console.warn(`Warning: '${label}' is not a standard label. Using it anyway.`);
  }

  console.log(`Capturing ${gender}'s rankings snapshot (${label})...`);

  const teams = await captureFromDataFiles(gender);

  if (teams.length === 0) {
    console.error("No teams found. Is the data file populated?");
    process.exit(1);
  }

  const snapshot: Snapshot = {
    label,
    capturedAt: new Date().toISOString(),
    gender,
    teamCount: teams.length,
    source: `src/data/rankings-${gender}.ts`,
    teams,
  };

  const filepath = saveSnapshot(snapshot);
  console.log(`Saved ${teams.length} teams to ${filepath}`);

  if (comparePath) {
    compareSnapshots(teams, comparePath);
  }

  // List existing snapshots
  if (fs.existsSync(SNAPSHOTS_DIR)) {
    const existing = fs.readdirSync(SNAPSHOTS_DIR).filter((f) => f.endsWith(".json"));
    if (existing.length > 1) {
      console.log(`\nAll snapshots (${existing.length}):`);
      existing.forEach((f) => console.log(`  ${f}`));
    }
  }
}

main();
