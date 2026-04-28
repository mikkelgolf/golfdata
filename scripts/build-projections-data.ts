/**
 * build-projections-data.ts
 *
 * Builds Layers 2-4 of the Regional Advancement Projections model and
 * produces the per-team probability table consumed by the UI.
 *
 *   Layer 1 (seed baseline)        ←  scripts/build-projections-layer1.ts
 *   Layer 2 (host school lift)     ←  this script
 *   Layer 3 (travel distance lift) ←  this script
 *   Layer 4 (climate zone lift)    ←  this script
 *   Per-team final %               ←  this script
 *
 * Training data: modern-era rows of regionals-rich.json
 *   - Men   2009-2025 excl. 2020 (16 seasons of 6×14 format)
 *   - Women 2022-2025            ( 4 seasons of 6×12 format)
 *
 * Key conventions:
 *   - Host detection by campus-to-venue distance < 30 mi (robust to naming).
 *   - Team coords come from all-teams-{men,women}-2026.ts — historical teams
 *     missing from that file are dropped from training (small share).
 *   - Lifts stored as multiplicative odds-ratios, smoothed (Laplace 0.5) to
 *     avoid 0/1 endpoints breaking the math. Raw rates kept for transparency.
 *   - Layer 4 falls back to in-zone vs out-of-zone if any specific crossing
 *     has n < 15 — mentioned in methodology.
 *
 * Outputs (under src/data/projections/):
 *   - host-lift.json
 *   - distance-lift.json
 *   - zone-lift.json
 *   - per-team-2026.json   (the final UI input)
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { regionalsRich } from "../src/data/regionals-rich";
import { allTeamsMen2026 } from "../src/data/all-teams-men-2026";
import { allTeamsWomen2026 } from "../src/data/all-teams-women-2026";
import { regionalsMen2026 } from "../src/data/regionals-men-2026";
import { regionalsWomen2026 } from "../src/data/regionals-women-2026";
import { championshipsMen2026 } from "../src/data/championships-men-2026";
import { championshipsWomen2026 } from "../src/data/championships-women-2026";
import { REGIONAL_VENUES, type VenueInfo } from "../src/data/regional-venues";
import type { ClimateZone } from "../src/data/climate-zones";
import { haversineDistance } from "../src/lib/geo";
import { computeScurve, computeRegionalPositions } from "../src/lib/scurve";
import {
  combineLayers,
  distanceBucket,
  DISTANCE_BUCKETS,
  normalizeToFive,
  odds,
  seedTier,
  SEED_TIERS,
  smoothRate,
  TEAMS_ADVANCING,
  zoneFromCoords,
  type DistanceBucket,
  type SeedTier,
} from "../src/lib/projections";

type Gender = "men" | "women";

const MODERN_ERA_START: Record<Gender, number> = { men: 2009, women: 2022 };
const HOST_RADIUS_MILES = 30;
const ADVANCEMENT_CUTOFF = 5;
const MIN_CELL_N = 15;

interface SeedCell {
  gender: Gender;
  seed: number;
  n_apps: number;
  n_advanced: number;
  rate: number;
}

interface TeamRow {
  team: string;
  lat: number;
  lng: number;
  conference: string;
  rank: number;
}

const SEED_BASELINE: SeedCell[] = JSON.parse(
  readFileSync("src/data/projections/seed-baseline.json", "utf8"),
);

function seedCell(gender: Gender, seed: number): SeedCell | null {
  return SEED_BASELINE.find((c) => c.gender === gender && c.seed === seed) ?? null;
}

// ──────────────────────────────────────────────────────────────────────────
// Team alias resolution — historical regionals-rich uses different forms
// than the modern rankings table for a handful of programs.
// ──────────────────────────────────────────────────────────────────────────
const TEAM_ALIASES: Record<string, string> = {
  BYU: "Brigham Young",
  USC: "Southern California",
  UCF: "Central Florida",
  UNLV: "Nevada-Las Vegas",
  "Miami (Florida)": "Miami",
  "Miami (Ohio)": "Miami (OH)",
  "TCU": "TCU",
  "SMU": "SMU",
  "UAB": "UAB",
  "Ole Miss": "Ole Miss",
  "Mississippi": "Ole Miss",
  "UT Martin": "UT Martin",
  "Tennessee-Martin": "UT Martin",
  "UTSA": "UTSA",
  "Texas-San Antonio": "UTSA",
  "Texas-El Paso": "UTEP",
  "UTEP": "UTEP",
  "Louisiana-Lafayette": "Louisiana",
  "Louisiana-Monroe": "Louisiana-Monroe",
  "ULM": "Louisiana-Monroe",
};

function buildTeamLookup(rows: TeamRow[]): Map<string, TeamRow> {
  const map = new Map<string, TeamRow>();
  for (const r of rows) map.set(r.team, r);
  for (const [alias, canonical] of Object.entries(TEAM_ALIASES)) {
    const t = map.get(canonical);
    if (t && !map.has(alias)) map.set(alias, t);
  }
  return map;
}

const TEAM_LOOKUP_MEN = buildTeamLookup(allTeamsMen2026 as unknown as TeamRow[]);
const TEAM_LOOKUP_WOMEN = buildTeamLookup(allTeamsWomen2026 as unknown as TeamRow[]);
const TEAM_LOOKUP: Record<Gender, Map<string, TeamRow>> = {
  men: TEAM_LOOKUP_MEN,
  women: TEAM_LOOKUP_WOMEN,
};

// ──────────────────────────────────────────────────────────────────────────
// Training row enrichment
// ──────────────────────────────────────────────────────────────────────────

interface TrainRow {
  year: number;
  gender: Gender;
  team: string;
  regional: string;
  seed: number;
  advanced: boolean;
  teamLat: number;
  teamLng: number;
  teamZone: ClimateZone;
  venue: VenueInfo | null;
  distMiles: number | null; // null when venue is directional or unmatched
  isHost: boolean;
  baseRate: number; // smoothed Layer 1 rate for this seed
}

function buildTrainSet(): { rows: TrainRow[]; unmatched: Map<string, number> } {
  const unmatched = new Map<string, number>();
  const rows: TrainRow[] = [];

  for (const r of regionalsRich) {
    if (r.year === 2020) continue;
    if (r.seed == null || r.finalPos == null) continue;
    const gender = r.gender as Gender;
    if (r.year < MODERN_ERA_START[gender]) continue;

    const team = TEAM_LOOKUP[gender].get(r.team);
    if (!team) {
      unmatched.set(r.team, (unmatched.get(r.team) ?? 0) + 1);
      continue;
    }
    const teamZone = zoneFromCoords(team.lat, team.lng);
    if (!teamZone) {
      unmatched.set(`(zone) ${r.team}`, (unmatched.get(r.team) ?? 0) + 1);
      continue;
    }

    const venue = REGIONAL_VENUES[r.regional] ?? null;
    let distMiles: number | null = null;
    let isHost = false;
    if (venue && venue.lat != null && venue.lng != null) {
      distMiles = haversineDistance(team.lat, team.lng, venue.lat, venue.lng);
      isHost = distMiles < HOST_RADIUS_MILES;
    }

    const cell = seedCell(gender, r.seed);
    const baseRate = cell ? smoothRate(cell.n_advanced, cell.n_apps) : 0;

    rows.push({
      year: r.year,
      gender,
      team: r.team,
      regional: r.regional,
      seed: r.seed,
      advanced: r.finalPos <= ADVANCEMENT_CUTOFF,
      teamLat: team.lat,
      teamLng: team.lng,
      teamZone,
      venue,
      distMiles,
      isHost,
      baseRate,
    });
  }

  return { rows, unmatched };
}

// ──────────────────────────────────────────────────────────────────────────
// Lift computation: observed rate vs seed-matched expected rate → odds ratio
// ──────────────────────────────────────────────────────────────────────────

function liftFromRows(rows: TrainRow[]): {
  n: number;
  observed: number;
  expected: number;
  observedSmoothed: number;
  expectedSmoothed: number;
  oddsRatio: number;
} {
  const n = rows.length;
  if (n === 0) {
    return { n: 0, observed: 0, expected: 0, observedSmoothed: 0.5, expectedSmoothed: 0.5, oddsRatio: 1 };
  }
  const advanced = rows.filter((r) => r.advanced).length;
  const expectedSum = rows.reduce((s, r) => s + r.baseRate, 0);
  const observed = advanced / n;
  const expected = expectedSum / n;
  const observedSmoothed = smoothRate(advanced, n);
  // Expected is already a baseline rate average; floor/cap to avoid div-zero.
  const expectedSmoothed = Math.max(0.001, Math.min(0.999, expected));
  const oddsRatio = odds(observedSmoothed) / odds(expectedSmoothed);
  return { n, observed, expected, observedSmoothed, expectedSmoothed, oddsRatio };
}

// ──────────────────────────────────────────────────────────────────────────
// Layer 2 — Host school
// ──────────────────────────────────────────────────────────────────────────

function buildHostLift(train: TrainRow[]) {
  const out: any[] = [];
  for (const gender of ["men", "women"] as const) {
    // Global aggregate (always emitted as fallback)
    const rows = train.filter((r) => r.gender === gender && r.isHost);
    out.push({ gender, level: "aggregate", ...liftFromRows(rows) });
    // Per-tier (emitted; lookup falls back to aggregate when n<MIN_CELL_N)
    for (const tier of SEED_TIERS) {
      const tRows = rows.filter((r) => seedTier(r.seed) === tier);
      out.push({ gender, level: "tier", tier, ...liftFromRows(tRows) });
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Layer 3 — Distance bucket
// ──────────────────────────────────────────────────────────────────────────

function buildDistanceLift(train: TrainRow[]) {
  const out: any[] = [];
  for (const gender of ["men", "women"] as const) {
    for (const bucket of DISTANCE_BUCKETS) {
      const bucketRows = train.filter(
        (r) =>
          r.gender === gender &&
          r.distMiles != null &&
          distanceBucket(r.distMiles) === bucket,
      );
      out.push({ gender, bucket, level: "aggregate", ...liftFromRows(bucketRows) });
      for (const tier of SEED_TIERS) {
        const tRows = bucketRows.filter((r) => seedTier(r.seed) === tier);
        out.push({ gender, bucket, level: "tier", tier, ...liftFromRows(tRows) });
      }
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Layer 4 — Climate zone crossing
// ──────────────────────────────────────────────────────────────────────────

function crossingKey(from: ClimateZone, to: ClimateZone): string {
  return `${from}->${to}`;
}

function buildZoneLift(train: TrainRow[]) {
  const out: any[] = [];
  for (const gender of ["men", "women"] as const) {
    const genderRows = train.filter((r) => r.gender === gender && r.venue !== null);
    // Per specific crossing (no tier — sample is too thin already)
    const perCrossing = new Map<string, TrainRow[]>();
    for (const r of genderRows) {
      const k = crossingKey(r.teamZone, r.venue!.zone);
      if (!perCrossing.has(k)) perCrossing.set(k, []);
      perCrossing.get(k)!.push(r);
    }
    for (const [k, rows] of perCrossing) {
      const [from, to] = k.split("->") as [ClimateZone, ClimateZone];
      out.push({ gender, from, to, level: "crossing", ...liftFromRows(rows) });
    }
    // In/out aggregate, plus per-tier in/out for the semi-global fallback layer
    const inZone = genderRows.filter((r) => r.teamZone === r.venue!.zone);
    const outZone = genderRows.filter((r) => r.teamZone !== r.venue!.zone);
    out.push({ gender, level: "aggregate", in_or_out: "in", ...liftFromRows(inZone) });
    out.push({ gender, level: "aggregate", in_or_out: "out", ...liftFromRows(outZone) });
    for (const tier of SEED_TIERS) {
      const tIn = inZone.filter((r) => seedTier(r.seed) === tier);
      const tOut = outZone.filter((r) => seedTier(r.seed) === tier);
      out.push({ gender, level: "tier", tier, in_or_out: "in", ...liftFromRows(tIn) });
      out.push({ gender, level: "tier", tier, in_or_out: "out", ...liftFromRows(tOut) });
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Apply layers to each 2026 team
// ──────────────────────────────────────────────────────────────────────────

interface AppliedTeam {
  team: string;
  rank: number;
  conference: string;
  seed: number;
  isHost: boolean;
  travelMi: number;
  zoneCrossing: string; // "WEST->WEST" or "in" or "out"
  baseRatePct: number;
  afterHostPct: number;
  afterDistancePct: number;
  afterZonePct: number;
  finalPct: number;
}

interface AppliedRegional {
  id: number;
  gender: Gender;
  name: string;
  host: string;
  city: string;
  venueLat: number;
  venueLng: number;
  venueZone: ClimateZone;
  teams: AppliedTeam[];
}

function lookupHostOR(
  hostLift: any[],
  gender: Gender,
  isHost: boolean,
  tier: SeedTier,
): { OR: number; n: number; level: "tier" | "aggregate" } {
  if (!isHost) return { OR: 1, n: 0, level: "aggregate" };
  const tierCell = hostLift.find(
    (c) => c.gender === gender && c.level === "tier" && c.tier === tier,
  );
  if (tierCell && tierCell.n >= MIN_CELL_N) {
    return { OR: tierCell.oddsRatio, n: tierCell.n, level: "tier" };
  }
  const agg = hostLift.find((c) => c.gender === gender && c.level === "aggregate");
  return { OR: agg?.oddsRatio ?? 1, n: agg?.n ?? 0, level: "aggregate" };
}

function lookupDistanceOR(
  distLift: any[],
  gender: Gender,
  miles: number,
  // tier kept for call-site parity with host/zone but intentionally unused —
  // tier-segmented distance ORs invert in low-n cells (women BOT 250-750 came
  // out at OR=0.52 from 1 advance in 35; BOT 1500+ at OR=2.05 from 3 in 16),
  // which made closer teams penalized and far teams boosted. Distance is a
  // continuous physical effect; the aggregate stays monotonic and intuitive.
  _tier: SeedTier,
): { OR: number; bucket: DistanceBucket; n: number; level: "aggregate" } {
  const bucket = distanceBucket(miles);
  const agg = distLift.find(
    (c) => c.gender === gender && c.bucket === bucket && c.level === "aggregate",
  );
  if (!agg || agg.n < MIN_CELL_N) {
    return { OR: 1, bucket, n: agg?.n ?? 0, level: "aggregate" };
  }
  return { OR: agg.oddsRatio, bucket, n: agg.n, level: "aggregate" };
}

function lookupZoneOR(
  zoneLift: any[],
  gender: Gender,
  fromZone: ClimateZone,
  toZone: ClimateZone,
  tier: SeedTier,
): { OR: number; label: string; n: number; level: "crossing" | "tier" | "aggregate" } {
  const isIn = fromZone === toZone;
  // 1. Specific zone-pair crossing (no tier)
  const crossing = zoneLift.find(
    (c) =>
      c.gender === gender && c.level === "crossing" && c.from === fromZone && c.to === toZone,
  );
  if (crossing && crossing.n >= MIN_CELL_N) {
    return { OR: crossing.oddsRatio, label: `${fromZone}->${toZone}`, n: crossing.n, level: "crossing" };
  }
  // 2. Tier-level in/out
  const tierCell = zoneLift.find(
    (c) =>
      c.gender === gender &&
      c.level === "tier" &&
      c.tier === tier &&
      c.in_or_out === (isIn ? "in" : "out"),
  );
  if (tierCell && tierCell.n >= MIN_CELL_N) {
    return {
      OR: tierCell.oddsRatio,
      label: `${tier}-${isIn ? "in" : "out"}`,
      n: tierCell.n,
      level: "tier",
    };
  }
  // 3. Global in/out aggregate
  const agg = zoneLift.find(
    (c) => c.gender === gender && c.level === "aggregate" && c.in_or_out === (isIn ? "in" : "out"),
  );
  return {
    OR: agg?.oddsRatio ?? 1,
    label: isIn ? "in-zone" : "out-of-zone",
    n: agg?.n ?? 0,
    level: "aggregate",
  };
}

function applyToCurrentRegionals(
  hostLift: any[],
  distLift: any[],
  zoneLift: any[],
): AppliedRegional[] {
  const out: AppliedRegional[] = [];

  for (const gender of ["men", "women"] as const) {
    const regs = gender === "men" ? regionalsMen2026 : regionalsWomen2026;
    const teams = gender === "men" ? allTeamsMen2026 : allTeamsWomen2026;
    const champs = gender === "men" ? championshipsMen2026 : championshipsWomen2026;

    // Use the same committee S-curve the homepage already renders so the
    // projections tab is consistent with the other tabs.
    const assignments = computeScurve(teams, regs, "committee", gender, champs);
    const regionalPositions = computeRegionalPositions(assignments);

    for (const reg of regs) {
      const venueZone = zoneFromCoords(reg.lat, reg.lng);
      if (!venueZone) throw new Error(`Cannot zone-classify ${reg.name}`);

      const fieldAssignments = assignments.filter((a) => a.regionalId === reg.id);
      const applied: AppliedTeam[] = [];

      for (const a of fieldAssignments) {
        const teamZone = zoneFromCoords(a.lat, a.lng);
        if (!teamZone) continue;

        const regionalSeed = regionalPositions.get(a.team) ?? 99;
        const cell = seedCell(gender, regionalSeed);
        const base = cell ? smoothRate(cell.n_advanced, cell.n_apps) : 0.5;

        const dist = haversineDistance(a.lat, a.lng, reg.lat, reg.lng);
        const isHost = dist < HOST_RADIUS_MILES;

        const tier = seedTier(regionalSeed);
        const host = lookupHostOR(hostLift, gender, isHost, tier);
        const distOR = lookupDistanceOR(distLift, gender, dist, tier);
        const zoneOR = lookupZoneOR(zoneLift, gender, teamZone, venueZone, tier);

        const baseP = base;
        const afterHost = combineLayers({ baseRate: base, hostOR: host.OR, distanceOR: 1, zoneOR: 1 });
        const afterDist = combineLayers({ baseRate: base, hostOR: host.OR, distanceOR: distOR.OR, zoneOR: 1 });
        const afterZone = combineLayers({
          baseRate: base,
          hostOR: host.OR,
          distanceOR: distOR.OR,
          zoneOR: zoneOR.OR,
        });

        applied.push({
          team: a.team,
          rank: a.rank,
          conference: a.conference,
          seed: regionalSeed,
          isHost,
          travelMi: Math.round(dist),
          zoneCrossing: `${teamZone}->${venueZone}`,
          baseRatePct: baseP * 100,
          afterHostPct: afterHost * 100,
          afterDistancePct: afterDist * 100,
          afterZonePct: afterZone * 100,
          finalPct: afterZone * 100,
        });
      }

      const probs = applied.map((a) => a.afterZonePct / 100);
      const normalized = normalizeToFive(probs);
      applied.forEach((a, i) => {
        a.finalPct = normalized[i] * 100;
      });
      applied.sort((a, b) => b.finalPct - a.finalPct);

      out.push({
        id: reg.id,
        gender,
        name: reg.name,
        host: reg.host,
        city: reg.city,
        venueLat: reg.lat,
        venueLng: reg.lng,
        venueZone,
        teams: applied,
      });
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Run
// ──────────────────────────────────────────────────────────────────────────

function writeJson(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  console.log(`wrote ${path}`);
}

function main() {
  console.log("Building training set...");
  const { rows: train, unmatched } = buildTrainSet();
  console.log(`  ${train.length} enriched training rows`);
  if (unmatched.size > 0) {
    const top = [...unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    console.log(`  ${unmatched.size} unmatched team names (top 8 by count):`);
    for (const [t, n] of top) console.log(`    ${t} (${n})`);
  }

  console.log("\nLayer 2 — Host lift");
  const hostLift = buildHostLift(train);
  for (const c of hostLift) {
    const tag = c.level === "tier" ? `[tier ${c.tier}]` : "[aggregate]";
    const flag = c.level === "tier" && c.n < MIN_CELL_N ? " (sparse — falls back to aggregate)" : "";
    console.log(
      `  ${tag.padEnd(13)} ${c.gender}: n=${String(c.n).padStart(3)} obs=${(c.observed * 100).toFixed(1)}% exp=${(c.expected * 100).toFixed(1)}% OR=${c.oddsRatio.toFixed(2)}${flag}`,
    );
  }
  writeJson("src/data/projections/host-lift.json", hostLift);

  console.log("\nLayer 3 — Distance lift");
  const distLift = buildDistanceLift(train);
  for (const c of distLift) {
    const tag = c.level === "tier" ? `[tier ${c.tier}]` : "[aggregate]";
    const flag = c.n < MIN_CELL_N ? " (sparse — falls back)" : "";
    console.log(
      `  ${tag.padEnd(13)} ${c.gender} ${c.bucket.padEnd(8)} n=${String(c.n).padStart(3)} obs=${(c.observed * 100).toFixed(1)}% exp=${(c.expected * 100).toFixed(1)}% OR=${c.oddsRatio.toFixed(2)}${flag}`,
    );
  }
  writeJson("src/data/projections/distance-lift.json", distLift);

  console.log("\nLayer 4 — Zone-crossing lift");
  const zoneLift = buildZoneLift(train);
  for (const c of zoneLift) {
    if (c.level === "crossing") {
      console.log(
        `    [crossing] ${c.gender} ${c.from}->${String(c.to).padEnd(5)} n=${String(c.n).padStart(4)} obs=${(c.observed * 100).toFixed(1)}% OR=${c.oddsRatio.toFixed(2)}`,
      );
    } else if (c.level === "aggregate") {
      console.log(
        `  [aggregate]  ${c.gender} ${String(c.in_or_out).padEnd(3)} n=${String(c.n).padStart(4)} obs=${(c.observed * 100).toFixed(1)}% exp=${(c.expected * 100).toFixed(1)}% OR=${c.oddsRatio.toFixed(2)}`,
      );
    } else {
      console.log(
        `  [tier]       ${c.gender} ${c.tier} ${String(c.in_or_out).padEnd(3)} n=${String(c.n).padStart(4)} obs=${(c.observed * 100).toFixed(1)}% OR=${c.oddsRatio.toFixed(2)}`,
      );
    }
  }
  writeJson("src/data/projections/zone-lift.json", zoneLift);

  console.log("\nApplying to 2026 regionals...");
  const perTeam = applyToCurrentRegionals(hostLift, distLift, zoneLift);
  console.log(`  ${perTeam.length} regionals processed`);
  for (const r of perTeam) {
    const sum = r.teams.reduce((s, t) => s + t.finalPct, 0);
    console.log(
      `  ${r.gender.padEnd(5)} ${r.name.padEnd(28)} teams=${String(r.teams.length).padStart(2)} sum=${sum.toFixed(2)}%`,
    );
  }
  writeJson("src/data/projections/per-team-2026.json", {
    builtAt: new Date().toISOString(),
    teamsAdvancing: TEAMS_ADVANCING,
    regionals: perTeam,
  });
}

main();
