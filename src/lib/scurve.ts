import { haversineDistance } from "@/lib/geo";
import type { TeamData } from "@/data/rankings-men";
import type { Regional } from "@/data/regionals-men-2026";
import type { Championship } from "@/data/championships-men-2026";
import type { ActualSelection } from "@/data/regionals-actual-men-2026";
import { CHAMPIONSHIP_STRUCTURE } from "@/data/ncaa-selection-rules";

export interface ScurveAssignment extends TeamData {
  seed: number;
  regionalId: number;
  distanceMiles: number;
}

export type ScurveMode = "strict" | "committee" | "actual";

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
 * Derive auto-qualifiers from a team list. If championships with confirmed
 * winners are provided, those teams get the AQ. Otherwise the top-ranked
 * team per conference is the predicted AQ.
 * Mirrors the logic in championships.ts so conference + regional pages agree.
 */
function deriveAutoQualifiers(
  teams: TeamData[],
  championships?: Championship[]
): TeamData[] {
  // Build confirmed-winner lookup: conference -> winner team name
  const confirmedWinners = new Map<string, string>();
  if (championships) {
    for (const c of championships) {
      if (c.winner) confirmedWinners.set(c.conference, c.winner);
    }
  }

  const topByConf = new Map<string, number>();
  for (let i = 0; i < teams.length; i++) {
    const winner = confirmedWinners.get(teams[i].conference);
    if (winner) {
      // Confirmed winner: match by team name
      if (teams[i].team === winner) topByConf.set(teams[i].conference, i);
    } else {
      // Predicted: top-ranked team
      const cur = topByConf.get(teams[i].conference);
      if (cur === undefined || teams[i].rank < teams[cur].rank) {
        topByConf.set(teams[i].conference, i);
      }
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
 *   1. Top 6 seeds assigned to closest available regional (greedy by seed order)
 *   2. Seeds 7+ serpentine by regional strength order (competitive balance)
 *   3. Host schools guaranteed their home regional (all tiers)
 *   4. Regional position 12+: geographic preference swaps (>1200 mi threshold)
 */
export function computeScurve(
  teams: TeamData[],
  regionals: Regional[],
  mode: ScurveMode = "committee",
  gender: "men" | "women" = "men",
  championships?: Championship[],
  actualSelections?: ActualSelection[] | null
): ScurveAssignment[] {
  // "Actual" mode bypasses the predictive pipeline entirely — it renders the
  // field exactly as the selection committee announced it. If we ever ask for
  // "actual" but no data has been published yet, fall back to "committee" so
  // the page never renders empty.
  if (mode === "actual") {
    if (actualSelections && actualSelections.length > 0) {
      return computeActualScurve(teams, regionals, actualSelections);
    }
    mode = "committee";
  }

  const teamsWithAqs = deriveAutoQualifiers(teams, championships);
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
 * ACTUAL: Replays the official committee announcement.
 *
 * No serpentine, no host swaps, no geographic adjustments — the committee
 * has already done all of that and published the result. We just join each
 * announced selection back to our `TeamData` (for conference, AWP, lat/lng,
 * W-L) so the downstream views (Map, Regional, S-Curve, Visual, Breakdown,
 * Manual Grid, Advancement) get the same shape they expect.
 *
 * If a team in `actualSelections` doesn't match any team in `teams`, we
 * still surface it with placeholder fields rather than dropping it — the
 * announcement is the source of truth, and a missing match is a data bug
 * we want visible (zero distance, no map dot) rather than silently hidden.
 */
function computeActualScurve(
  teams: TeamData[],
  regionals: Regional[],
  actualSelections: ActualSelection[]
): ScurveAssignment[] {
  const teamLookup = new Map<string, TeamData>();
  for (const t of teams) teamLookup.set(t.team, t);

  const assignments: ScurveAssignment[] = actualSelections.map((sel) => {
    const base = teamLookup.get(sel.team);
    if (base) {
      return {
        ...base,
        seed: sel.seed,
        regionalId: sel.regionalId,
        distanceMiles: 0,
      };
    }
    // Unknown team — keep it visible with empty stats so the bug shows up
    // on the page instead of disappearing silently.
    return {
      rank: 9999,
      team: sel.team,
      conference: "",
      events: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      eligible: true,
      isAutoQualifier: false,
      aqConference: null,
      lat: 0,
      lng: 0,
      seed: sel.seed,
      regionalId: sel.regionalId,
      distanceMiles: 0,
    };
  });

  assignments.sort((a, b) => a.seed - b.seed);
  calculateDistances(assignments, regionals);
  return assignments;
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
 * 1. Top 6 seeds assigned to closest available regional (greedy by seed order)
 * 2. Seeds 7+ serpentine by REGIONAL STRENGTH ORDER (weakest regional gets
 *    best 2-seed, strongest gets worst 2-seed — the core balancing mechanism)
 * 3. Host schools guaranteed home regional (within-tier swaps)
 * 4. Regional positions 12-13: geographic preference swaps for teams >1200 mi from regional
 * 5. Regional position 14 (men only): closest-site placement (greedy by seed),
 *    unconstrained by strength order — any 3 of the 6 sites can host a 14-seed
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

  const assignments: ScurveAssignment[] = teams.map((team, index) => ({
    ...team,
    seed: index + 1,
    regionalId: -1,
    distanceMiles: 0,
  }));

  // -------------------------------------------------------------------
  // PHASE 1: Assign top 6 seeds to closest available regional
  // Host schools in the top 6 are locked to their home regional first,
  // then remaining top seeds pick closest available in seed order.
  // -------------------------------------------------------------------
  const availableRegionals = new Set(regionals.map((r) => r.id));

  for (let i = 0; i < numRegionals && i < assignments.length; i++) {
    const homeId = hostToRegional.get(assignments[i].team);
    if (homeId !== undefined && availableRegionals.has(homeId)) {
      assignments[i].regionalId = homeId;
      availableRegionals.delete(homeId);
    }
  }

  const unassigned = assignments
    .slice(0, numRegionals)
    .filter((a) => a.regionalId === -1);
  unassigned.sort((a, b) => a.seed - b.seed);

  for (const team of unassigned) {
    let bestId = -1;
    let bestDist = Infinity;
    for (const rId of availableRegionals) {
      const r = regionalMap.get(rId)!;
      const d = haversineDistance(team.lat, team.lng, r.lat, r.lng);
      if (d < bestDist) {
        bestDist = d;
        bestId = rId;
      }
    }
    team.regionalId = bestId;
    availableRegionals.delete(bestId);
  }

  // -------------------------------------------------------------------
  // PHASE 2: Serpentine seeds 7+ by REGIONAL STRENGTH ORDER
  // Strength = order of the top seed placed there in Phase 1.
  // strengthOrder[0] = regional ID of the strongest (has #1 overall seed)
  // strengthOrder[5] = regional ID of the weakest (has #6 overall seed)
  // -------------------------------------------------------------------
  const strengthOrder = assignments
    .slice(0, numRegionals)
    .sort((a, b) => a.seed - b.seed)
    .map((a) => a.regionalId);

  for (let tier = 1; tier * numRegionals < assignments.length; tier++) {
    const tierStart = tier * numRegionals;
    const tierEnd = Math.min(tierStart + numRegionals, assignments.length);
    const isReverseTier = tier % 2 === 1;

    const tierRegionalOrder: number[] = [];
    for (let p = 0; p < numRegionals; p++) {
      const strengthIdx = isReverseTier ? numRegionals - 1 - p : p;
      tierRegionalOrder.push(strengthOrder[strengthIdx]);
    }

    const hostAssignedRegionals = new Set<number>();
    for (let i = tierStart; i < tierEnd; i++) {
      const homeId = hostToRegional.get(assignments[i].team);
      if (homeId !== undefined) {
        assignments[i].regionalId = homeId;
        hostAssignedRegionals.add(homeId);
      }
    }

    const remainingRegionals = tierRegionalOrder.filter(
      (r) => !hostAssignedRegionals.has(r)
    );
    let rIdx = 0;
    for (let i = tierStart; i < tierEnd; i++) {
      if (assignments[i].regionalId !== -1) continue;
      assignments[i].regionalId = remainingRegionals[rIdx++];
    }
  }

  // -------------------------------------------------------------------
  // PHASE 4: Geographic preference for regional positions 12-13
  // Only the bottom of each regional bracket (the weakest AQs who
  // wouldn't have gotten an at-large) get geographic adjustment.
  // Seeds 2-11 within each regional are pure serpentine.
  // Position 14 is handled separately in Phase 4b (men's only — closest
  // site, unconstrained by strength order).
  // -------------------------------------------------------------------
  const GEO_DISTANCE_THRESHOLD = 1200;
  const GEO_SWAP_MIN_POSITION = 12;
  const POSITION_14 = 14;

  for (let i = 0; i < assignments.length; i++) {
    const team = assignments[i];
    const tier = Math.floor(i / numRegionals);
    const regionalPosition = tier + 1;
    if (regionalPosition < GEO_SWAP_MIN_POSITION) continue;
    if (regionalPosition === POSITION_14) continue; // handled in Phase 4b
    if (team.lat === 0 && team.lng === 0) continue;

    const regional = regionalMap.get(team.regionalId)!;
    const dist = haversineDistance(team.lat, team.lng, regional.lat, regional.lng);

    if (dist <= GEO_DISTANCE_THRESHOLD) continue;

    const tierStart = tier * numRegionals;
    const tierEnd = Math.min(tierStart + numRegionals, assignments.length);

    let bestSwapIdx = -1;
    let bestImprovement = 0;

    for (let j = tierStart; j < tierEnd; j++) {
      if (j === i) continue;
      const other = assignments[j];

      if (hostToRegional.has(other.team) && hostToRegional.get(other.team) === other.regionalId) continue;
      if (other.lat === 0 && other.lng === 0) continue;

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
  // PHASE 4b: Closest-site placement for regional position 14 (men only)
  //
  // Men's field is 81 teams across 6 regionals → the last tier has only
  // 3 teams (seeds #79, #80, #81), each filling the 14th slot in 3 of
  // the 6 regionals. The strict S-curve (and Phase 2's serpentine) would
  // push these 3 teams into the "last 3 sites" by strength order. The
  // committee instead places each at its closest available site, so any
  // 3 of the 6 sites can end up hosting a 14-seed (no requirement that
  // the 14-seed sites be contiguous in the strength ordering).
  //
  // Women's field (72) has no position-14 slot, so this phase no-ops.
  //
  // Order of operations:
  //   1. Hosts at position 14 → home regional (host rule still wins)
  //   2. Remaining position-14 teams in seed order → closest unused site
  //      (with no-lat/lng teams falling back to lowest-numbered free site)
  // -------------------------------------------------------------------
  const position14Indices: number[] = [];
  for (let i = 0; i < assignments.length; i++) {
    const tier = Math.floor(i / numRegionals);
    if (tier + 1 === POSITION_14) position14Indices.push(i);
  }

  if (position14Indices.length > 0) {
    const usedRegionals = new Set<number>();

    // Step 1: Hosts at position 14 lock to their home regional.
    const needsAssignment: number[] = [];
    for (const idx of position14Indices) {
      const team = assignments[idx];
      const homeId = hostToRegional.get(team.team);
      if (homeId !== undefined) {
        team.regionalId = homeId;
        usedRegionals.add(homeId);
      } else {
        needsAssignment.push(idx);
      }
    }

    // Step 2: Greedy by seed — each non-host position-14 team picks
    // its closest available (unused) site.
    needsAssignment.sort((a, b) => assignments[a].seed - assignments[b].seed);
    for (const idx of needsAssignment) {
      const team = assignments[idx];

      // Fallback for teams with no geographic data: pick the lowest-id
      // unused regional. Keeps behavior deterministic without skewing
      // distance stats. In practice all teams have lat/lng populated.
      if (team.lat === 0 && team.lng === 0) {
        const fallback = regionals.find((r) => !usedRegionals.has(r.id));
        if (fallback) {
          team.regionalId = fallback.id;
          usedRegionals.add(fallback.id);
        }
        continue;
      }

      let bestId = -1;
      let bestDist = Infinity;
      for (const r of regionals) {
        if (usedRegionals.has(r.id)) continue;
        const d = haversineDistance(team.lat, team.lng, r.lat, r.lng);
        if (d < bestDist) {
          bestDist = d;
          bestId = r.id;
        }
      }
      if (bestId !== -1) {
        team.regionalId = bestId;
        usedRegionals.add(bestId);
      }
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
