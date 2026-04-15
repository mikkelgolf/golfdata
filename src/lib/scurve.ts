import { haversineDistance } from "@/lib/geo";
import type { TeamData } from "@/data/rankings-men";
import type { Regional } from "@/data/regionals-men-2026";
import { CHAMPIONSHIP_STRUCTURE } from "@/data/ncaa-selection-rules";

export interface ScurveAssignment extends TeamData {
  seed: number;
  regionalId: number;
  distanceMiles: number;
}

export type ScurveMode = "strict" | "committee";

/**
 * Compute regional strength seeds (1..N) from S-curve assignments.
 * The regional whose best team has the lowest overall seed is Regional 1,
 * next is 2, etc. Matches NCAA convention for announcing regionals.
 */
export function computeRegionalSeeds(
  assignments: ScurveAssignment[]
): Map<number, number> {
  const map = new Map<number, number>();
  if (assignments.length === 0) return map;
  const minSeedByRegional = new Map<number, number>();
  for (const a of assignments) {
    const current = minSeedByRegional.get(a.regionalId);
    if (current === undefined || a.seed < current) {
      minSeedByRegional.set(a.regionalId, a.seed);
    }
  }
  const ordered = [...minSeedByRegional.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => id);
  ordered.forEach((id, idx) => map.set(id, idx + 1));
  return map;
}

/**
 * Map of teamName -> position within the team's own regional (1..N).
 * Distinct from computeRegionalSeeds, which ranks regionals by strength.
 * The 6th-best seed in Regional 2 returns 6, not 33.
 */
export function computeRegionalPositions(
  assignments: ScurveAssignment[]
): Map<string, number> {
  const byRegional = new Map<number, ScurveAssignment[]>();
  for (const a of assignments) {
    const arr = byRegional.get(a.regionalId) ?? [];
    arr.push(a);
    byRegional.set(a.regionalId, arr);
  }
  const out = new Map<string, number>();
  for (const arr of byRegional.values()) {
    arr.sort((a, b) => a.seed - b.seed);
    arr.forEach((t, i) => out.set(t.team, i + 1));
  }
  return out;
}

/**
 * Derive predicted auto-qualifiers from a team list: the top-ranked team
 * in each conference is the predicted conference champion and earns an AQ.
 * Mirrors the logic in championships.ts so conference + regional pages agree.
 */
function deriveAutoQualifiers(teams: TeamData[]): TeamData[] {
  const topByConf = new Map<string, number>();
  for (let i = 0; i < teams.length; i++) {
    const cur = topByConf.get(teams[i].conference);
    if (cur === undefined || teams[i].rank < teams[cur].rank) {
      topByConf.set(teams[i].conference, i);
    }
  }
  return teams.map((t, i) => ({
    ...t,
    isAutoQualifier: topByConf.get(t.conference) === i,
    aqConference: topByConf.get(t.conference) === i ? t.conference : null,
  }));
}

/**
 * Compute the S-curve (serpentine) regional assignment for NCAA D1 golf.
 *
 * Two modes:
 * - "strict": Pure mathematical serpentine with host swaps only.
 * - "committee": Replicates how the NCAA committee actually assigns regionals:
 *   1. #1 seed assigned to closest regional site
 *   2. Seeds 2-9: pure serpentine
 *   3. Host schools guaranteed their home regional (all tiers)
 *   4. Seeds 10+: geographic preference swaps (>1200 mi threshold)
 */
export function computeScurve(
  teams: TeamData[],
  regionals: Regional[],
  mode: ScurveMode = "committee",
  gender: "men" | "women" = "men"
): ScurveAssignment[] {
  const teamsWithAqs = deriveAutoQualifiers(teams);
  const fieldSize = CHAMPIONSHIP_STRUCTURE.totalFieldSize[gender];
  const allEligible = teamsWithAqs.filter((t) => t.eligible || t.isAutoQualifier);

  // AQs are guaranteed spots; fill remaining with top at-large by ranking
  const aqs = allEligible.filter((t) => t.isAutoQualifier);
  const atLarge = allEligible
    .filter((t) => !t.isAutoQualifier)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, Math.max(0, fieldSize - aqs.length));

  const eligible = [...aqs, ...atLarge].sort((a, b) => a.rank - b.rank);

  if (mode === "strict") {
    return computeStrictScurve(eligible, regionals);
  }
  return computeCommitteeScurve(eligible, regionals);
}

/**
 * STRICT S-CURVE: Pure mathematical serpentine + host swaps only.
 * This is what a computer would output with no human judgment.
 */
function computeStrictScurve(
  teams: TeamData[],
  regionals: Regional[]
): ScurveAssignment[] {
  const numRegionals = regionals.length;

  // Step 1: Initial serpentine assignment
  const assignments: ScurveAssignment[] = teams.map((team, index) => {
    const tier = Math.floor(index / numRegionals);
    const posInTier = index % numRegionals;
    const isReverseTier = tier % 2 === 1;
    const regionalIndex = isReverseTier
      ? numRegionals - 1 - posInTier
      : posInTier;

    return {
      ...team,
      seed: index + 1,
      regionalId: regionals[regionalIndex].id,
      distanceMiles: 0,
    };
  });

  // Step 2: Host school swaps (only adjustment in strict mode)
  applyHostSwaps(assignments, regionals);

  // Step 3: Calculate distances
  calculateDistances(assignments, regionals);

  return assignments;
}

/**
 * COMMITTEE S-CURVE: Replicates the NCAA selection committee's approach.
 *
 * Key differences from strict:
 * 1. #1 overall seed placed at closest regional
 * 2. Seeds 2-9: pure serpentine, no geographic optimization
 * 3. Host schools guaranteed home regional (all tiers)
 * 4. Seeds 10+: geographic preference swaps for teams >1200 mi from regional
 */
function computeCommitteeScurve(
  teams: TeamData[],
  regionals: Regional[]
): ScurveAssignment[] {
  const numRegionals = regionals.length;

  const regionalMap = new Map<number, Regional>();
  for (const r of regionals) {
    regionalMap.set(r.id, r);
  }

  const hostToRegional = new Map<string, number>();
  for (const r of regionals) {
    hostToRegional.set(r.host, r.id);
  }

  // Start with pure serpentine for all teams
  const assignments: ScurveAssignment[] = teams.map((team, index) => {
    const tier = Math.floor(index / numRegionals);
    const posInTier = index % numRegionals;
    const isReverseTier = tier % 2 === 1;
    const regionalIndex = isReverseTier
      ? numRegionals - 1 - posInTier
      : posInTier;

    return {
      ...team,
      seed: index + 1,
      regionalId: regionals[regionalIndex].id,
      distanceMiles: 0,
    };
  });

  // -------------------------------------------------------------------
  // PHASE 1: Lock #1 seed to closest regional
  // -------------------------------------------------------------------
  if (assignments.length > 0) {
    const topSeed = assignments[0];
    let closestId = topSeed.regionalId;
    let closestDist = Infinity;

    for (const r of regionals) {
      const d = haversineDistance(topSeed.lat, topSeed.lng, r.lat, r.lng);
      if (d < closestDist) {
        closestDist = d;
        closestId = r.id;
      }
    }

    if (closestId !== topSeed.regionalId) {
      const swapIdx = assignments
        .slice(0, numRegionals)
        .findIndex((a) => a.regionalId === closestId);
      if (swapIdx !== -1) {
        assignments[swapIdx].regionalId = topSeed.regionalId;
      }
      topSeed.regionalId = closestId;
    }
  }

  // -------------------------------------------------------------------
  // PHASE 2: Host school swaps (all tiers)
  // -------------------------------------------------------------------
  applyHostSwaps(assignments, regionals);

  // -------------------------------------------------------------------
  // PHASE 3: Geographic preference for seeds 10+
  // Teams seeded 10+ that are >1200 miles from their regional can be
  // swapped with a same-tier team if it meaningfully reduces travel.
  // -------------------------------------------------------------------
  const GEO_DISTANCE_THRESHOLD = 1200;

  for (let i = 0; i < assignments.length; i++) {
    const team = assignments[i];
    if (team.seed < 10) continue;

    const regional = regionalMap.get(team.regionalId)!;
    const dist = haversineDistance(team.lat, team.lng, regional.lat, regional.lng);

    if (dist <= GEO_DISTANCE_THRESHOLD) continue;

    const tier = Math.floor(i / numRegionals);
    const tierStart = tier * numRegionals;
    const tierEnd = Math.min(tierStart + numRegionals, assignments.length);

    let bestSwapIdx = -1;
    let bestImprovement = 0;

    for (let j = tierStart; j < tierEnd; j++) {
      if (j === i) continue;
      const other = assignments[j];

      if (hostToRegional.has(other.team) && hostToRegional.get(other.team) === other.regionalId) continue;

      const otherRegional = regionalMap.get(other.regionalId)!;

      const teamToOtherRegional = haversineDistance(team.lat, team.lng, otherRegional.lat, otherRegional.lng);
      const otherToTeamRegional = haversineDistance(other.lat, other.lng, regional.lat, regional.lng);

      const improvement = dist - teamToOtherRegional;
      const penalty = otherToTeamRegional - haversineDistance(other.lat, other.lng, otherRegional.lat, otherRegional.lng);

      if (improvement > 200 && improvement > penalty && improvement > bestImprovement) {
        bestSwapIdx = j;
        bestImprovement = improvement;
      }
    }

    if (bestSwapIdx !== -1) {
      const temp = assignments[bestSwapIdx].regionalId;
      assignments[bestSwapIdx].regionalId = team.regionalId;
      assignments[i].regionalId = temp;
    }
  }

  // -------------------------------------------------------------------
  // PHASE 4: Calculate final distances
  // -------------------------------------------------------------------
  calculateDistances(assignments, regionals);

  return assignments;
}

/**
 * Swap host schools into their home regional (within same seed tier).
 * @param startFrom - index to start checking from (skip already-handled seeds)
 */
function applyHostSwaps(
  assignments: ScurveAssignment[],
  regionals: Regional[],
  startFrom = 0
): void {
  const numRegionals = regionals.length;
  const hostToRegional = new Map<string, number>();
  for (const r of regionals) {
    hostToRegional.set(r.host, r.id);
  }

  for (let i = startFrom; i < assignments.length; i++) {
    const team = assignments[i];
    const homeRegionalId = hostToRegional.get(team.team);

    if (homeRegionalId !== undefined && team.regionalId !== homeRegionalId) {
      const tier = Math.floor(i / numRegionals);
      const tierStart = tier * numRegionals;
      const tierEnd = Math.min(tierStart + numRegionals, assignments.length);

      let swapIndex = -1;
      for (let j = tierStart; j < tierEnd; j++) {
        if (assignments[j].regionalId === homeRegionalId) {
          swapIndex = j;
          break;
        }
      }

      if (swapIndex !== -1) {
        const temp = assignments[swapIndex].regionalId;
        assignments[swapIndex].regionalId = team.regionalId;
        assignments[i].regionalId = temp;
      }
    }
  }
}

/**
 * Calculate haversine distances from each team to its assigned regional.
 */
function calculateDistances(
  assignments: ScurveAssignment[],
  regionals: Regional[]
): void {
  const regionalMap = new Map<number, Regional>();
  for (const r of regionals) {
    regionalMap.set(r.id, r);
  }

  for (const a of assignments) {
    const regional = regionalMap.get(a.regionalId)!;
    a.distanceMiles = Math.round(
      haversineDistance(a.lat, a.lng, regional.lat, regional.lng)
    );
  }
}
