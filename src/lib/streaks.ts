import type {
  ChampionshipFinish,
  Gender,
  RegionalFinish,
} from "@/data/records-types";
import { regionalsHistory } from "@/data/regionals-history";
import { championshipsHistory } from "@/data/championships-history";

export const MOST_RECENT_SEASON = Math.max(
  ...regionalsHistory.map((r) => r.year)
);

// Years where no NCAA postseason was played and no team can have appeared.
// 2020 was cancelled mid-season (COVID). For streak purposes we treat it as
// a pass-through: a 2019→2021 jump still counts as consecutive. The display
// layer also uses this set to render these years as a distinct "cancelled"
// cell (gray / dashed) rather than a "missed" (red) one.
export const CANCELLED_YEARS = new Set<number>([2020]);

export function isCancelled(year: number): boolean {
  return CANCELLED_YEARS.has(year);
}

function nextExpectedYear(prev: number): number {
  let y = prev + 1;
  while (CANCELLED_YEARS.has(y)) y += 1;
  return y;
}

export interface StreakResult {
  active: number;
  longest: number;
  longestSpan: [number, number] | null;
}

export interface TeamHistoricalStats {
  team: string;
  gender: Gender;
  regionalStreak: StreakResult;
  nationalStreak: StreakResult;
  regionalWins: number;
  totalAppearances: number;
  totalAdvancements: number;
  bestFinish: number | null;
}

export interface TeamChampionshipStats {
  team: string;
  gender: Gender;
  /** Distinct years present at the NCAA Championship. */
  appearances: number;
  /** Years where position === "1". */
  wins: number;
  /** Best stroke-play finish (position-no-ties), lower is better. */
  bestFinish: number | null;
  /** Formatted best-finish label, preserving "T3" when ties exist at the min. */
  bestFinishLabel: string | null;
  /** Top-8 / match-play-era semifinalists or better? Count of years in the match-play bracket. */
  topEight: number;
  /** Quarterfinal + semifinal wins in match-play era. */
  matchPlayWins: number;
  /** Consecutive-years present streak — same shape as regional streak. */
  appearanceStreak: StreakResult;
}

function streakOver(years: number[]): StreakResult {
  if (years.length === 0) {
    return { active: 0, longest: 0, longestSpan: null };
  }
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  let longest = 1;
  let longestStart = sorted[0];
  let longestEnd = sorted[0];
  let curStart = sorted[0];
  let curLen = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === nextExpectedYear(sorted[i - 1])) {
      curLen += 1;
      if (curLen > longest) {
        longest = curLen;
        longestStart = curStart;
        longestEnd = sorted[i];
      }
    } else {
      curStart = sorted[i];
      curLen = 1;
    }
  }
  let active = 0;
  if (sorted[sorted.length - 1] === MOST_RECENT_SEASON) {
    active = 1;
    for (let i = sorted.length - 2; i >= 0; i -= 1) {
      if (nextExpectedYear(sorted[i]) === sorted[i + 1]) active += 1;
      else break;
    }
  }
  return { active, longest, longestSpan: [longestStart, longestEnd] };
}

function filterRows(team: string, gender: Gender): RegionalFinish[] {
  return regionalsHistory.filter(
    (r) => r.team === team && r.gender === gender
  );
}

export function computeRegionalStreak(team: string, gender: Gender): StreakResult {
  return streakOver(filterRows(team, gender).map((r) => r.year));
}

export function computeNationalStreak(team: string, gender: Gender): StreakResult {
  return streakOver(
    filterRows(team, gender).filter((r) => r.advanced).map((r) => r.year)
  );
}

export function computeRegionalWins(team: string, gender: Gender): number {
  return filterRows(team, gender).filter((r) => r.position === "1").length;
}

export function computeTeamStats(team: string, gender: Gender): TeamHistoricalStats {
  const rows = filterRows(team, gender);
  const years = rows.map((r) => r.year);
  const advancedYears = rows.filter((r) => r.advanced).map((r) => r.year);
  const positions = rows
    .map((r) => parseInt(r.position, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return {
    team,
    gender,
    regionalStreak: streakOver(years),
    nationalStreak: streakOver(advancedYears),
    regionalWins: rows.filter((r) => r.position === "1").length,
    totalAppearances: new Set(years).size,
    totalAdvancements: new Set(advancedYears).size,
    bestFinish: positions.length > 0 ? Math.min(...positions) : null,
  };
}

let cached: TeamHistoricalStats[] | null = null;

export function computeAllTeamStats(): TeamHistoricalStats[] {
  if (cached) return cached;
  const keys = new Set<string>();
  for (const r of regionalsHistory) {
    keys.add(r.gender + "|" + r.team);
  }
  const out: TeamHistoricalStats[] = [];
  for (const key of keys) {
    const idx = key.indexOf("|");
    const gender = key.slice(0, idx) as Gender;
    const team = key.slice(idx + 1);
    out.push(computeTeamStats(team, gender));
  }
  cached = out;
  return out;
}

function filterChampionships(
  team: string,
  gender: Gender
): ChampionshipFinish[] {
  return championshipsHistory.filter(
    (r) => r.team === team && r.gender === gender
  );
}

/**
 * True when this row represents a championship-winning season.
 * Pre-2009 the Championship was decided on stroke play alone — position "1"
 * means they won. From 2009 on, match play decides it: a team can be the
 * #1 seed and still lose the final, or seed #8 and win it. `wonChampionship`
 * is the authoritative post-2009 signal.
 */
export function isChampion(r: ChampionshipFinish): boolean {
  if (r.matchPlayEra) return r.wonChampionship === true;
  return r.position === "1";
}

export function computeTeamChampionshipStats(
  team: string,
  gender: Gender
): TeamChampionshipStats {
  const rows = filterChampionships(team, gender);
  const years = rows.map((r) => r.year);
  let wins = 0;
  let topEight = 0;
  let mpWins = 0;
  let bestFinish: number | null = null;
  // Capture raw label ("1", "T3") at the best-finish position so we can
  // surface "T3" rather than collapsing to "3".
  let bestFinishLabel: string | null = null;
  for (const r of rows) {
    if (isChampion(r)) wins += 1;
    if (r.matchPlaySeed !== null) topEight += 1;
    if (r.wonQuarterfinal === true) mpWins += 1;
    if (r.wonSemifinal === true) mpWins += 1;
    if (r.positionNoTies !== null) {
      if (bestFinish === null || r.positionNoTies < bestFinish) {
        bestFinish = r.positionNoTies;
        bestFinishLabel = r.position;
      } else if (r.positionNoTies === bestFinish) {
        // Prefer "T" label when both outright and tied finishes exist at
        // the same rank — ties are cleaner to show.
        if (bestFinishLabel && !bestFinishLabel.startsWith("T") && r.position.startsWith("T")) {
          bestFinishLabel = r.position;
        }
      }
    }
  }
  return {
    team,
    gender,
    appearances: new Set(years).size,
    wins,
    bestFinish,
    bestFinishLabel,
    topEight,
    matchPlayWins: mpWins,
    appearanceStreak: streakOver(years),
  };
}

let championshipCache: TeamChampionshipStats[] | null = null;

export function computeAllChampionshipStats(): TeamChampionshipStats[] {
  if (championshipCache) return championshipCache;
  const keys = new Set<string>();
  for (const r of championshipsHistory) {
    keys.add(r.gender + "|" + r.team);
  }
  const out: TeamChampionshipStats[] = [];
  for (const key of keys) {
    const idx = key.indexOf("|");
    const gender = key.slice(0, idx) as Gender;
    const team = key.slice(idx + 1);
    out.push(computeTeamChampionshipStats(team, gender));
  }
  championshipCache = out;
  return out;
}
