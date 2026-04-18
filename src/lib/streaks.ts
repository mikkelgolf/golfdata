import type { Gender, RegionalFinish } from "@/data/records-types";
import { regionalsHistory } from "@/data/regionals-history";

export const MOST_RECENT_SEASON = Math.max(
  ...regionalsHistory.map((r) => r.year)
);

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
    if (sorted[i] === sorted[i - 1] + 1) {
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
      if (sorted[i] === sorted[i + 1] - 1) active += 1;
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
