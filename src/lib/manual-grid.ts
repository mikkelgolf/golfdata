/**
 * Manual Grid — user-editable Regional S-curve.
 *
 * The grid is a 2D array of team names indexed by `[tier][column]`. The
 * column index maps to a regional via the parallel `regionalIds` array.
 * Rendering mirrors the committee S-curve serpentine: even rows go L→R,
 * odd rows go R→L. We linearise to a 1D array in that serpentine order
 * for drag-and-drop, then re-pack on drop.
 *
 * State is persisted per-gender to localStorage. Stale teams (no longer
 * in the eligible field) are dropped on load.
 */

import { computeScurve, type ScurveAssignment, type ScurveMode } from "@/lib/scurve";
import { haversineDistance } from "@/lib/geo";
import type { TeamData } from "@/data/rankings-men";
import type { Regional } from "@/data/regionals-men-2026";
import type { Championship } from "@/data/championships-men-2026";

export interface ManualGridState {
  /** Column order — regional IDs from left to right. */
  regionalIds: number[];
  /** cells[tier][col] — team name or null for empty slot. */
  cells: (string | null)[][];
}

const STORAGE_VERSION = 1;
const storageKey = (gender: "men" | "women") =>
  `manual-grid-${gender}-v${STORAGE_VERSION}`;

// ---------------------------------------------------------------------------
// Serpentine linearisation
// ---------------------------------------------------------------------------

/** Convert (row, col) into a 1D index using snake-serpentine traversal. */
export function serpentineIndex(row: number, col: number, numCols: number): number {
  const reverse = row % 2 === 1;
  const posInRow = reverse ? numCols - 1 - col : col;
  return row * numCols + posInRow;
}

/** Convert a 1D serpentine index back into (row, col). */
export function unserpentineIndex(
  idx: number,
  numCols: number
): { row: number; col: number } {
  const row = Math.floor(idx / numCols);
  const posInRow = idx % numCols;
  const reverse = row % 2 === 1;
  const col = reverse ? numCols - 1 - posInRow : posInRow;
  return { row, col };
}

/** Flatten cells[][] into a 1D array in serpentine order. */
export function linearizeGrid(cells: (string | null)[][], numCols: number): (string | null)[] {
  const numRows = cells.length;
  const out = new Array<string | null>(numRows * numCols).fill(null);
  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      out[serpentineIndex(r, c, numCols)] = cells[r][c] ?? null;
    }
  }
  return out;
}

/** Re-pack a linearised 1D array into a 2D grid in serpentine order. */
export function relinearizeGrid(
  linear: (string | null)[],
  numCols: number
): (string | null)[][] {
  const numRows = Math.ceil(linear.length / numCols);
  const cells: (string | null)[][] = [];
  for (let r = 0; r < numRows; r++) {
    cells.push(new Array<string | null>(numCols).fill(null));
  }
  for (let i = 0; i < linear.length; i++) {
    const { row, col } = unserpentineIndex(i, numCols);
    if (row < numRows && col < numCols) {
      cells[row][col] = linear[i];
    }
  }
  return cells;
}

// ---------------------------------------------------------------------------
// Default seeding from the committee s-curve
// ---------------------------------------------------------------------------

/**
 * Build the default ManualGridState from the committee s-curve. The
 * resulting columns are sorted by regional strength (Regional 1 leftmost),
 * and each column's cells are filled in seed order top-to-bottom. The total
 * number of slots is rounded up to a full last row so empty trailing slots
 * exist in the grid (e.g. men: 68 teams, 12 rows × 6 cols = 72 slots).
 */
export function defaultGridFromAssignments(
  assignments: ScurveAssignment[],
  regionals: Regional[]
): ManualGridState {
  // Sort regionals by strength (the regional whose best seed is lowest is
  // strongest). Falls back to source order if no assignments yet.
  const minSeedByRegional = new Map<number, number>();
  for (const a of assignments) {
    const cur = minSeedByRegional.get(a.regionalId);
    if (cur === undefined || a.seed < cur) {
      minSeedByRegional.set(a.regionalId, a.seed);
    }
  }
  const ordered = [...regionals].sort((a, b) => {
    const sa = minSeedByRegional.get(a.id) ?? 99;
    const sb = minSeedByRegional.get(b.id) ?? 99;
    return sa - sb;
  });
  const regionalIds = ordered.map((r) => r.id);
  const numCols = regionalIds.length;

  // Group teams by regional, sorted by seed within each regional
  const byRegional = new Map<number, ScurveAssignment[]>();
  for (const id of regionalIds) byRegional.set(id, []);
  for (const a of assignments) {
    byRegional.get(a.regionalId)?.push(a);
  }
  for (const [, arr] of byRegional) arr.sort((a, b) => a.seed - b.seed);

  const numTiers = Math.max(0, ...[...byRegional.values()].map((arr) => arr.length));

  const cells: (string | null)[][] = [];
  for (let r = 0; r < numTiers; r++) {
    const row: (string | null)[] = [];
    for (let c = 0; c < numCols; c++) {
      const arr = byRegional.get(regionalIds[c]) ?? [];
      row.push(arr[r]?.team ?? null);
    }
    cells.push(row);
  }

  return { regionalIds, cells };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/** Validate a stored ManualGridState shape against current data. */
function validateState(
  state: unknown,
  validRegionalIds: Set<number>,
  validTeams: Set<string>
): ManualGridState | null {
  if (!state || typeof state !== "object") return null;
  const s = state as Partial<ManualGridState>;
  if (!Array.isArray(s.regionalIds) || !Array.isArray(s.cells)) return null;
  // Every stored regional ID must still exist
  if (!s.regionalIds.every((id) => typeof id === "number" && validRegionalIds.has(id))) {
    return null;
  }
  if (s.regionalIds.length === 0) return null;
  const numCols = s.regionalIds.length;
  // Cells: all rows same length, entries null or known team
  const cells: (string | null)[][] = [];
  for (const row of s.cells) {
    if (!Array.isArray(row) || row.length !== numCols) return null;
    cells.push(
      row.map((v) => {
        if (v == null) return null;
        if (typeof v !== "string") return null;
        return validTeams.has(v) ? v : null;
      })
    );
  }
  return { regionalIds: s.regionalIds.slice(), cells };
}

export function loadGridState(
  gender: "men" | "women",
  validRegionalIds: Set<number>,
  validTeams: Set<string>
): ManualGridState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(gender));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return validateState(parsed, validRegionalIds, validTeams);
  } catch {
    return null;
  }
}

export function saveGridState(gender: "men" | "women", state: ManualGridState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(gender), JSON.stringify(state));
  } catch {
    // swallow — quota / private browsing
  }
}

export function clearGridState(gender: "men" | "women"): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(gender));
  } catch {
    // swallow
  }
}

// ---------------------------------------------------------------------------
// Build the initial state for a tab — committee defaults merged with any
// localStorage edits.
// ---------------------------------------------------------------------------

export function buildInitialGridState(
  teams: TeamData[],
  regionals: Regional[],
  championships: Championship[] | undefined,
  gender: "men" | "women",
  mode: ScurveMode = "committee"
): ManualGridState {
  const assignments = computeScurve(teams, regionals, mode, gender, championships);
  const fallback = defaultGridFromAssignments(assignments, regionals);
  if (typeof window === "undefined") return fallback;
  const validRegionalIds = new Set(regionals.map((r) => r.id));
  const validTeams = new Set(teams.map((t) => t.team));
  const stored = loadGridState(gender, validRegionalIds, validTeams);
  if (stored) {
    // If shape changed (e.g. a new regional was added) prefer the fallback.
    if (
      stored.regionalIds.length === fallback.regionalIds.length &&
      stored.cells.length === fallback.cells.length
    ) {
      return stored;
    }
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Derive ScurveAssignment[] from a manual grid — feeds BreakdownView.
// ---------------------------------------------------------------------------

/**
 * Walk the grid in serpentine order; for each filled slot emit a
 * ScurveAssignment with seed = position-in-traversal + 1 and regionalId
 * pulled from the column's header.
 */
export function deriveAssignments(
  state: ManualGridState,
  teamLookup: Map<string, TeamData>,
  regionalMap: Map<number, Regional>
): ScurveAssignment[] {
  const numCols = state.regionalIds.length;
  if (numCols === 0) return [];
  const linear = linearizeGrid(state.cells, numCols);
  const out: ScurveAssignment[] = [];
  let seed = 0;
  for (let i = 0; i < linear.length; i++) {
    const teamName = linear[i];
    if (!teamName) continue;
    const team = teamLookup.get(teamName);
    if (!team) continue;
    const { col } = unserpentineIndex(i, numCols);
    const regionalId = state.regionalIds[col];
    const regional = regionalMap.get(regionalId);
    seed += 1;
    out.push({
      ...team,
      seed,
      regionalId,
      distanceMiles: regional
        ? haversineDistance(team.lat, team.lng, regional.lat, regional.lng)
        : 0,
    });
  }
  return out;
}
