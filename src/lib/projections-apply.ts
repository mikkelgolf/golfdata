/**
 * Runtime application of the layered projection model.
 *
 * Pulls the four pretrained layer tables (seed-baseline, host-lift,
 * distance-lift, zone-lift) and applies them to a live S-curve assignment
 * to produce per-team advancement probabilities. Used by the Advancement
 * Model UI so the projection reflects whichever bracket mode the user has
 * picked (committee / strict / actual) — same math the build script uses
 * to produce per-team-2026.json, but driven by the active assignments
 * instead of a hard-coded mode.
 */
import { haversineDistance } from "@/lib/geo";
import {
  combineLayers,
  distanceBucket,
  normalizeToFive,
  seedTier,
  smoothRate,
  zoneFromCoords,
  type SeedTier,
} from "@/lib/projections";
import { computeRegionalPositions, type ScurveAssignment } from "@/lib/scurve";
import type { Regional } from "@/data/regionals-men-2026";
import type { ClimateZone } from "@/data/climate-zones";

const HOST_RADIUS_MILES = 30;
const MIN_CELL_N = 15;

export type Gender = "men" | "women";

export interface SeedCell {
  gender: Gender;
  seed: number;
  n_apps: number;
  n_advanced: number;
  rate: number;
}

export interface AppliedTeam {
  team: string;
  rank: number;
  conference: string;
  seed: number;
  isHost: boolean;
  travelMi: number;
  zoneCrossing: string;
  baseRatePct: number;
  afterHostPct: number;
  afterDistancePct: number;
  afterZonePct: number;
  finalPct: number;
}

export interface AppliedRegional {
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

// Loose structural typing on the lift tables matches the JSON shape —
// each row has gender + level + an oddsRatio + n, plus level-specific
// fields (tier, in_or_out, from, to, bucket) that the lookup helpers
// inspect via runtime guards. `gender` is `string` (not `Gender`) because
// JSON imports widen the literal — comparisons inside the helpers narrow it.
type LiftCell = {
  gender: string;
  level: string;
  n: number;
  oddsRatio: number;
} & Record<string, unknown>;
type LiftTable = LiftCell[];

function findSeedCell(
  seedBaseline: SeedCell[],
  gender: Gender,
  seed: number,
): SeedCell | null {
  return (
    seedBaseline.find((c) => c.gender === gender && c.seed === seed) ?? null
  );
}

function lookupHostOR(
  hostLift: LiftTable,
  gender: Gender,
  isHost: boolean,
  tier: SeedTier,
): number {
  if (!isHost) return 1;
  const tierCell = hostLift.find(
    (c) => c.gender === gender && c.level === "tier" && c.tier === tier,
  );
  if (tierCell && tierCell.n >= MIN_CELL_N) return tierCell.oddsRatio;
  const agg = hostLift.find(
    (c) => c.gender === gender && c.level === "aggregate",
  );
  return agg?.oddsRatio ?? 1;
}

function lookupDistanceOR(
  distLift: LiftTable,
  gender: Gender,
  miles: number,
): number {
  const bucket = distanceBucket(miles);
  const agg = distLift.find(
    (c) => c.gender === gender && c.bucket === bucket && c.level === "aggregate",
  );
  if (!agg || agg.n < MIN_CELL_N) return 1;
  return agg.oddsRatio;
}

function lookupZoneOR(
  zoneLift: LiftTable,
  gender: Gender,
  fromZone: ClimateZone,
  toZone: ClimateZone,
  tier: SeedTier,
): number {
  const isIn = fromZone === toZone;
  const crossing = zoneLift.find(
    (c) =>
      c.gender === gender &&
      c.level === "crossing" &&
      c.from === fromZone &&
      c.to === toZone,
  );
  if (crossing && crossing.n >= MIN_CELL_N) return crossing.oddsRatio;
  const tierCell = zoneLift.find(
    (c) =>
      c.gender === gender &&
      c.level === "tier" &&
      c.tier === tier &&
      c.in_or_out === (isIn ? "in" : "out"),
  );
  if (tierCell && tierCell.n >= MIN_CELL_N) return tierCell.oddsRatio;
  const agg = zoneLift.find(
    (c) =>
      c.gender === gender &&
      c.level === "aggregate" &&
      c.in_or_out === (isIn ? "in" : "out"),
  );
  return agg?.oddsRatio ?? 1;
}

/**
 * Apply the layered projection to a live S-curve assignment.
 *
 * Identical math to the build-time `applyToCurrentRegionals` in
 * `scripts/build-projections-data.ts`, but parameterised on assignments so
 * the UI can call it for any of the three S-curve modes.
 */
export function applyProjection(args: {
  assignments: ScurveAssignment[];
  regionals: Regional[];
  gender: Gender;
  hostLift: LiftTable;
  distLift: LiftTable;
  zoneLift: LiftTable;
  seedBaseline: SeedCell[];
}): AppliedRegional[] {
  const {
    assignments,
    regionals,
    gender,
    hostLift,
    distLift,
    zoneLift,
    seedBaseline,
  } = args;

  if (assignments.length === 0) return [];

  const regionalPositions = computeRegionalPositions(assignments);
  const out: AppliedRegional[] = [];

  for (const reg of regionals) {
    const venueZone = zoneFromCoords(reg.lat, reg.lng);
    if (!venueZone) continue;

    const fieldAssignments = assignments.filter((a) => a.regionalId === reg.id);
    const applied: AppliedTeam[] = [];

    for (const a of fieldAssignments) {
      const teamZone = zoneFromCoords(a.lat, a.lng);
      if (!teamZone) continue;

      const regionalSeed = regionalPositions.get(a.team) ?? 99;
      const cell = findSeedCell(seedBaseline, gender, regionalSeed);
      const base = cell ? smoothRate(cell.n_advanced, cell.n_apps) : 0.5;

      const dist = haversineDistance(a.lat, a.lng, reg.lat, reg.lng);
      const isHost = dist < HOST_RADIUS_MILES;

      const tier = seedTier(regionalSeed);
      const hostOR = lookupHostOR(hostLift, gender, isHost, tier);
      const distOR = lookupDistanceOR(distLift, gender, dist);
      const zoneOR = lookupZoneOR(zoneLift, gender, teamZone, venueZone, tier);

      const afterHost = combineLayers({
        baseRate: base,
        hostOR,
        distanceOR: 1,
        zoneOR: 1,
      });
      const afterDist = combineLayers({
        baseRate: base,
        hostOR,
        distanceOR: distOR,
        zoneOR: 1,
      });
      const afterZone = combineLayers({
        baseRate: base,
        hostOR,
        distanceOR: distOR,
        zoneOR,
      });

      applied.push({
        team: a.team,
        rank: a.rank,
        conference: a.conference,
        seed: regionalSeed,
        isHost,
        travelMi: Math.round(dist),
        zoneCrossing: `${teamZone}->${venueZone}`,
        baseRatePct: base * 100,
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
  return out;
}
