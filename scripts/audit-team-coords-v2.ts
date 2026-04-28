/**
 * audit-team-coords-v2.ts
 *
 * Second-pass coord audit. For each team, queries Photon with the team's
 * canonical school_name (via the alias map in audit-team-coords.ts) and
 * compares the geocoded location to the stored lat/lng. Teams whose stored
 * coord is more than DISTANCE_THRESHOLD_MI miles from the geocoded campus
 * location are flagged for manual review.
 *
 * Catches the Murray-State-style failure mode: stored coord lands in the
 * correct *state* (so the bbox audit passes) but is actually pointing at
 * the wrong city (e.g. Louisville instead of Murray, KY).
 *
 * Does NOT modify any data files. Outputs a Markdown report.
 *
 * Run: npx tsx scripts/audit-team-coords-v2.ts
 *      npx tsx scripts/audit-team-coords-v2.ts --threshold 25
 *      npx tsx scripts/audit-team-coords-v2.ts --refresh
 */
import fs from "node:fs";
import path from "node:path";

import { rankingsMen } from "../src/data/rankings-men";
import { rankingsWomen } from "../src/data/rankings-women";
import { allTeamsMen2026 } from "../src/data/all-teams-men-2026";
import { allTeamsWomen2026 } from "../src/data/all-teams-women-2026";

const argv = new Set(process.argv.slice(2));
const REFRESH = argv.has("--refresh");
const thresholdIdx = process.argv.indexOf("--threshold");
const DISTANCE_THRESHOLD_MI =
  thresholdIdx >= 0 ? Number(process.argv[thresholdIdx + 1]) : 30;

const CACHE_PATH = path.join(__dirname, "cache", "school-name-geocodes.json");

// Reuse the alias map and normalization from the v1 audit, inlined here so
// this script stays self-contained and can be run on its own.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[.'’]/g, "")
    .replace(/[-/,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const aliases: Record<string, string> = (() => {
  const src = fs.readFileSync(
    path.join(__dirname, "audit-team-coords.ts"),
    "utf-8",
  );
  // Pull the const aliases: Record<string, string> = { ... }; block.
  const m = src.match(/const aliases:[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!m) throw new Error("could not extract aliases from audit-team-coords.ts");
  const out: Record<string, string> = {};
  const re = /"([^"]+)":\s*"([^"]+)"/g;
  for (const am of m[1].matchAll(re)) {
    out[am[1]] = am[2];
  }
  return out;
})();

interface School {
  school_name: string;
  city: string;
  state: string;
  has_mens_golf: boolean;
  has_womens_golf: boolean;
}
const schools: School[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, "cache/supabase-schools.json"), "utf-8"),
);
const schoolByNormName = new Map<string, School>();
for (const s of schools) {
  if (!schoolByNormName.has(normalize(s.school_name))) {
    schoolByNormName.set(normalize(s.school_name), s);
  }
}

// ---- Collect all unique teams + sources ----------------------------------
interface Row {
  team: string;
  lat: number;
  lng: number;
  conferences: Set<string>;
  sources: Set<string>;
}
const byTeam = new Map<string, Row>();
function ingest(
  team: string,
  conference: string,
  lat: number,
  lng: number,
  src: string,
) {
  const prev = byTeam.get(team);
  if (prev) {
    prev.sources.add(src);
    prev.conferences.add(conference);
    if (prev.lat === 0 && prev.lng === 0 && !(lat === 0 && lng === 0)) {
      prev.lat = lat;
      prev.lng = lng;
    }
  } else {
    byTeam.set(team, {
      team,
      lat,
      lng,
      conferences: new Set([conference]),
      sources: new Set([src]),
    });
  }
}
for (const t of rankingsMen)
  ingest(t.team, t.conference, t.lat, t.lng, "rankings-men");
for (const t of rankingsWomen)
  ingest(t.team, t.conference, t.lat, t.lng, "rankings-women");
for (const t of allTeamsMen2026)
  ingest(t.team, t.conference, t.lat, t.lng, "all-teams-men");
for (const t of allTeamsWomen2026)
  ingest(t.team, t.conference, t.lat, t.lng, "all-teams-women");

// ---- Geocode helpers -----------------------------------------------------
function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3958.8; // miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

interface PhotonHit {
  lat: number;
  lng: number;
  name: string;
  state: string;
  type: string; // osm_value, e.g. "university"
}

async function geocodeSchool(
  schoolName: string,
): Promise<PhotonHit | null> {
  // Prefer hits tagged as universities/schools; fall back to any US hit.
  const q = encodeURIComponent(schoolName);
  const url = `https://photon.komoot.io/api/?q=${q}&limit=8&osm_tag=amenity:university&osm_tag=amenity:college&osm_tag=building:university`;
  let resp: Response;
  try {
    resp = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (e) {
    return null;
  }
  if (!resp.ok) return null;
  const json = (await resp.json()) as {
    features?: Array<{
      geometry: { coordinates: [number, number] };
      properties: {
        name?: string;
        state?: string;
        country?: string;
        osm_value?: string;
      };
    }>;
  };
  const features = json.features ?? [];
  // Pick first US result.
  const us = features.find((f) => f.properties?.country === "United States");
  if (!us) {
    // Retry with no tag filter.
    const fallback = await fetch(
      `https://photon.komoot.io/api/?q=${q}&limit=5`,
      { headers: { Accept: "application/json" } },
    );
    if (!fallback.ok) return null;
    const fj = (await fallback.json()) as typeof json;
    const ffUs = fj.features?.find(
      (f) => f.properties?.country === "United States",
    );
    if (!ffUs) return null;
    const [lng, lat] = ffUs.geometry.coordinates;
    return {
      lat,
      lng,
      name: ffUs.properties?.name ?? schoolName,
      state: ffUs.properties?.state ?? "",
      type: ffUs.properties?.osm_value ?? "",
    };
  }
  const [lng, lat] = us.geometry.coordinates;
  return {
    lat,
    lng,
    name: us.properties?.name ?? schoolName,
    state: us.properties?.state ?? "",
    type: us.properties?.osm_value ?? "",
  };
}

// ---- Main ----------------------------------------------------------------
async function main() {
  let cache: Record<string, PhotonHit | null> = {};
  if (!REFRESH && fs.existsSync(CACHE_PATH)) {
    cache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
  }

  const teams = [...byTeam.values()].filter(
    (r) => !(r.lat === 0 && r.lng === 0),
  );
  console.error(
    `Scanning ${teams.length} teams (skipping ${byTeam.size - teams.length} 0,0 entries)...`,
  );

  let needGeocode = 0;
  for (const r of teams) {
    const canonical = aliases[r.team];
    if (!canonical) continue;
    if (!(canonical in cache)) needGeocode++;
  }
  console.error(`  Need to geocode ${needGeocode} new school names...`);

  let i = 0;
  for (const r of teams) {
    const canonical = aliases[r.team];
    if (!canonical) continue;
    if (canonical in cache) continue;
    i++;
    process.stderr.write(`  [${i}/${needGeocode}] ${canonical}... `);
    const hit = await geocodeSchool(canonical);
    cache[canonical] = hit;
    process.stderr.write(
      hit ? `${hit.lat.toFixed(3)},${hit.lng.toFixed(3)} (${hit.type})\n` : "MISS\n",
    );
    if (i % 20 === 0) {
      fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
    }
    await new Promise((r) => setTimeout(r, 200)); // ~5 req/s
  }
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));

  // ---- Build report ------------------------------------------------------
  interface Flag {
    team: string;
    canonical: string;
    conferences: string;
    distanceMi: number;
    storedLat: number;
    storedLng: number;
    geocodedLat: number;
    geocodedLng: number;
    geocodeName: string;
    geocodeState: string;
    geocodeType: string;
    sources: string;
  }
  const flags: Flag[] = [];
  const noAlias: Row[] = [];
  const noGeocode: { team: string; canonical: string }[] = [];

  for (const r of teams) {
    const canonical = aliases[r.team];
    if (!canonical) {
      noAlias.push(r);
      continue;
    }
    const hit = cache[canonical];
    if (!hit) {
      noGeocode.push({ team: r.team, canonical });
      continue;
    }
    const d = haversineMiles(r.lat, r.lng, hit.lat, hit.lng);
    if (d > DISTANCE_THRESHOLD_MI) {
      flags.push({
        team: r.team,
        canonical,
        conferences: [...r.conferences].join(","),
        distanceMi: d,
        storedLat: r.lat,
        storedLng: r.lng,
        geocodedLat: hit.lat,
        geocodedLng: hit.lng,
        geocodeName: hit.name,
        geocodeState: hit.state,
        geocodeType: hit.type,
        sources: [...r.sources].join(","),
      });
    }
  }

  flags.sort((a, b) => b.distanceMi - a.distanceMi);

  console.log(`\n# Team coordinate audit (v2 — geocode comparison)\n`);
  console.log(
    `Cross-checks each team's stored lat/lng against a Photon geocode of its canonical school_name.\n`,
  );
  console.log(
    `Threshold: **${DISTANCE_THRESHOLD_MI} miles**. Teams beyond that are flagged for manual review.\n`,
  );
  console.log(
    `Scanned ${teams.length} teams (${noAlias.length} with no alias entry, ${noGeocode.length} with no Photon match).\n`,
  );
  console.log(`## Flagged teams (${flags.length})\n`);
  if (flags.length === 0) {
    console.log("None.\n");
  } else {
    console.log(
      "| Team | Conference | Stored coord | Geocoded campus | Distance (mi) | OSM type | Sources |",
    );
    console.log("| --- | --- | --- | --- | --- | --- | --- |");
    for (const f of flags) {
      console.log(
        `| ${f.team} (${f.canonical}) | ${f.conferences} | ${f.storedLat.toFixed(4)},${f.storedLng.toFixed(4)} | ${f.geocodedLat.toFixed(4)},${f.geocodedLng.toFixed(4)} (${f.geocodeName}, ${f.geocodeState}) | ${f.distanceMi.toFixed(1)} | ${f.geocodeType} | ${f.sources} |`,
      );
    }
    console.log();
  }

  if (noAlias.length) {
    console.log(`## Teams with no alias entry (${noAlias.length})\n`);
    console.log(
      `These teams aren't in the alias map in audit-team-coords.ts, so we can't geocode them. Add an entry there to bring them in scope.\n`,
    );
    for (const r of noAlias.slice(0, 50)) {
      console.log(
        `- ${r.team}  (coord: ${r.lat.toFixed(4)},${r.lng.toFixed(4)})`,
      );
    }
    if (noAlias.length > 50) {
      console.log(`- ... and ${noAlias.length - 50} more`);
    }
    console.log();
  }

  if (noGeocode.length) {
    console.log(`## Teams whose Photon geocode missed (${noGeocode.length})\n`);
    for (const x of noGeocode) {
      console.log(`- ${x.team} → ${x.canonical}`);
    }
    console.log();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
