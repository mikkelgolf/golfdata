/**
 * Travel-balance optimizer for the Manual Grid.
 *
 * The default grid placement uses a greedy nearest-host-first assignment.
 * That can leave a low-seeded team stuck on a cross-country flight while a
 * higher seed only saves a few miles. This optimizer reassigns teams within
 * each affected tier so the *total* mileage of that tier is minimised, even
 * if one team's individual distance increases.
 *
 * Constraints:
 *   - Optimization runs row-by-row (within a tier). Teams never cross tiers.
 *   - Host teams stay in their own regional column (David, 2026-04-28).
 *   - When `overrideSwaps` is false, slots whose team differs from the
 *     committee default are also locked, so the user's manual moves stick.
 *
 * The cutoff has two equivalent shapes — see {@link BalanceArgs} below.
 */

import { haversineDistance } from "@/lib/geo";
import { unserpentineIndex } from "@/lib/manual-grid";
import type { Regional } from "@/data/regionals-men-2026";
import type { TeamData } from "@/data/rankings-men";

export type Cells = (string | null)[][];

export type CutoffMode = "regional" | "overall";

export interface BalanceArgs {
  /** Current 2D grid (team-name-or-null per slot). */
  cells: Cells;
  /** Current column ordering (regional IDs by column). */
  regionalIds: number[];
  regionals: Regional[];
  /** Map from team name → TeamData (for lat/lng + manual-swap detection). */
  teamLookup: Map<string, TeamData>;
  /**
   * "regional" → cutoff = regional seed N (1-based tier number). Affects
   * tiers N…last.
   *
   * "overall" → cutoff = overall seed N (1-based serpentine index). Affects
   * all positions from serpentine index N-1 to the end of the grid.
   */
  cutoffMode: CutoffMode;
  cutoffValue: number;
  /**
   * If true, the optimizer is free to undo the user's manual swaps inside
   * the affected range. If false (default), only slots that match the
   * committee default get re-optimized.
   */
  overrideSwaps: boolean;
  /**
   * Committee default cells, re-oriented to match the current
   * `regionalIds` order. Used for swap-detection. Pass null to skip the
   * swap check (equivalent to overrideSwaps=true).
   */
  defaultCells: Cells | null;
}

export interface AffectedScope {
  /** Number of free (movable, non-host, non-swap-locked) teams. */
  teams: number;
  /** Number of tiers that have at least one affected slot. */
  rows: number;
  /**
   * Number of slots locked inside the affected range — useful for
   * explaining why "Affects N teams" might be smaller than expected.
   */
  lockedHosts: number;
  lockedSwaps: number;
}

interface TierGroup {
  freeCols: number[];
  hostCols: number[];
  swapCols: number[];
}

/** Reorient committee default cells to match the current column ordering. */
export function reorientCellsToColumns(
  defaultCells: Cells,
  defaultRegionalIds: number[],
  currentRegionalIds: number[]
): Cells {
  const idxByRegional = new Map<number, number>();
  defaultRegionalIds.forEach((id, i) => idxByRegional.set(id, i));
  return defaultCells.map((row) =>
    currentRegionalIds.map((id) => {
      const idx = idxByRegional.get(id);
      return idx !== undefined ? (row[idx] ?? null) : null;
    })
  );
}

/**
 * Translate a (cutoffMode, cutoffValue) pair into the linear serpentine
 * index of the first affected slot.
 */
function getStartLinear(
  cutoffMode: CutoffMode,
  cutoffValue: number,
  numCols: number
): number {
  if (cutoffMode === "regional") {
    return Math.max(0, (cutoffValue - 1) * numCols);
  }
  return Math.max(0, cutoffValue - 1);
}

function buildTierGroups(args: BalanceArgs): Map<number, TierGroup> {
  const {
    cells,
    regionalIds,
    regionals,
    cutoffMode,
    cutoffValue,
    overrideSwaps,
    defaultCells,
  } = args;
  const numCols = regionalIds.length;
  const numTiers = cells.length;
  const totalCells = numCols * numTiers;
  const startLinear = getStartLinear(cutoffMode, cutoffValue, numCols);

  const regionalMap = new Map<number, Regional>();
  for (const r of regionals) regionalMap.set(r.id, r);

  const groups = new Map<number, TierGroup>();
  for (let i = startLinear; i < totalCells; i++) {
    const { row, col } = unserpentineIndex(i, numCols);
    if (!groups.has(row)) {
      groups.set(row, { freeCols: [], hostCols: [], swapCols: [] });
    }
    const g = groups.get(row)!;
    const team = cells[row]?.[col] ?? null;

    if (!team) {
      g.freeCols.push(col);
      continue;
    }

    const regional = regionalMap.get(regionalIds[col]);
    if (regional && regional.host === team) {
      g.hostCols.push(col);
      continue;
    }

    if (!overrideSwaps && defaultCells) {
      const defaultTeam = defaultCells[row]?.[col] ?? null;
      if (defaultTeam !== team) {
        g.swapCols.push(col);
        continue;
      }
    }

    g.freeCols.push(col);
  }
  return groups;
}

export function computeAffectedScope(args: BalanceArgs): AffectedScope {
  const groups = buildTierGroups(args);
  let teams = 0;
  let lockedHosts = 0;
  let lockedSwaps = 0;
  for (const [row, g] of groups.entries()) {
    for (const c of g.freeCols) {
      if (args.cells[row]?.[c]) teams += 1;
    }
    lockedHosts += g.hostCols.length;
    lockedSwaps += g.swapCols.length;
  }
  return { teams, rows: groups.size, lockedHosts, lockedSwaps };
}

/**
 * Brute-force optimal permutation for n×n square distance matrix. Returns
 * the permutation σ such that σ[i] = j means team i goes to column j and
 * sum_i dist[i][σ[i]] is minimised. n ≤ 6 in practice (one regional per
 * grid column), so 720 candidates is fast.
 */
function findOptimalPermutation(dist: number[][]): number[] {
  const n = dist.length;
  if (n <= 1) return n === 0 ? [] : [0];
  let best: number[] = [];
  let bestCost = Infinity;
  const current: number[] = [];
  const used = new Array<boolean>(n).fill(false);

  const permute = (depth: number) => {
    if (depth === n) {
      let cost = 0;
      for (let i = 0; i < n; i++) cost += dist[i][current[i]];
      if (cost < bestCost) {
        bestCost = cost;
        best = current.slice();
      }
      return;
    }
    for (let j = 0; j < n; j++) {
      if (used[j]) continue;
      used[j] = true;
      current.push(j);
      permute(depth + 1);
      current.pop();
      used[j] = false;
    }
  };
  permute(0);
  return best;
}

/**
 * Run the optimizer and return a new `Cells` 2D array. Slots outside the
 * affected range, host slots, and (when !overrideSwaps) manual-swap slots
 * are returned unchanged.
 */
export function applyTravelBalance(args: BalanceArgs): Cells {
  const { cells, regionalIds, regionals, teamLookup } = args;
  const groups = buildTierGroups(args);

  const regionalMap = new Map<number, Regional>();
  for (const r of regionals) regionalMap.set(r.id, r);

  const next: Cells = cells.map((row) => row.slice());

  for (const [row, g] of groups.entries()) {
    // Build the moveable set: teams currently sitting in free cols within
    // this tier. (Empty free cols stay empty.)
    const teamsToMove: { name: string; lat: number; lng: number }[] = [];
    const colsForMove: number[] = [];
    for (const c of g.freeCols) {
      const teamName = next[row][c];
      if (!teamName) continue;
      const t = teamLookup.get(teamName);
      if (!t) continue;
      teamsToMove.push({ name: teamName, lat: t.lat, lng: t.lng });
      colsForMove.push(c);
    }
    if (teamsToMove.length < 2) continue;

    const dist: number[][] = teamsToMove.map((t) =>
      colsForMove.map((c) => {
        const r = regionalMap.get(regionalIds[c]);
        if (!r) return Number.POSITIVE_INFINITY;
        return haversineDistance(t.lat, t.lng, r.lat, r.lng);
      })
    );

    const perm = findOptimalPermutation(dist);
    const newRow = next[row].slice();
    for (let i = 0; i < teamsToMove.length; i++) {
      newRow[colsForMove[perm[i]]] = teamsToMove[i].name;
    }
    next[row] = newRow;
  }

  return next;
}
