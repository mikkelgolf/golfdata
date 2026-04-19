// Program percentile ranks across the D1 field for the team detail page.
//
// Input sources:
//   - data/regionals-history.ts   (per-year RegionalFinish rows, 1989->current)
//   - data/rankings-men.ts        (current Clippd rankings — men)
//   - data/rankings-women.ts      (current Clippd rankings — women)
//   - data/all-teams-men-2026.ts  (full D1 men's roster — includes unranked)
//   - data/all-teams-women-2026.ts
//
// For each team we compute 4 integer stats:
//   apps          — distinct seasons the program appeared at a regional
//   nationals     — distinct seasons the program advanced to nationals
//   regionalWins  — regional-title count
//   bestFinish    — lowest regional position ever (inverted: lower number = better)
//
// Percentile = (count of teams with a WORSE-OR-EQUAL stat / total) * 100.
// For bestFinish we invert — a lower number is better, so the comparison flips.
// Teams that never appeared get 0 percentile on apps/nationals/wins and a
// bestFinish percentile of 0 (worst).
//
// Result is memoized per-gender at module scope so re-entry is free.

import type { Gender } from "@/data/records-types";
import { regionalsHistory } from "@/data/regionals-history";
import { championshipsHistory } from "@/data/championships-history";
import { isChampion } from "@/lib/streaks";
import { rankingsMen } from "@/data/rankings-men";
import { rankingsWomen } from "@/data/rankings-women";
import { allTeamsMen2026 } from "@/data/all-teams-men-2026";
import { allTeamsWomen2026 } from "@/data/all-teams-women-2026";

export interface TeamPercentiles {
  apps: number;
  nationals: number;
  regionalWins: number;
  bestFinish: number;
  /** NCAA Championship appearance count percentile (higher is better). */
  ncaaApps: number;
  /** NCAA Championship wins percentile. */
  ncaaWins: number;
  /** NCAA Championship best-finish percentile (lower position = higher pct). */
  ncaaBest: number;
}

interface PercentileSnapshot {
  byTeam: Map<string, TeamPercentiles>;
}

interface RawStats {
  apps: number;
  nationals: number;
  regionalWins: number;
  // null means "never appeared" — ranked worst on bestFinish.
  bestFinish: number | null;
  ncaaApps: number;
  ncaaWins: number;
  /** Null = never appeared at NCAAs (worst). */
  ncaaBest: number | null;
}

const cache = new Map<Gender, PercentileSnapshot>();

function collectUniverse(gender: Gender): Set<string> {
  // Universe = every D1 team this season (ranked + unranked) UNION every
  // team that's ever appeared at a regional UNION every team in the NCAA
  // Championships dataset. That way a program with a strong history but no
  // 2026 roster still lands somewhere on the curve.
  const teams = new Set<string>();
  const rankings = gender === "men" ? rankingsMen : rankingsWomen;
  const allTeams = gender === "men" ? allTeamsMen2026 : allTeamsWomen2026;
  for (const t of rankings) teams.add(t.team);
  for (const t of allTeams) teams.add(t.team);
  for (const r of regionalsHistory) {
    if (r.gender === gender) teams.add(r.team);
  }
  for (const r of championshipsHistory) {
    if (r.gender === gender) teams.add(r.team);
  }
  return teams;
}

function rawStatsFor(team: string, gender: Gender): RawStats {
  const rows = regionalsHistory.filter(
    (r) => r.team === team && r.gender === gender
  );
  const ncaaRows = championshipsHistory.filter(
    (r) => r.team === team && r.gender === gender
  );
  const years = new Set<number>();
  const advancedYears = new Set<number>();
  let wins = 0;
  const positions: number[] = [];
  for (const r of rows) {
    years.add(r.year);
    if (r.advanced) advancedYears.add(r.year);
    if (r.position === "1") wins += 1;
    const n = parseInt(r.position, 10);
    if (Number.isFinite(n) && n > 0) positions.push(n);
  }
  const ncaaYears = new Set<number>();
  let ncaaWins = 0;
  const ncaaPositions: number[] = [];
  for (const r of ncaaRows) {
    ncaaYears.add(r.year);
    if (isChampion(r)) ncaaWins += 1;
    if (r.positionNoTies !== null) ncaaPositions.push(r.positionNoTies);
  }
  return {
    apps: years.size,
    nationals: advancedYears.size,
    regionalWins: wins,
    bestFinish: positions.length > 0 ? Math.min(...positions) : null,
    ncaaApps: ncaaYears.size,
    ncaaWins,
    ncaaBest: ncaaPositions.length > 0 ? Math.min(...ncaaPositions) : null,
  };
}

/**
 * Percentile: "this team is at or better than X% of the field on this stat."
 * Higher-is-better stat (apps, nationals, wins):
 *   pct = count(others.stat <= this.stat) / total * 100
 * Lower-is-better stat (bestFinish, null sentinel = worst):
 *   pct = count(others.stat >= this.stat || others.stat === null) / total * 100
 */
function percentileHigh(values: number[], target: number): number {
  if (values.length === 0) return 0;
  let atOrBelow = 0;
  for (const v of values) {
    if (v <= target) atOrBelow += 1;
  }
  return (atOrBelow / values.length) * 100;
}

function percentileLow(values: Array<number | null>, target: number | null): number {
  // For bestFinish: target null => team never appeared, => worst percentile.
  if (values.length === 0) return 0;
  if (target === null) return 0;
  let atOrAbove = 0;
  for (const v of values) {
    if (v === null || v >= target) atOrAbove += 1;
  }
  return (atOrAbove / values.length) * 100;
}

function buildSnapshot(gender: Gender): PercentileSnapshot {
  const universe = collectUniverse(gender);
  const raw = new Map<string, RawStats>();
  for (const team of universe) {
    raw.set(team, rawStatsFor(team, gender));
  }

  const appsArr: number[] = [];
  const nationalsArr: number[] = [];
  const winsArr: number[] = [];
  const bestFinishArr: Array<number | null> = [];
  const ncaaAppsArr: number[] = [];
  const ncaaWinsArr: number[] = [];
  const ncaaBestArr: Array<number | null> = [];
  for (const s of raw.values()) {
    appsArr.push(s.apps);
    nationalsArr.push(s.nationals);
    winsArr.push(s.regionalWins);
    bestFinishArr.push(s.bestFinish);
    ncaaAppsArr.push(s.ncaaApps);
    ncaaWinsArr.push(s.ncaaWins);
    ncaaBestArr.push(s.ncaaBest);
  }

  const byTeam = new Map<string, TeamPercentiles>();
  for (const [team, s] of raw.entries()) {
    byTeam.set(team, {
      apps: percentileHigh(appsArr, s.apps),
      nationals: percentileHigh(nationalsArr, s.nationals),
      regionalWins: percentileHigh(winsArr, s.regionalWins),
      bestFinish: percentileLow(bestFinishArr, s.bestFinish),
      ncaaApps: percentileHigh(ncaaAppsArr, s.ncaaApps),
      ncaaWins: percentileHigh(ncaaWinsArr, s.ncaaWins),
      ncaaBest: percentileLow(ncaaBestArr, s.ncaaBest),
    });
  }

  return { byTeam };
}

export function computeAllPercentiles(gender: Gender): PercentileSnapshot {
  const hit = cache.get(gender);
  if (hit) return hit;
  const snap = buildSnapshot(gender);
  cache.set(gender, snap);
  return snap;
}

export function getTeamPercentiles(
  team: string,
  gender: Gender
): TeamPercentiles | null {
  return computeAllPercentiles(gender).byTeam.get(team) ?? null;
}
