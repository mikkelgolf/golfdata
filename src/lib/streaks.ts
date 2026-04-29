import type {
  ChampionshipFinish,
  Gender,
  RegionalFinish,
} from "@/data/records-types";
import { regionalsHistory } from "@/data/regionals-history";
import { championshipsHistory } from "@/data/championships-history";
import { regionalsRich } from "@/data/regionals-rich";
import { getSeedingWindow } from "@/data/regionals-seeding";
import { teamMatches } from "@/lib/team-aliases";

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
  /** Years where position is "1" or "T1" (Regionals share the title on ties). */
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
    (r) => r.gender === gender && teamMatches(r.team, team, gender)
  );
}

/**
 * A Regional finish counts as a win when the team finished 1st outright
 * ("1") or tied for 1st ("T1"). Co-champions are common at Regionals and
 * both share the trophy.
 */
export function isRegionalWin(position: string): boolean {
  return position === "1" || position === "T1";
}

/**
 * Years the team effectively advanced from their Regional to the NCAA
 * Championship. Combines three signals (any truthy = advanced):
 *   1. `rich.teamAdvanced === true` — the spreadsheet's "Team Advanced"
 *      column. The most authoritative signal, but only available for
 *      years inside the rich-data window (men 2002+, women 2000+) and
 *      only after the column-aware Python ingest has been re-run.
 *   2. team appearance in championshipsHistory that year — strong
 *      cross-check, since being in the bracket implies they advanced.
 *   3. `basic.advanced === true` (position <= 5) — pre-modern fallback
 *      for years outside the rich window. Imperfect (the number of
 *      advancing seeds varied by era) but the only signal we have.
 * Requires a regional row to exist for the year, so pre-Regional-era NCAA
 * appearances aren't double-counted as "advanced" (there was no Regional to
 * advance from).
 * 2020 is absent from all datasets (COVID cancellation) and is skipped by
 * the streak code separately via `nextExpectedYear`.
 */
function effectiveAdvancedYears(team: string, gender: Gender): number[] {
  const ncaaYears = new Set(
    championshipsHistory
      .filter((r) => r.gender === gender && teamMatches(r.team, team, gender))
      .map((r) => r.year)
  );
  const richAdvancedYears = new Set(
    regionalsRich
      .filter(
        (r) =>
          r.gender === gender &&
          r.teamAdvanced === true &&
          teamMatches(r.team, team, gender)
      )
      .map((r) => r.year)
  );
  const seedingWindow = getSeedingWindow(gender).years;
  return filterRows(team, gender)
    .filter((r) =>
      didAdvanceFromRegional({
        richTeamAdvanced: richAdvancedYears.has(r.year) ? true : null,
        ncaaAppearance: ncaaYears.has(r.year),
        basicAdvanced: r.advanced,
        yearInSeedingWindow: seedingWindow.has(r.year),
      })
    )
    .map((r) => r.year);
}

/**
 * Stateless predicate for "did the team advance?" — used by table /
 * grid components that already have the relevant lookups in hand and
 * don't want to refilter the global arrays. Same precedence rules as
 * `effectiveAdvancedYears`, just without the data-fetching half.
 *
 * Inside the seeding-data window the rich sheet's "Team Advanced"
 * column is authoritative: only rows with `teamAdvanced === true` (or
 * an NCAA championship appearance as a defensive secondary signal)
 * count as advanced. The basic position-based `advanced` flag is
 * IGNORED inside the window — that flag was a "top-N seed advanced"
 * heuristic and gets edge cases wrong, e.g. a team that finished in a
 * top advancing slot but lost a play-off (Texas A&M women 2025,
 * Florida women 2022).
 *
 * Outside the window — i.e. older years where the sheet's column is
 * empty across the board — fall back to the OR of all available
 * signals, since we have no authoritative truth there.
 */
export function didAdvanceFromRegional(opts: {
  richTeamAdvanced?: boolean | null;
  ncaaAppearance?: boolean;
  basicAdvanced?: boolean;
  yearInSeedingWindow?: boolean;
}): boolean {
  if (opts.yearInSeedingWindow) {
    return opts.richTeamAdvanced === true || Boolean(opts.ncaaAppearance);
  }
  return Boolean(
    opts.richTeamAdvanced === true ||
      opts.ncaaAppearance ||
      opts.basicAdvanced
  );
}

export function computeRegionalStreak(team: string, gender: Gender): StreakResult {
  return streakOver(filterRows(team, gender).map((r) => r.year));
}

export function computeNationalStreak(team: string, gender: Gender): StreakResult {
  return streakOver(effectiveAdvancedYears(team, gender));
}

export function computeRegionalWins(team: string, gender: Gender): number {
  return filterRows(team, gender).filter((r) => isRegionalWin(r.position)).length;
}

export function computeTeamStats(team: string, gender: Gender): TeamHistoricalStats {
  const rows = filterRows(team, gender);
  const years = rows.map((r) => r.year);
  const advancedYears = effectiveAdvancedYears(team, gender);
  const positions = rows
    .map((r) => parseInt(r.position, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return {
    team,
    gender,
    regionalStreak: streakOver(years),
    nationalStreak: streakOver(advancedYears),
    regionalWins: rows.filter((r) => isRegionalWin(r.position)).length,
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
    (r) => r.gender === gender && teamMatches(r.team, team, gender)
  );
}

/**
 * True when this row represents a championship-winning season.
 * Pre-2009 the Championship was decided on stroke play alone — position "1"
 * or "T1" means they won (ties yield co-champions; e.g. 1940 Princeton/LSU
 * and 1942 LSU/Stanford). From 2009 on, match play decides it: a team can
 * be the #1 seed and still lose the final, or seed #8 and win it.
 * `wonChampionship` is the authoritative post-2009 signal.
 */
export function isChampion(r: ChampionshipFinish): boolean {
  if (r.matchPlayEra) return r.wonChampionship === true;
  return r.position === "1" || r.position === "T1";
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
