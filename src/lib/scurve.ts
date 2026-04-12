import { haversineDistance } from "@/lib/geo";
import type { TeamData } from "@/data/rankings-men";
import type { Regional } from "@/data/regionals-men-2026";

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
 * Compute the S-curve (serpentine) regional assignment for NCAA D1 golf.
 *
 * Two modes:
 * - "strict": Pure mathematical serpentine with host swaps only.
 * - "committee": Replicates how the NCAA committee actually assigns regionals:
 *   1. Top seeds (1-6) assigned to closest regional site (not strict serpentine)
 *   2. Host schools guaranteed their home regional
 *   3. Auto-qualifiers (seeds ~12-13) get geographic preference
 *   4. Standard serpentine for remaining seeds
 */
export function computeScurve(
  teams: TeamData[],
  regionals: Regional[],
  mode: ScurveMode = "committee"
): ScurveAssignment[] {
  // Filter out ineligible teams, but keep auto-qualifiers (AQ wins conference regardless)
  const eligible = teams.filter((t) => t.eligible || t.isAutoQualifier);
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
 * 1. Top 6 seeds assigned to closest available regional (not serpentine order)
 * 2. Host schools guaranteed home regional
 * 3. AQs seeded 12+ get geographic preference (won't be shipped cross-country)
 * 4. Standard serpentine fills remaining slots
 */
function computeCommitteeScurve(
  teams: TeamData[],
  regionals: Regional[]
): ScurveAssignment[] {
  const numRegionals = regionals.length;

  // Build regional map for distance lookups
  const regionalMap = new Map<number, Regional>();
  for (const r of regionals) {
    regionalMap.set(r.id, r);
  }

  // Initialize all assignments with seeds
  const assignments: ScurveAssignment[] = teams.map((team, index) => ({
    ...team,
    seed: index + 1,
    regionalId: -1, // will be assigned
    distanceMiles: 0,
  }));

  // Track which regional slots are taken per tier
  // Each regional can hold ceil(teams.length / numRegionals) teams
  const regionalCounts = new Map<number, number>();
  const maxPerRegional = Math.ceil(teams.length / numRegionals);
  for (const r of regionals) {
    regionalCounts.set(r.id, 0);
  }

  // Identify host schools
  const hostToRegional = new Map<string, number>();
  for (const r of regionals) {
    hostToRegional.set(r.host, r.id);
  }

  // -------------------------------------------------------------------
  // PHASE 1: Assign top seeds (1-6) to closest regional
  // The committee looks at which regional site is closest to each 1-seed,
  // rather than doing strict serpentine for the top line.
  // -------------------------------------------------------------------
  const topSeeds = assignments.slice(0, numRegionals);
  const availableRegionals = new Set(regionals.map((r) => r.id));

  // First, lock in any host school that's a top seed
  for (const team of topSeeds) {
    const homeRegionalId = hostToRegional.get(team.team);
    if (homeRegionalId !== undefined && availableRegionals.has(homeRegionalId)) {
      team.regionalId = homeRegionalId;
      availableRegionals.delete(homeRegionalId);
      regionalCounts.set(homeRegionalId, (regionalCounts.get(homeRegionalId) ?? 0) + 1);
    }
  }

  // Then assign remaining top seeds by proximity (closest available regional)
  const unassignedTopSeeds = topSeeds.filter((t) => t.regionalId === -1);

  // Sort by seed to give higher seeds first pick
  unassignedTopSeeds.sort((a, b) => a.seed - b.seed);

  for (const team of unassignedTopSeeds) {
    let bestRegionalId = -1;
    let bestDist = Infinity;

    for (const rId of availableRegionals) {
      const r = regionalMap.get(rId)!;
      const dist = haversineDistance(team.lat, team.lng, r.lat, r.lng);
      if (dist < bestDist) {
        bestDist = dist;
        bestRegionalId = rId;
      }
    }

    team.regionalId = bestRegionalId;
    availableRegionals.delete(bestRegionalId);
    regionalCounts.set(bestRegionalId, (regionalCounts.get(bestRegionalId) ?? 0) + 1);
  }

  // -------------------------------------------------------------------
  // PHASE 2: Standard serpentine for seeds 7+ (tier 1 onwards)
  // -------------------------------------------------------------------
  const remainingTeams = assignments.slice(numRegionals);

  for (let i = 0; i < remainingTeams.length; i++) {
    const overallIndex = numRegionals + i;
    const tier = Math.floor(overallIndex / numRegionals);
    const posInTier = overallIndex % numRegionals;
    const isReverseTier = tier % 2 === 1;
    const regionalIndex = isReverseTier
      ? numRegionals - 1 - posInTier
      : posInTier;

    remainingTeams[i].regionalId = regionals[regionalIndex].id;
    regionalCounts.set(
      regionals[regionalIndex].id,
      (regionalCounts.get(regionals[regionalIndex].id) ?? 0) + 1
    );
  }

  // -------------------------------------------------------------------
  // PHASE 3: Host school swaps for seeds 7+
  // -------------------------------------------------------------------
  applyHostSwaps(assignments, regionals, numRegionals);

  // -------------------------------------------------------------------
  // PHASE 4: AQ geographic preference
  // Auto-qualifiers seeded 12+ shouldn't be shipped cross-country.
  // If an AQ is >1200 miles from its regional, try to swap with a
  // non-AQ in the same tier that's closer to that regional.
  // -------------------------------------------------------------------
  const AQ_DISTANCE_THRESHOLD = 1200; // miles

  for (let i = numRegionals; i < assignments.length; i++) {
    const team = assignments[i];
    if (!team.isAutoQualifier) continue;
    if (team.seed < 12) continue; // only for lower-seeded AQs

    const regional = regionalMap.get(team.regionalId)!;
    const dist = haversineDistance(team.lat, team.lng, regional.lat, regional.lng);

    if (dist <= AQ_DISTANCE_THRESHOLD) continue;

    // Find a better regional for this AQ
    const tier = Math.floor((team.seed - 1) / numRegionals);
    const tierStart = tier * numRegionals;
    const tierEnd = Math.min(tierStart + numRegionals, assignments.length);

    let bestSwapIdx = -1;
    let bestImprovement = 0;

    for (let j = tierStart; j < tierEnd; j++) {
      if (j === i) continue;
      const other = assignments[j];

      // Don't swap with hosts or other AQs
      if (hostToRegional.has(other.team) && hostToRegional.get(other.team) === other.regionalId) continue;

      const otherRegional = regionalMap.get(other.regionalId)!;

      // Calculate distances if they swapped
      const teamToOtherRegional = haversineDistance(team.lat, team.lng, otherRegional.lat, otherRegional.lng);
      const otherToTeamRegional = haversineDistance(other.lat, other.lng, regional.lat, regional.lng);

      // Only swap if it meaningfully improves the AQ's distance
      // and doesn't make the other team's situation dramatically worse
      const aqImprovement = dist - teamToOtherRegional;
      const otherPenalty = otherToTeamRegional - haversineDistance(other.lat, other.lng, otherRegional.lat, otherRegional.lng);

      if (aqImprovement > 200 && aqImprovement > otherPenalty && aqImprovement > bestImprovement) {
        bestSwapIdx = j;
        bestImprovement = aqImprovement;
      }
    }

    if (bestSwapIdx !== -1) {
      const temp = assignments[bestSwapIdx].regionalId;
      assignments[bestSwapIdx].regionalId = team.regionalId;
      assignments[i].regionalId = temp;
    }
  }

  // -------------------------------------------------------------------
  // PHASE 5: Calculate final distances
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
