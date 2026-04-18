import { rankingsMen } from "../src/data/rankings-men";
import { rankingsWomen } from "../src/data/rankings-women";
import { allTeamsMen2026 } from "../src/data/all-teams-men-2026";
import { allTeamsWomen2026 } from "../src/data/all-teams-women-2026";

interface Entry {
  source: string;
  team: string;
  lat: number;
  lng: number;
}

const all: Entry[] = [
  ...rankingsMen.map((t) => ({ source: "rankings-men", team: t.team, lat: t.lat, lng: t.lng })),
  ...rankingsWomen.map((t) => ({ source: "rankings-women", team: t.team, lat: t.lat, lng: t.lng })),
  ...allTeamsMen2026.map((t) => ({ source: "all-teams-men", team: t.team, lat: t.lat, lng: t.lng })),
  ...allTeamsWomen2026.map((t) => ({ source: "all-teams-women", team: t.team, lat: t.lat, lng: t.lng })),
];

let failures = 0;

const zeroCoords: Entry[] = all.filter((e) => e.lat === 0 && e.lng === 0);
if (zeroCoords.length > 0) {
  console.log(`\n[warn] ${zeroCoords.length} teams with lat=0 lng=0 (expected for unresolved coords):`);
  const byTeam = new Map<string, string[]>();
  for (const e of zeroCoords) {
    const src = byTeam.get(e.team) ?? [];
    src.push(e.source);
    byTeam.set(e.team, src);
  }
  for (const [team, srcs] of [...byTeam.entries()].sort()) {
    console.log(`  ${team}  (${srcs.join(", ")})`);
  }
}

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
  console.log(`\n[warn] ${dupes.length} coordinates shared by >1 team (pre-existing upstream bugs — not a Mikkel fix):`);
  for (const d of dupes.slice(0, 5)) {
    console.log(`  ${d.coord} — ${d.teams.join(", ")}`);
  }
  if (dupes.length > 5) console.log(`  … ${dupes.length - 5} more`);
}

const teamKnownCoords: Record<string, { lat: number; lng: number; note: string }> = {
  Idaho: { lat: 46.7296, lng: -117.0128, note: "University of Idaho — Moscow, ID" },
  "Idaho State": { lat: 42.8620287, lng: -112.450627, note: "Idaho State University — Pocatello, ID" },
};

console.log("\n[check] Known teams at expected coordinates");
for (const [team, known] of Object.entries(teamKnownCoords)) {
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

console.log("");
if (failures === 0) {
  console.log("PASS");
  process.exit(0);
} else {
  console.log(`FAIL: ${failures} issue(s)`);
  process.exit(1);
}
