/**
 * verify-team-coords.ts
 *
 * Fails (exit 1) when team coordinates regress in any of the four data
 * files we care about:
 *
 *   src/data/rankings-{men,women}.ts
 *   src/data/all-teams-{men,women}-2026.ts
 *
 * Two layers of checks:
 *
 *   1. KNOWN_GOOD — explicit map of teams whose correct coordinates have
 *      been hand-verified in prior sessions. If any of these drift outside
 *      a 0.5° box around the canonical value, fail. This is the regression
 *      guard for "the same team keeps reverting" bugs.
 *
 *   2. ZERO_COORD eligible/AQ teams — any team that's `eligible: true` or
 *      `isAutoQualifier: true` and is sitting at lat:0, lng:0 is a deploy
 *      blocker. Ineligible teams with 0/0 still warn but don't fail (yet —
 *      tracked as the Tier-2 backfill follow-up).
 *
 * Wired into scripts/daily-refresh.sh between the sanity gate and commit
 * step; same `abort_hard` semantics as the existing 75%-rows-changed gate.
 */
import { rankingsMen } from "../src/data/rankings-men";
import { rankingsWomen } from "../src/data/rankings-women";
import { allTeamsMen2026 } from "../src/data/all-teams-men-2026";
import { allTeamsWomen2026 } from "../src/data/all-teams-women-2026";

interface Entry {
  source: string;
  team: string;
  lat: number;
  lng: number;
  eligible: boolean;
  isAutoQualifier: boolean;
}

const all: Entry[] = [
  ...rankingsMen.map((t) => ({
    source: "rankings-men",
    team: t.team,
    lat: t.lat,
    lng: t.lng,
    eligible: t.eligible,
    isAutoQualifier: t.isAutoQualifier,
  })),
  ...rankingsWomen.map((t) => ({
    source: "rankings-women",
    team: t.team,
    lat: t.lat,
    lng: t.lng,
    eligible: t.eligible,
    isAutoQualifier: t.isAutoQualifier,
  })),
  ...allTeamsMen2026.map((t) => ({
    source: "all-teams-men",
    team: t.team,
    lat: t.lat,
    lng: t.lng,
    eligible: t.eligible,
    isAutoQualifier: t.isAutoQualifier,
  })),
  ...allTeamsWomen2026.map((t) => ({
    source: "all-teams-women",
    team: t.team,
    lat: t.lat,
    lng: t.lng,
    eligible: t.eligible,
    isAutoQualifier: t.isAutoQualifier,
  })),
];

let failures = 0;

// ---------------------------------------------------------------------------
// Layer 1: Known-good coords (regression guard)
// ---------------------------------------------------------------------------
//
// Tolerance of 0.5° (~35 miles) is deliberate: we want to catch a team
// that was placed in a different city / state / country, not punish a
// cosmetic delta between Wikipedia centroid and the campus quad.

const KNOWN_GOOD: Record<string, { lat: number; lng: number; note: string }> = {
  // Sourced from past fix sessions — see commits edca021, bceadd0, 4791fae.
  Idaho: { lat: 46.7269, lng: -116.9989, note: "Univ. of Idaho — Moscow, ID" },
  "SIU Edwardsville": { lat: 38.7942, lng: -89.9947, note: "Edwardsville, IL" },
  "West Georgia": { lat: 33.5729, lng: -85.0978, note: "Carrollton, GA" },
  "Utah Tech": { lat: 37.1041, lng: -113.5659, note: "St. George, UT" },
  Georgetown: { lat: 38.9076, lng: -77.0723, note: "Georgetown Univ. — DC" },
  Merrimack: { lat: 42.6681, lng: -71.1211, note: "North Andover, MA" },
  Monmouth: { lat: 40.2779, lng: -74.0038, note: "West Long Branch, NJ" },
  Rider: { lat: 40.2817, lng: -74.7317, note: "Lawrenceville, NJ" },
  "Saint Francis": { lat: 40.5101, lng: -78.625, note: "Loretto, PA" },
  Richmond: { lat: 37.579, lng: -77.5385, note: "Univ. of Richmond, VA" },
  "North Florida": { lat: 30.2694, lng: -81.5065, note: "UNF — Jacksonville, FL" },
  "Queens-Charlotte": { lat: 35.2029, lng: -80.8358, note: "Charlotte, NC" },
  Manhattan: { lat: 40.8904, lng: -73.9041, note: "Manhattan Univ. — Bronx, NY" },
  UAlbany: { lat: 42.6866, lng: -73.823, note: "Univ. at Albany, NY" },
  Montana: { lat: 46.8597, lng: -113.9852, note: "Missoula, MT" },
  UIC: { lat: 41.8715, lng: -87.6502, note: "Univ. of Illinois Chicago" },
  // 14-seed teams added during this session
  Fairfield: { lat: 41.1412, lng: -73.2637, note: "Fairfield Univ. — Fairfield, CT" },
  "Florida A&M": { lat: 30.4239, lng: -84.2876, note: "Tallahassee, FL" },
  "New Haven": { lat: 41.2707, lng: -72.947, note: "Univ. of New Haven — West Haven, CT" },
  // Pre-existing checks
  "Idaho State": { lat: 42.8620287, lng: -112.450627, note: "Pocatello, ID" },
  "CSU Northridge": { lat: 34.2381, lng: -118.529, note: "Northridge, CA (guards against Nova Scotia geocoder collision)" },
};

console.log("[check] Known-good team coordinates");
for (const [team, known] of Object.entries(KNOWN_GOOD)) {
  const rows = all.filter((e) => e.team === team && !(e.lat === 0 && e.lng === 0));
  if (rows.length === 0) {
    console.log(`  skip: ${team} — no non-zero coords in any source`);
    continue;
  }
  let allOk = true;
  for (const r of rows) {
    const latDiff = Math.abs(r.lat - known.lat);
    const lngDiff = Math.abs(r.lng - known.lng);
    if (latDiff > 0.5 || lngDiff > 0.5) {
      allOk = false;
      console.log(
        `FAIL: ${team} in ${r.source} is at ${r.lat},${r.lng} — expected ~${known.lat},${known.lng} (${known.note})`
      );
      failures += 1;
    }
  }
  if (allOk) console.log(`  ok: ${team} at ${known.lat},${known.lng} — ${known.note}`);
}

// ---------------------------------------------------------------------------
// Layer 2: zero-coord eligible/AQ teams (deploy blocker)
// ---------------------------------------------------------------------------
//
// Any team that *will be in the regional field* (eligible or AQ) MUST have
// real coordinates — otherwise the S-curve closest-site logic falls back to
// deterministic-but-meaningless placement.

console.log("\n[check] zero-coord eligible/AQ teams");
const zeroBlocking: Entry[] = all.filter(
  (e) => e.lat === 0 && e.lng === 0 && (e.eligible || e.isAutoQualifier)
);

if (zeroBlocking.length > 0) {
  const byTeam = new Map<string, string[]>();
  for (const e of zeroBlocking) {
    const sources = byTeam.get(e.team) ?? [];
    sources.push(e.source);
    byTeam.set(e.team, sources);
  }
  console.log(
    `FAIL: ${byTeam.size} eligible or AQ team(s) at lat:0, lng:0 — these will misplace in the S-curve:`
  );
  for (const [team, srcs] of [...byTeam.entries()].sort()) {
    console.log(`  ${team}  (${srcs.join(", ")})`);
    failures += 1;
  }
} else {
  console.log("  ok: no eligible/AQ teams at 0,0");
}

// ---------------------------------------------------------------------------
// Layer 3: zero-coord ineligible teams (warn only, for now)
// ---------------------------------------------------------------------------

const zeroInfo: Entry[] = all.filter(
  (e) => e.lat === 0 && e.lng === 0 && !e.eligible && !e.isAutoQualifier
);

if (zeroInfo.length > 0) {
  console.log(
    `\n[warn] ${zeroInfo.length} ineligible-team rows at lat:0, lng:0 (not a deploy blocker; tracked under Tier-2 backfill follow-up):`
  );
  const byTeam = new Map<string, string[]>();
  for (const e of zeroInfo) {
    const sources = byTeam.get(e.team) ?? [];
    sources.push(e.source);
    byTeam.set(e.team, sources);
  }
  const teams = [...byTeam.keys()].sort();
  for (const team of teams.slice(0, 10)) {
    console.log(`  ${team}  (${byTeam.get(team)!.join(", ")})`);
  }
  if (teams.length > 10) console.log(`  … ${teams.length - 10} more`);
}

// ---------------------------------------------------------------------------
// Layer 4: duplicate coords across teams (warn only)
// ---------------------------------------------------------------------------

const coordToTeams = new Map<string, Set<string>>();
for (const e of all) {
  if (e.lat === 0 && e.lng === 0) continue;
  const key = `${e.lat.toFixed(4)},${e.lng.toFixed(4)}`;
  const teams = coordToTeams.get(key) ?? new Set<string>();
  teams.add(e.team);
  coordToTeams.set(key, teams);
}

const dupes: Array<{ coord: string; teams: string[] }> = [];
for (const [coord, teams] of coordToTeams) {
  if (teams.size > 1) dupes.push({ coord, teams: [...teams].sort() });
}
if (dupes.length > 0) {
  console.log(
    `\n[warn] ${dupes.length} coordinate(s) shared by >1 team (often pre-existing upstream geocoder bugs):`
  );
  for (const d of dupes.slice(0, 5)) {
    console.log(`  ${d.coord} — ${d.teams.join(", ")}`);
  }
  if (dupes.length > 5) console.log(`  … ${dupes.length - 5} more`);
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

console.log("");
if (failures === 0) {
  console.log("PASS");
  process.exit(0);
} else {
  console.log(`FAIL: ${failures} issue(s) — block deploy`);
  process.exit(1);
}
