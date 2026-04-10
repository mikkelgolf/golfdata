import { haversineDistance } from "@/lib/geo";
import type { TeamData } from "@/data/rankings-men";
import type { Regional } from "@/data/regionals-men-2026";

export interface ScurveAssignment extends TeamData {
  seed: number;
  regionalId: number;
  distanceMiles: number;
}

/**
 * Compute the S-curve (serpentine) regional assignment for NCAA D1 golf.
 *
 * 1. Serpentine distribution: seeds 1-6 -> regionals 1-6,
 *    seeds 7-12 -> regionals 6-1, seeds 13-18 -> 1-6, etc.
 * 2. Host school swap: if a host school is in the field, swap it into
 *    the regional it hosts (swapping with the team originally assigned there
 *    in the same seed tier).
 * 3. Calculate distance from each team to its assigned regional.
 */
export function computeScurve(
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
      distanceMiles: 0, // will be calculated after swaps
    };
  });

  // Step 2: Host school swaps
  // Build a map of host school names to regional IDs
  const hostToRegional = new Map<string, number>();
  for (const r of regionals) {
    hostToRegional.set(r.host, r.id);
  }

  // For each host school in the field, swap it into its home regional
  for (let i = 0; i < assignments.length; i++) {
    const team = assignments[i];
    const homeRegionalId = hostToRegional.get(team.team);

    if (homeRegionalId !== undefined && team.regionalId !== homeRegionalId) {
      // Find the tier this team is in
      const tier = Math.floor(i / numRegionals);
      const tierStart = tier * numRegionals;
      const tierEnd = Math.min(tierStart + numRegionals, assignments.length);

      // Find the team in the same tier that is currently assigned to the home regional
      let swapIndex = -1;
      for (let j = tierStart; j < tierEnd; j++) {
        if (assignments[j].regionalId === homeRegionalId) {
          swapIndex = j;
          break;
        }
      }

      if (swapIndex !== -1) {
        // Swap regional assignments
        const temp = assignments[swapIndex].regionalId;
        assignments[swapIndex].regionalId = team.regionalId;
        assignments[i].regionalId = temp;
      }
    }
  }

  // Step 3: Calculate distances
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

  return assignments;
}
