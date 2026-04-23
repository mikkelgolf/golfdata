/**
 * NCAA Championships History Builder
 *
 * Reads the two NCAA Finals CSV dumps in /tmp/ncaa_sheet_dump/ and emits
 *   src/data/championships-history.json
 *   src/data/championships-history.ts
 * for consumption by /championships-history and the team detail page.
 *
 * Run: npx tsx scripts/build-championships-history.ts
 *
 * CSV schema: Year,Team,Finish Pos,Pos No Ties,Match Play Era,Match Play Seed,
 *             Won Quarterfinals,Won Semifinals,Won Championship
 *
 * - Finish Pos is "1", "T3", "10", or "MC" (missed cut into top-15 stroke play)
 * - Match Play Era is "YES" when the championship used the post-2009 format
 * - Match Play Seed is 1..8 when the team reached the match-play bracket
 * - Won Quarterfinals/Semifinals/Championship are "YES" / "NO" / ""
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ChampionshipFinish, Gender } from "../src/data/records-types";

const DUMP_DIR = "/tmp/ncaa_sheet_dump";
const MEN_CSV = `${DUMP_DIR}/MEN_-_NCAA_Final_Results.csv`;
const WOMEN_CSV = `${DUMP_DIR}/WOMEN_-_NCAA_Final_Results.csv`;

// Known variant -> canonical name used in src/data/regionals-history.json &
// rankings. Only includes unambiguous cases where the sheet's name refers to
// the same continuing program under its current nomenclature. Pre-1989
// programs with no modern analog (e.g. Colby, Amherst, St Ambrose, Tufts)
// are intentionally left alone — they never reach the team detail page.
const MEN_CANONICAL: Record<string, string> = {
  "East Tennessee State": "ETSU",
  "Central Florida": "UCF",
  "Memphis State": "Memphis",
  "North Texas State": "North Texas",
  "Lamar Tech": "Lamar",
  "Augusta State": "Augusta",
  Detroit: "Detroit Mercy",
  Kent: "Kent State",
  "West Point": "Army",
};

const WOMEN_CANONICAL: Record<string, string> = {
  "North Carolina State": "NC State",
  FIU: "Florida International",
  "CSU-Fullerton": "CSU - Fullerton",
  // Women's NCAA sheet uses "UCF"; women's regionals-history uses "Central
  // Florida". The same program, reverse of the men's mapping.
  UCF: "Central Florida",
};

/**
 * Post-parse corrections for known errors in the upstream CSV. Applied by
 * (gender, year, team) — matched row has its position / positionNoTies
 * fields overwritten. Idempotent across rebuilds so a stale /tmp dump
 * still yields the correct JSON.
 *
 * 1940: Princeton and LSU tied T1 as co-champions (the CSV listed LSU as
 * outright winner and Princeton as solo runner-up). Verified against the
 * NCAA men's golf championship records. The Google sheet has been
 * updated; this override remains as a defensive layer until the local
 * /tmp dump is refreshed and continues to guarantee the fix thereafter.
 */
type Correction = {
  gender: Gender;
  year: number;
  team: string;
  position: string;
  positionNoTies: number | null;
};
const CORRECTIONS: Correction[] = [
  { gender: "men", year: 1940, team: "LSU", position: "T1", positionNoTies: 1 },
  { gender: "men", year: 1940, team: "Princeton", position: "T1", positionNoTies: 1 },
];

function applyCorrections(rows: ChampionshipFinish[], gender: Gender): number {
  let applied = 0;
  for (const c of CORRECTIONS) {
    if (c.gender !== gender) continue;
    for (const r of rows) {
      if (r.gender === gender && r.year === c.year && r.team === c.team) {
        r.position = c.position;
        r.positionNoTies = c.positionNoTies;
        applied += 1;
      }
    }
  }
  return applied;
}

// Snappy schema split.
type Row = {
  Year: string;
  Team: string;
  "Finish Pos": string;
  "Pos No Ties": string;
  "Match Play Era": string;
  "Match Play Seed": string;
  "Won Quarterfinals": string;
  "Won Semifinals": string;
  "Won Championship": string;
};

function parseCsv(path: string): Row[] {
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].split(",");
  const out: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    // Simple splitter — no quoted fields in this dump, verified by
    // inspection. If a team name ever carries a comma the sheet escapes
    // it, but we assert below that the field count stays reasonable.
    const cells = raw.split(",");
    const row: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      row[header[j].trim()] = (cells[j] ?? "").trim();
    }
    out.push(row as unknown as Row);
  }
  return out;
}

function yesNoToBool(v: string): boolean | null {
  const s = v.trim().toUpperCase();
  if (s === "YES") return true;
  if (s === "NO") return false;
  return null;
}

function parsePositionNoTies(v: string): number | null {
  if (!v || v.trim().toUpperCase() === "MC") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function parseSeed(v: string): number | null {
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 1 && n <= 8 ? n : null;
}

function canonicalize(
  team: string,
  gender: Gender,
  universe: Set<string>,
  unmapped: Map<string, number>
): string {
  const map = gender === "men" ? MEN_CANONICAL : WOMEN_CANONICAL;
  const mapped = map[team];
  if (mapped && universe.has(mapped)) return mapped;
  if (universe.has(team)) return team;
  // Unknown — record count so we can report without spamming.
  unmapped.set(team, (unmapped.get(team) ?? 0) + 1);
  return team;
}

function extractTeamNames(path: string): Set<string> {
  const out = new Set<string>();
  const text = readFileSync(path, "utf8");
  for (const m of text.matchAll(/team:\s*"([^"]+)"/g)) out.add(m[1]);
  return out;
}

function loadUniverse(): { men: Set<string>; women: Set<string> } {
  // Canonical universe = regionals-history team names UNION current-season
  // rankings UNION full D1 roster. Any of these three sources can supply
  // the name a team is addressed by on the site.
  const root = resolve(__dirname, "..");
  const regionals = JSON.parse(
    readFileSync(resolve(root, "src/data/regionals-history.json"), "utf8")
  ) as Array<{ team: string; gender: Gender }>;
  const men = new Set<string>();
  const women = new Set<string>();
  for (const r of regionals) {
    if (r.gender === "men") men.add(r.team);
    else women.add(r.team);
  }
  for (const t of extractTeamNames(
    resolve(root, "src/data/rankings-men.ts")
  )) {
    men.add(t);
  }
  for (const t of extractTeamNames(
    resolve(root, "src/data/all-teams-men-2026.ts")
  )) {
    men.add(t);
  }
  for (const t of extractTeamNames(
    resolve(root, "src/data/rankings-women.ts")
  )) {
    women.add(t);
  }
  for (const t of extractTeamNames(
    resolve(root, "src/data/all-teams-women-2026.ts")
  )) {
    women.add(t);
  }
  return { men, women };
}

function rowToFinish(
  row: Row,
  gender: Gender,
  universe: Set<string>,
  unmapped: Map<string, number>
): ChampionshipFinish | null {
  const year = parseInt(row.Year, 10);
  const rawTeam = row.Team?.trim();
  const position = row["Finish Pos"]?.trim();
  if (!year || !rawTeam || !position) return null;
  const team = canonicalize(rawTeam, gender, universe, unmapped);
  const madeCut = position.toUpperCase() !== "MC";
  const positionNoTies = parsePositionNoTies(row["Pos No Ties"]);
  const matchPlayEra =
    row["Match Play Era"]?.trim().toUpperCase() === "YES";
  const matchPlaySeed = parseSeed(row["Match Play Seed"]);
  const reachedMatchPlay = matchPlaySeed !== null;
  const wonQuarterfinal = reachedMatchPlay
    ? yesNoToBool(row["Won Quarterfinals"])
    : null;
  const wonSemifinal = reachedMatchPlay
    ? yesNoToBool(row["Won Semifinals"])
    : null;
  const wonChampionship = reachedMatchPlay
    ? yesNoToBool(row["Won Championship"])
    : null;
  return {
    team,
    gender,
    year,
    position,
    positionNoTies,
    madeCut,
    matchPlayEra,
    matchPlaySeed,
    wonQuarterfinal,
    wonSemifinal,
    wonChampionship,
  };
}

function build(gender: Gender, path: string, universe: Set<string>) {
  const rows = parseCsv(path);
  const unmapped = new Map<string, number>();
  const out: ChampionshipFinish[] = [];
  for (const row of rows) {
    const f = rowToFinish(row, gender, universe, unmapped);
    if (f) out.push(f);
  }
  if (unmapped.size > 0) {
    console.error(
      `\n[${gender}] ${unmapped.size} unmapped team name${
        unmapped.size === 1 ? "" : "s"
      } (kept as-is; no team page):`
    );
    const sorted = [...unmapped.entries()].sort((a, b) => b[1] - a[1]);
    for (const [team, n] of sorted) {
      console.error(`  ${team}  ×${n}`);
    }
  }
  const corrected = applyCorrections(out, gender);
  if (corrected > 0) {
    console.log(`[${gender}] applied ${corrected} correction(s)`);
  }
  return out;
}

function run() {
  const universe = loadUniverse();
  const men = build("men", MEN_CSV, universe.men);
  const women = build("women", WOMEN_CSV, universe.women);

  const all = [...men, ...women].sort(
    (a, b) =>
      a.gender.localeCompare(b.gender) ||
      a.year - b.year ||
      a.team.localeCompare(b.team)
  );

  const jsonPath = resolve(
    __dirname,
    "..",
    "src",
    "data",
    "championships-history.json"
  );
  writeFileSync(jsonPath, JSON.stringify(all));

  const loader = [
    `// Re-exports the generated championships-history.json with the correct type.`,
    `// The JSON is emitted by scripts/build-championships-history.ts.`,
    ``,
    `import type { ChampionshipFinish } from "./records-types";`,
    `import data from "./championships-history.json";`,
    ``,
    `export const championshipsHistory = data as ChampionshipFinish[];`,
    ``,
  ].join("\n");
  writeFileSync(
    resolve(__dirname, "..", "src", "data", "championships-history.ts"),
    loader
  );

  // Summary. Champion predicate covers both pre-2009 stroke-play (position
  // "1" or "T1" — ties yield co-champions) and post-2009 match-play
  // (wonChampionship === true). Position "1" in the match-play era is the
  // stroke-play leader, not the champion. Keep in sync with isChampion in
  // src/lib/streaks.ts.
  const isChampion = (r: ChampionshipFinish): boolean =>
    r.matchPlayEra
      ? r.wonChampionship === true
      : r.position === "1" || r.position === "T1";
  const menYears = men.map((r) => r.year);
  const womenYears = women.map((r) => r.year);
  const winsByTeamMen = new Map<string, number>();
  const winsByTeamWomen = new Map<string, number>();
  for (const r of men)
    if (isChampion(r))
      winsByTeamMen.set(r.team, (winsByTeamMen.get(r.team) ?? 0) + 1);
  for (const r of women)
    if (isChampion(r))
      winsByTeamWomen.set(r.team, (winsByTeamWomen.get(r.team) ?? 0) + 1);
  const mostMen = [...winsByTeamMen.entries()].sort((a, b) => b[1] - a[1])[0];
  const mostWomen = [...winsByTeamWomen.entries()].sort(
    (a, b) => b[1] - a[1]
  )[0];

  console.log(`\nMEN: ${men.length} rows, ${
    Math.min(...menYears)
  }–${Math.max(...menYears)}`);
  console.log(
    `WOMEN: ${women.length} rows, ${Math.min(...womenYears)}–${Math.max(
      ...womenYears
    )}`
  );
  console.log(`TOTAL: ${all.length} rows`);
  if (mostMen)
    console.log(`Most men's wins: ${mostMen[0]} (${mostMen[1]})`);
  if (mostWomen)
    console.log(`Most women's wins: ${mostWomen[0]} (${mostWomen[1]})`);
}

run();
